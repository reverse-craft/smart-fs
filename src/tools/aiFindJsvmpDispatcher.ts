import { SourceMapConsumer } from 'source-map-js';
import { ensureBeautified } from '../beautifier.js';
import { truncateCodeHighPerf } from '../truncator.js';

/**
 * Formatted code result interface
 */
export interface FormattedCode {
  content: string;      // 格式化后的代码字符串
  totalLines: number;   // 总行数
  startLine: number;    // 实际起始行
  endLine: number;      // 实际结束行
}

/**
 * Detection type for JSVMP patterns
 */
export type DetectionType = 
  | "If-Else Dispatcher" 
  | "Switch Dispatcher" 
  | "Instruction Array" 
  | "Stack Operation";

/**
 * Confidence level for detection results
 */
export type ConfidenceLevel = "ultra_high" | "high" | "medium" | "low";

/**
 * A detected region in the code
 */
export interface DetectionRegion {
  start: number;           // 起始行号
  end: number;             // 结束行号
  type: DetectionType;     // 检测类型
  confidence: ConfidenceLevel;  // 置信度
  description: string;     // 描述（中文）
}

/**
 * Complete detection result from LLM analysis
 */
export interface DetectionResult {
  summary: string;         // 分析摘要（中文）
  regions: DetectionRegion[];
}

/**
 * Format source position as "L{line}:{column}" or empty placeholder
 */
function formatSourcePosition(line: number | null, column: number | null): string {
  if (line !== null && column !== null) {
    return `L${line}:${column}`;
  }
  return '';
}

/**
 * Format a single code line with line number, source coordinates, and content
 * Format: "LineNo SourceLoc Code"
 */
function formatCodeLine(lineNumber: number, sourcePos: string, code: string): string {
  const lineNumStr = String(lineNumber).padStart(5, ' ');
  const srcPosPadded = sourcePos ? sourcePos.padEnd(10, ' ') : '          ';
  return `${lineNumStr} ${srcPosPadded} ${code}`;
}

/**
 * 格式化代码为 LLM 分析格式
 * 格式: "LineNo SourceLoc Code"
 * 
 * 处理流程：
 * 1. 调用 ensureBeautified 美化代码
 * 2. 调用 truncateCodeHighPerf 截断长字符串
 * 3. 使用 SourceMapConsumer 获取原始坐标
 * 4. 格式化为 "LineNo SourceLoc Code" 格式
 * 
 * @param filePath - Path to the JavaScript file
 * @param startLine - Start line number (1-based)
 * @param endLine - End line number (1-based)
 * @param charLimit - Character limit for string truncation (default 300)
 * @returns FormattedCode object with formatted content and metadata
 */
export async function formatCodeForAnalysis(
  filePath: string,
  startLine: number,
  endLine: number,
  charLimit: number = 300
): Promise<FormattedCode> {
  // Step 1: Beautify the file and get source map
  const beautifyResult = await ensureBeautified(filePath);
  const { code, rawMap } = beautifyResult;

  // Step 2: Truncate long strings
  const truncatedCode = truncateCodeHighPerf(code, charLimit);

  // Split into lines
  const lines = truncatedCode.split('\n');
  const totalLines = lines.length;

  // Step 3: Adjust line range boundaries (Requirements 2.3)
  const effectiveStartLine = Math.max(1, Math.min(totalLines, startLine));
  const effectiveEndLine = Math.max(effectiveStartLine, Math.min(totalLines, endLine));

  // Step 4: Create source map consumer
  const consumer = new SourceMapConsumer({
    ...rawMap,
    version: String(rawMap.version),
  });

  // Step 5: Format each line with "LineNo SourceLoc Code" format
  const formattedLines: string[] = [];

  for (let lineNum = effectiveStartLine; lineNum <= effectiveEndLine; lineNum++) {
    const lineIndex = lineNum - 1;
    const lineContent = lines[lineIndex] ?? '';

    // Get original position from source map
    const originalPos = consumer.originalPositionFor({
      line: lineNum,
      column: 0,
    });

    const sourcePos = formatSourcePosition(originalPos.line, originalPos.column);
    formattedLines.push(formatCodeLine(lineNum, sourcePos, lineContent));
  }

  return {
    content: formattedLines.join('\n'),
    totalLines,
    startLine: effectiveStartLine,
    endLine: effectiveEndLine,
  };
}

/**
 * Valid detection types for validation
 */
const VALID_DETECTION_TYPES: DetectionType[] = [
  "If-Else Dispatcher",
  "Switch Dispatcher",
  "Instruction Array",
  "Stack Operation"
];

/**
 * Valid confidence levels for validation
 */
const VALID_CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  "ultra_high",
  "high",
  "medium",
  "low"
];

/**
 * Check if a value is a valid DetectionType
 */
function isValidDetectionType(value: any): value is DetectionType {
  return VALID_DETECTION_TYPES.includes(value);
}

/**
 * Check if a value is a valid ConfidenceLevel
 */
function isValidConfidenceLevel(value: any): value is ConfidenceLevel {
  return VALID_CONFIDENCE_LEVELS.includes(value);
}

/**
 * Parse and validate LLM detection result from JSON string
 * 
 * Validates:
 * - JSON is parseable
 * - Required fields exist: summary, regions
 * - Each region has required fields: start, end, type, confidence, description
 * - Enum values are valid
 * 
 * @param jsonString - JSON string from LLM response
 * @returns Parsed and validated DetectionResult
 * @throws Error if JSON is invalid or structure doesn't match expected format
 */
export function parseDetectionResult(jsonString: string): DetectionResult {
  // Parse JSON (Requirements 3.5)
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`无法解析 LLM 响应: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Validate required top-level fields (Requirements 3.3, 4.1)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM 响应格式无效，期望对象类型');
  }

  if (typeof parsed.summary !== 'string') {
    throw new Error('LLM 响应格式无效，缺少必需字段: summary');
  }

  if (!Array.isArray(parsed.regions)) {
    throw new Error('LLM 响应格式无效，缺少必需字段: regions');
  }

  // Validate each region (Requirements 4.2, 4.3, 4.4)
  const validatedRegions: DetectionRegion[] = [];

  for (let i = 0; i < parsed.regions.length; i++) {
    const region = parsed.regions[i];

    // Check region is an object
    if (typeof region !== 'object' || region === null) {
      throw new Error(`LLM 响应格式无效，regions[${i}] 不是对象`);
    }

    // Validate required fields exist and have correct types
    if (typeof region.start !== 'number') {
      throw new Error(`LLM 响应格式无效，regions[${i}] 缺少必需字段: start`);
    }

    if (typeof region.end !== 'number') {
      throw new Error(`LLM 响应格式无效，regions[${i}] 缺少必需字段: end`);
    }

    if (typeof region.type !== 'string') {
      throw new Error(`LLM 响应格式无效，regions[${i}] 缺少必需字段: type`);
    }

    if (typeof region.confidence !== 'string') {
      throw new Error(`LLM 响应格式无效，regions[${i}] 缺少必需字段: confidence`);
    }

    if (typeof region.description !== 'string') {
      throw new Error(`LLM 响应格式无效，regions[${i}] 缺少必需字段: description`);
    }

    // Validate enum values (Requirements 4.3, 4.4)
    if (!isValidDetectionType(region.type)) {
      throw new Error(
        `LLM 响应格式无效，regions[${i}].type 值无效: "${region.type}". ` +
        `有效值: ${VALID_DETECTION_TYPES.join(', ')}`
      );
    }

    if (!isValidConfidenceLevel(region.confidence)) {
      throw new Error(
        `LLM 响应格式无效，regions[${i}].confidence 值无效: "${region.confidence}". ` +
        `有效值: ${VALID_CONFIDENCE_LEVELS.join(', ')}`
      );
    }

    validatedRegions.push({
      start: region.start,
      end: region.end,
      type: region.type,
      confidence: region.confidence,
      description: region.description,
    });
  }

  return {
    summary: parsed.summary,
    regions: validatedRegions,
  };
}

/**
 * Format detection result for display
 */
function formatDetectionResult(
  result: DetectionResult,
  filePath: string,
  startLine: number,
  endLine: number
): string {
  const lines: string[] = [];
  
  lines.push('=== JSVMP Dispatcher Detection Result ===');
  lines.push(`File: ${filePath} (${startLine}-${endLine})`);
  lines.push('');
  lines.push(`Summary: ${result.summary}`);
  lines.push('');
  
  if (result.regions.length > 0) {
    lines.push('Detected Regions:');
    for (const region of result.regions) {
      lines.push(`[${region.confidence}] Lines ${region.start}-${region.end}: ${region.type}`);
      lines.push(`  ${region.description}`);
      lines.push('');
    }
  } else {
    lines.push('No JSVMP dispatcher patterns detected.');
  }
  
  return lines.join('\n');
}

import { z } from 'zod';
import { defineTool } from './ToolDefinition.js';
import { getLLMConfig, createLLMClient } from '../llmConfig.js';
import { existsSync } from 'fs';

/**
 * Input schema for ai_find_jsvmp_dispatcher tool
 */
export const AiFindJsvmpDispatcherInputSchema = z.object({
  file_path: z.string().describe('Path to the JavaScript file to analyze'),
  start_line: z.number().int().positive().describe('Start line number (1-based)'),
  end_line: z.number().int().positive().describe('End line number (1-based)'),
  char_limit: z.number().int().positive().optional().describe('Character limit for string truncation (default: 300)'),
});

/**
 * ai_find_jsvmp_dispatcher tool definition
 * 
 * AI-powered tool that analyzes JavaScript code to find JSVMP (JavaScript Virtual Machine Protection) 
 * dispatcher patterns using LLM-based analysis. Requires OPENAI_API_KEY environment variable.
 * 
 * Requirements: 5.1, 5.2, 1.2, 5.3
 */
export const aiFindJsvmpDispatcher = defineTool({
  name: 'ai_find_jsvmp_dispatcher',
  description: 'AI-powered tool to find JSVMP (JavaScript Virtual Machine Protection) dispatcher patterns in code using LLM analysis. Identifies dispatchers (switch/if-else), virtual stacks, instruction arrays, and other obfuscation patterns. Requires OPENAI_API_KEY environment variable.',
  schema: AiFindJsvmpDispatcherInputSchema.shape,
  handler: async (params) => {
    const { file_path, start_line, end_line, char_limit } = params;
    
    // Check LLM configuration (Requirements 1.2, 5.3)
    const config = getLLMConfig();
    if (!config) {
      return '错误：未配置 LLM。请设置环境变量 OPENAI_API_KEY 以启用 JSVMP dispatcher 检测功能。';
    }
    
    // Check file exists (Requirements 2.4)
    if (!existsSync(file_path)) {
      return `错误：文件不存在: ${file_path}`;
    }
    
    try {
      // Format code for analysis (Requirements 2.1, 2.2, 2.3)
      const formattedCode = await formatCodeForAnalysis(
        file_path,
        start_line,
        end_line,
        char_limit
      );
      
      // Create LLM client and analyze (Requirements 3.1, 3.2)
      const client = createLLMClient(config);
      const llmResponse = await client.analyzeJSVMP(formattedCode.content);
      
      // Parse detection result (Requirements 3.3, 4.1, 4.2, 4.3, 4.4)
      const result = parseDetectionResult(llmResponse);
      
      // Format and return result (Requirements 4.1, 4.2)
      return formatDetectionResult(result, file_path, start_line, end_line);
      
    } catch (error) {
      // Error handling (Requirements 3.4, 3.5)
      if (error instanceof Error) {
        return `错误：${error.message}`;
      }
      return `错误：${String(error)}`;
    }
  },
});
