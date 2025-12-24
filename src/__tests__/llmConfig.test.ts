import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLLMConfig, isLLMConfigured, createLLMClient, type LLMConfig } from '../llmConfig.js';

describe('LLM Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLLMConfig', () => {
    it('should return null when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      const config = getLLMConfig();
      expect(config).toBeNull();
    });

    it('should return config with defaults when only API key is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_MODEL;

      const config = getLLMConfig();
      
      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('test-key');
      expect(config?.baseUrl).toBe('https://api.openai.com/v1');
      expect(config?.model).toBe('gpt-4o-mini');
    });

    it('should use custom base URL when provided', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_BASE_URL = 'https://custom.api.com/v1';

      const config = getLLMConfig();
      
      expect(config?.baseUrl).toBe('https://custom.api.com/v1');
    });

    it('should use custom model when provided', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = getLLMConfig();
      
      expect(config?.model).toBe('gpt-4');
    });
  });

  describe('isLLMConfigured', () => {
    it('should return false when API key is not set', () => {
      delete process.env.OPENAI_API_KEY;
      expect(isLLMConfigured()).toBe(false);
    });

    it('should return true when API key is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(isLLMConfigured()).toBe(true);
    });
  });
});

describe('LLM Client', () => {
  const mockConfig: LLMConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.test.com/v1',
    model: 'test-model'
  };

  describe('createLLMClient', () => {
    it('should create a client with analyzeJSVMP method', () => {
      const client = createLLMClient(mockConfig);
      expect(client).toBeDefined();
      expect(typeof client.analyzeJSVMP).toBe('function');
    });
  });

  describe('analyzeJSVMP', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should send request with correct structure', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: '测试摘要',
                regions: []
              })
            }
          }
        ]
      };

      let capturedRequest: any = null;

      global.fetch = vi.fn(async (url, options) => {
        capturedRequest = { url, options };
        return {
          ok: true,
          json: async () => mockResponse
        } as Response;
      });

      const client = createLLMClient(mockConfig);
      await client.analyzeJSVMP('test code');

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest.url).toBe('https://api.test.com/v1/chat/completions');
      expect(capturedRequest.options.method).toBe('POST');
      expect(capturedRequest.options.headers['Authorization']).toBe('Bearer test-api-key');
      expect(capturedRequest.options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(capturedRequest.options.body);
      expect(body.model).toBe('test-model');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toContain('test code');
    });

    it('should include JSVMP detection rules in system prompt', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"summary":"test","regions":[]}' } }]
      };

      let systemPrompt = '';

      global.fetch = vi.fn(async (url, options: any) => {
        const body = JSON.parse(options.body);
        systemPrompt = body.messages[0].content;
        return {
          ok: true,
          json: async () => mockResponse
        } as Response;
      });

      const client = createLLMClient(mockConfig);
      await client.analyzeJSVMP('test code');

      // Verify system prompt contains key JSVMP concepts
      expect(systemPrompt).toContain('JSVMP');
      expect(systemPrompt).toContain('虚拟栈');
      expect(systemPrompt).toContain('分发器');
      expect(systemPrompt).toContain('ultra_high');
      expect(systemPrompt).toContain('high');
      expect(systemPrompt).toContain('medium');
      expect(systemPrompt).toContain('low');
    });

    it('should return LLM response content', async () => {
      const expectedContent = JSON.stringify({
        summary: '检测到JSVMP',
        regions: [{ start: 1, end: 10, type: 'Switch Dispatcher', confidence: 'high', description: '测试' }]
      });

      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: expectedContent } }]
        })
      } as Response));

      const client = createLLMClient(mockConfig);
      const result = await client.analyzeJSVMP('test code');

      expect(result).toBe(expectedContent);
    });

    it('should throw error when API request fails', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      } as Response));

      const client = createLLMClient(mockConfig);

      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('LLM 请求失败');
      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('401');
    });

    it('should throw error when response is missing choices', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({})
      } as Response));

      const client = createLLMClient(mockConfig);

      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('缺少 choices 或 message 字段');
    });

    it('should throw error when response content is not a string', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 123 } }]
        })
      } as Response));

      const client = createLLMClient(mockConfig);

      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('message.content 不是字符串');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      });

      const client = createLLMClient(mockConfig);

      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('LLM 请求失败');
      await expect(client.analyzeJSVMP('test code')).rejects.toThrow('Network error');
    });
  });
});
