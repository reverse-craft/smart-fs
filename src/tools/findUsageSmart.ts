import { z } from 'zod';
import { defineTool } from './ToolDefinition.js';
import { ensureBeautified } from '../beautifier.js';
import { truncateCodeHighPerf, truncateLongLines } from '../truncator.js';
import { analyzeBindings, formatAnalysisResult } from '../analyzer.js';

/**
 * Schema for find_usage_smart tool input validation
 */
export const FindUsageSmartInputSchema = z.object({
  file_path: z.string().describe('Path to the JavaScript file'),
  identifier: z.string().describe('Variable or function name to find'),
  line: z.number().int().positive().optional().describe(
    'The line number where you see this variable. HIGHLY RECOMMENDED for precision in obfuscated code.'
  ),
  char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
  max_line_chars: z.number().int().min(80).default(500).describe('Maximum characters per line'),
});

/**
 * find_usage_smart tool definition
 * Find all definitions and references of a variable/function using AST scope analysis.
 */
export const findUsageSmart = defineTool({
  name: 'find_usage_smart',
  description:
    'Find all definitions and references of a variable/function using AST scope analysis. ' +
    'Returns binding information grouped by scope with original source coordinates for setting breakpoints. ' +
    'Useful for tracing variable usage in minified/obfuscated code with variable name reuse.',
  schema: {
    file_path: z.string().describe('Path to the JavaScript file'),
    identifier: z.string().describe('Variable or function name to find'),
    line: z.number().int().positive().optional().describe(
      'The line number where you see this variable. HIGHLY RECOMMENDED for precision in obfuscated code.'
    ),
    char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
    max_line_chars: z.number().int().min(80).default(500).describe('Maximum characters per line'),
  },
  handler: async (params) => {
    const { file_path, identifier, line, char_limit, max_line_chars } = params;

    // Beautify the file and get source map
    const beautifyResult = await ensureBeautified(file_path);
    const { code, rawMap } = beautifyResult;

    // Analyze bindings using full code (not truncated) for accurate AST analysis
    // When line is specified, increase maxReferences to 15 for targeted searches
    const analysisResult = analyzeBindings(code, rawMap, identifier, {
      maxReferences: line ? 15 : 10,
      targetLine: line,
    });

    // Truncate the code for display purposes
    const truncatedCode = truncateCodeHighPerf(code, char_limit);
    const truncatedLines = truncatedCode.split('\n');

    // Update line content in analysis result with truncated versions
    for (const binding of analysisResult.bindings) {
      // Update definition line content
      const defLineIdx = binding.definition.line - 1;
      if (defLineIdx >= 0 && defLineIdx < truncatedLines.length) {
        binding.definition.lineContent = truncatedLines[defLineIdx];
      }

      // Update reference line contents
      for (const ref of binding.references) {
        const refLineIdx = ref.line - 1;
        if (refLineIdx >= 0 && refLineIdx < truncatedLines.length) {
          ref.lineContent = truncatedLines[refLineIdx];
        }
      }
    }

    // Format the result
    let output = formatAnalysisResult(file_path, analysisResult, line ? 15 : 10);

    // Truncate long lines in output
    output = truncateLongLines(output, max_line_chars);

    return output;
  },
});
