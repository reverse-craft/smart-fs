import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { formatCodeForAnalysis } from '../tools/aiFindJsvmpDispatcher.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'smart-fs-ai-find-jsvmp-dispatcher-test');

describe('formatCodeForAnalysis', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should format code with line numbers and source positions', async () => {
    // Create a test file
    const testFile = path.join(TEST_DIR, 'test.js');
    const code = 'const a=1;const b=2;function add(x,y){return x+y}';
    await fs.writeFile(testFile, code, 'utf-8');

    const result = await formatCodeForAnalysis(testFile, 1, 10);

    // Verify result structure
    expect(result.content).toBeDefined();
    expect(result.totalLines).toBeGreaterThan(0);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBeLessThanOrEqual(result.totalLines);

    // Verify format: each line should have "LineNo SourceLoc Code" format
    const lines = result.content.split('\n');
    expect(lines.length).toBeGreaterThan(0);
    
    // Check first line has proper format (5-digit line number + space + source position)
    const firstLine = lines[0];
    expect(firstLine).toMatch(/^\s*\d+\s+/);
  });

  it('should adjust line range boundaries when exceeding file limits', async () => {
    const testFile = path.join(TEST_DIR, 'boundary.js');
    const code = 'const x=1;';
    await fs.writeFile(testFile, code, 'utf-8');

    // Request lines beyond file boundaries
    const result = await formatCodeForAnalysis(testFile, -5, 1000);

    // Should adjust to valid boundaries
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(result.totalLines);
    expect(result.endLine).toBeLessThanOrEqual(10); // Small file
  });

  it('should truncate long strings in code', async () => {
    const testFile = path.join(TEST_DIR, 'longstring.js');
    const longString = 'a'.repeat(500);
    const code = `const str = "${longString}";`;
    await fs.writeFile(testFile, code, 'utf-8');

    const result = await formatCodeForAnalysis(testFile, 1, 10, 100);

    // The formatted content should contain truncation marker
    expect(result.content).toContain('TRUNCATED');
  });
});


describe('aiFindJsvmpDispatcher tool error handling', () => {
  let aiFindJsvmpDispatcher: any;
  const originalEnv = process.env;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    const mod = await import('../tools/aiFindJsvmpDispatcher.js');
    aiFindJsvmpDispatcher = mod.aiFindJsvmpDispatcher;
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return error message when API key is not configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await aiFindJsvmpDispatcher.handler({
      file_path: 'test.js',
      start_line: 1,
      end_line: 10
    });

    expect(result).toContain('错误：未配置 LLM');
    expect(result).toContain('OPENAI_API_KEY');
  });

  it('should return error message when file does not exist', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const result = await aiFindJsvmpDispatcher.handler({
      file_path: '/nonexistent/file/path.js',
      start_line: 1,
      end_line: 10
    });

    expect(result).toContain('错误：文件不存在');
    expect(result).toContain('/nonexistent/file/path.js');
  });

  it('should return error message when LLM request fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    // Create a test file
    const testFile = path.join(TEST_DIR, 'error-test.js');
    await fs.writeFile(testFile, 'const x = 1;', 'utf-8');

    // Mock fetch to simulate API failure
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response));

    const result = await aiFindJsvmpDispatcher.handler({
      file_path: testFile,
      start_line: 1,
      end_line: 10
    });

    expect(result).toContain('错误');
    expect(result).toContain('LLM 请求失败');

    global.fetch = originalFetch;
  });

  it('should return error message when JSON parsing fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    // Create a test file
    const testFile = path.join(TEST_DIR, 'json-error-test.js');
    await fs.writeFile(testFile, 'const x = 1;', 'utf-8');

    // Mock fetch to return invalid JSON
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'not valid json at all'
          }
        }]
      })
    } as Response));

    const result = await aiFindJsvmpDispatcher.handler({
      file_path: testFile,
      start_line: 1,
      end_line: 10
    });

    expect(result).toContain('错误');
    expect(result).toContain('无法解析 LLM 响应');

    global.fetch = originalFetch;
  });

  it('should return error message when LLM response is missing required fields', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    // Create a test file
    const testFile = path.join(TEST_DIR, 'missing-fields-test.js');
    await fs.writeFile(testFile, 'const x = 1;', 'utf-8');

    // Mock fetch to return JSON missing required fields
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ regions: [] }) // Missing summary
          }
        }]
      })
    } as Response));

    const result = await aiFindJsvmpDispatcher.handler({
      file_path: testFile,
      start_line: 1,
      end_line: 10
    });

    expect(result).toContain('错误');
    expect(result).toContain('缺少必需字段');

    global.fetch = originalFetch;
  });
});

describe('parseDetectionResult', () => {
  // Import the function dynamically to test it
  let parseDetectionResult: any;

  beforeAll(async () => {
    const mod = await import('../tools/aiFindJsvmpDispatcher.js');
    parseDetectionResult = mod.parseDetectionResult;
  });

  it('should parse valid detection result JSON', () => {
    const validJson = JSON.stringify({
      summary: '检测到JSVMP保护代码',
      regions: [
        {
          start: 10,
          end: 50,
          type: 'Switch Dispatcher',
          confidence: 'high',
          description: '大型switch语句'
        },
        {
          start: 60,
          end: 80,
          type: 'Stack Operation',
          confidence: 'ultra_high',
          description: '虚拟栈操作'
        }
      ]
    });

    const result = parseDetectionResult(validJson);

    expect(result.summary).toBe('检测到JSVMP保护代码');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].start).toBe(10);
    expect(result.regions[0].end).toBe(50);
    expect(result.regions[0].type).toBe('Switch Dispatcher');
    expect(result.regions[0].confidence).toBe('high');
    expect(result.regions[1].type).toBe('Stack Operation');
    expect(result.regions[1].confidence).toBe('ultra_high');
  });

  it('should reject invalid JSON', () => {
    expect(() => parseDetectionResult('not json')).toThrow('无法解析 LLM 响应');
  });

  it('should reject JSON missing summary field', () => {
    const invalidJson = JSON.stringify({
      regions: []
    });

    expect(() => parseDetectionResult(invalidJson)).toThrow('缺少必需字段: summary');
  });

  it('should reject JSON missing regions field', () => {
    const invalidJson = JSON.stringify({
      summary: 'test'
    });

    expect(() => parseDetectionResult(invalidJson)).toThrow('缺少必需字段: regions');
  });

  it('should reject region with missing start field', () => {
    const invalidJson = JSON.stringify({
      summary: 'test',
      regions: [{
        end: 10,
        type: 'Switch Dispatcher',
        confidence: 'high',
        description: 'test'
      }]
    });

    expect(() => parseDetectionResult(invalidJson)).toThrow('缺少必需字段: start');
  });

  it('should reject region with invalid type enum', () => {
    const invalidJson = JSON.stringify({
      summary: 'test',
      regions: [{
        start: 1,
        end: 10,
        type: 'Invalid Type',
        confidence: 'high',
        description: 'test'
      }]
    });

    expect(() => parseDetectionResult(invalidJson)).toThrow('type 值无效');
  });

  it('should reject region with invalid confidence enum', () => {
    const invalidJson = JSON.stringify({
      summary: 'test',
      regions: [{
        start: 1,
        end: 10,
        type: 'Switch Dispatcher',
        confidence: 'invalid_level',
        description: 'test'
      }]
    });

    expect(() => parseDetectionResult(invalidJson)).toThrow('confidence 值无效');
  });

  it('should accept all valid detection types', () => {
    const types = ['If-Else Dispatcher', 'Switch Dispatcher', 'Instruction Array', 'Stack Operation'];
    
    types.forEach(type => {
      const json = JSON.stringify({
        summary: 'test',
        regions: [{
          start: 1,
          end: 10,
          type: type,
          confidence: 'high',
          description: 'test'
        }]
      });

      const result = parseDetectionResult(json);
      expect(result.regions[0].type).toBe(type);
    });
  });

  it('should accept all valid confidence levels', () => {
    const levels = ['ultra_high', 'high', 'medium', 'low'];
    
    levels.forEach(level => {
      const json = JSON.stringify({
        summary: 'test',
        regions: [{
          start: 1,
          end: 10,
          type: 'Switch Dispatcher',
          confidence: level,
          description: 'test'
        }]
      });

      const result = parseDetectionResult(json);
      expect(result.regions[0].confidence).toBe(level);
    });
  });
});
