import { z } from 'zod';
import { SourceMapConsumer } from 'source-map-js';
import { defineTool } from './ToolDefinition.js';
import { ensureBeautified } from '../beautifier.js';
import { truncateCodeHighPerf, truncateLongLines } from '../truncator.js';

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
 * Format output header with file info
 */
function formatHeader(filePath: string, startLine: number, endLine: number, totalLines: number): string {
  return [
    `${filePath} (${startLine}-${endLine}/${totalLines})`,
    `Src=original position for breakpoints`,
  ].join('\n');
}

/**
 * Format a single code line with line number, source coordinates, and content
 */
function formatCodeLine(lineNumber: number, sourcePos: string, code: string, maxLineNumWidth: number): string {
  const lineNumStr = String(lineNumber).padStart(maxLineNumWidth, ' ');
  const srcPos = sourcePos ? sourcePos.padEnd(10, ' ') : '          ';
  return `${lineNumStr} ${srcPos} ${code}`;
}

/**
 * Format pagination hint
 */
function formatPaginationHint(nextStartLine: number): string {
  return `\n... (Use next start_line=${nextStartLine} to read more)`;
}

/**
 * read_code_smart tool definition
 * Read and beautify minified/obfuscated JavaScript code with source map coordinates.
 */
export const readCodeSmart = defineTool({
  name: 'read_code_smart',
  description:
    'Read and beautify minified/obfuscated JavaScript code with source map coordinates. ' +
    'Returns formatted code with original file positions for setting breakpoints. ' +
    'Optionally saves the beautified file locally alongside the original file.',
  schema: {
    file_path: z.string().describe('Path to the JavaScript file'),
    start_line: z.number().int().min(1).describe('Start line number (1-based)'),
    end_line: z.number().int().min(1).describe('End line number (1-based)'),
    char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
    max_line_chars: z.number().int().min(80).default(500).describe('Maximum characters per line'),
    save_local: z.boolean().optional().default(false).describe('Save beautified file to the same directory as the original file'),
  },
  handler: async (params) => {
    const { file_path, start_line, end_line, char_limit, max_line_chars, save_local } = params;

    // Beautify the file and get source map
    const beautifyResult = await ensureBeautified(file_path, { saveLocal: save_local });
    const { code, rawMap, localPath, localMapPath, localSaveError } = beautifyResult;

    // Truncate long strings
    const truncatedCode = truncateCodeHighPerf(code, char_limit);

    // Truncate long lines
    const lineTruncatedCode = truncateLongLines(truncatedCode, max_line_chars);

    // Split into lines
    const lines = lineTruncatedCode.split('\n');
    const totalLines = lines.length;

    // Validate line range
    const effectiveStartLine = Math.max(1, start_line);
    const effectiveEndLine = Math.min(totalLines, end_line);

    if (effectiveStartLine > totalLines) {
      throw new Error(`Start line ${start_line} exceeds total lines ${totalLines}`);
    }

    // Create source map consumer (cast version to string as required by source-map-js)
    const consumer = new SourceMapConsumer({
      ...rawMap,
      version: String(rawMap.version),
    });

    // Build output
    const outputParts: string[] = [];

    // Add header
    outputParts.push(formatHeader(file_path, effectiveStartLine, effectiveEndLine, totalLines));

    // Add local save info if applicable
    if (save_local) {
      if (localPath) {
        outputParts.push(`LOCAL: ${localPath}`);
        if (localMapPath) {
          outputParts.push(`MAP: ${localMapPath}`);
        }
      }
      if (localSaveError) {
        outputParts.push(`ERROR: ${localSaveError}`);
      }
    }

    // Calculate max line number width for alignment
    const maxLineNumWidth = String(effectiveEndLine).length;

    // Format each line
    for (let lineNum = effectiveStartLine; lineNum <= effectiveEndLine; lineNum++) {
      const lineIndex = lineNum - 1;
      const lineContent = lines[lineIndex] ?? '';

      // Get original position from source map
      const originalPos = consumer.originalPositionFor({
        line: lineNum,
        column: 0,
      });

      const sourcePos = formatSourcePosition(originalPos.line, originalPos.column);
      outputParts.push(formatCodeLine(lineNum, sourcePos, lineContent, maxLineNumWidth));
    }

    // Add pagination hint if there are more lines
    if (effectiveEndLine < totalLines) {
      outputParts.push(formatPaginationHint(effectiveEndLine + 1));
    }

    return outputParts.join('\n');
  },
});
