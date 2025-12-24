/**
 * LLM Configuration Module
 * Handles reading and validating LLM configuration from environment variables
 */

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 从环境变量读取 LLM 配置
 * @returns LLMConfig | null (null 表示未配置)
 */
export function getLLMConfig(): LLMConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  
  // API Key is required
  if (!apiKey) {
    return null;
  }
  
  // Use defaults for optional configuration
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  
  return {
    apiKey,
    baseUrl,
    model
  };
}

/**
 * 检查 LLM 是否已配置
 */
export function isLLMConfigured(): boolean {
  return getLLMConfig() !== null;
}

/**
 * LLM Client Interface
 */
export interface LLMClient {
  /**
   * 发送 JSVMP 检测请求到 LLM
   * @param formattedCode 格式化后的代码
   * @returns LLM 返回的原始 JSON 字符串
   */
  analyzeJSVMP(formattedCode: string): Promise<string>;
}

/**
 * 构建 JSVMP 检测系统提示词
 */
function buildJSVMPSystemPrompt(): string {
  return `你是一个专业的 JavaScript 逆向工程专家，专门识别 JSVMP（JavaScript Virtual Machine Protection）保护代码。

JSVMP 是一种代码保护技术，将 JavaScript 代码转换为字节码，并通过虚拟机执行。典型特征包括：

1. **虚拟栈（Virtual Stack）**：中央数组用于存储操作数和结果
2. **分发器（Dispatcher）**：大型 switch 语句或嵌套 if-else 链，根据指令码执行不同操作
3. **指令数组（Instruction Array）**：存储字节码指令的数组
4. **主循环（Main Loop）**：while 循环持续执行指令

检测规则：

**Ultra High 置信度**：
- 同时出现：主循环 + 分发器 + 栈操作
- 分发器有 >20 个 case 或 >10 层嵌套
- 明确的栈操作模式（push/pop/数组索引）

**High 置信度**：
- 独立的大型分发器结构（>20 case 的 switch 或 >10 层嵌套的 if-else）
- 明确的指令数组和程序计数器模式

**Medium 置信度**：
- 孤立的栈操作或可疑的 while 循环
- 部分 JSVMP 特征但不完整

**Low 置信度**：
- 通用混淆模式
- 可能相关但不确定的结构

请分析提供的代码，识别 JSVMP 相关区域。返回 JSON 格式：

{
  "summary": "分析摘要（中文）",
  "regions": [
    {
      "start": 起始行号,
      "end": 结束行号,
      "type": "If-Else Dispatcher" | "Switch Dispatcher" | "Instruction Array" | "Stack Operation",
      "confidence": "ultra_high" | "high" | "medium" | "low",
      "description": "详细描述（中文）"
    }
  ]
}

如果没有检测到 JSVMP 特征，返回空的 regions 数组。`;
}

/**
 * 创建 LLM 客户端实例
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  return {
    async analyzeJSVMP(formattedCode: string): Promise<string> {
      const systemPrompt = buildJSVMPSystemPrompt();
      
      const requestBody = {
        model: config.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `请分析以下代码，识别 JSVMP 保护结构：\n\n${formattedCode}`
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      };
      
      try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error("API 响应格式无效：缺少 choices 或 message 字段");
        }
        
        const content = data.choices[0].message.content;
        
        if (typeof content !== "string") {
          throw new Error("API 响应格式无效：message.content 不是字符串");
        }
        
        return content;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`LLM 请求失败: ${error.message}`);
        }
        throw new Error(`LLM 请求失败: ${String(error)}`);
      }
    }
  };
}
