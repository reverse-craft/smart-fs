#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SourceMapConsumer } from 'source-map-js';
import { ensureBeautified } from './beautifier.js';
import { truncateCodeHighPerf } from './truncator.js';

// Tool input schema using Zod
const ReadCodeSmartInputSchema = z.object({
  file_path: z.string().describe('Path to the JavaScript file'),
  start_line: z.number().int().min(1).describe('Start line number (1-based)'),
  end_line: z.number().int().min(1).describe('End line number (1-based)'),
  char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
});

type ReadCodeSmartInput = z.infer<typeof ReadCodeSmartInputSchema>;

// Create MCP Server instance
const server = new Server(
  {
    name: 'jsvmp-smart-fs',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);


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
    `FILE: ${filePath}`,
    `VIEW: Auto-beautified (Lines ${startLine}-${endLine} of ${totalLines})`,
    `INFO: [Src L:C] = Location in original minified file (for Chrome Breakpoints)`,
    '-'.repeat(85),
  ].join('\n');
}

/**
 * Format a single code line with line number, source coordinates, and content
 */
function formatCodeLine(lineNumber: number, sourcePos: string, code: string, maxLineNumWidth: number): string {
  const lineNumStr = String(lineNumber).padStart(maxLineNumWidth, ' ');
  const srcPosStr = sourcePos ? `Src ${sourcePos}` : '';
  const srcPosPadded = srcPosStr.padEnd(14, ' ');
  return `${lineNumStr} | [${srcPosPadded}] | ${code}`;
}

/**
 * Format pagination hint
 */
function formatPaginationHint(nextStartLine: number): string {
  return `\n... (Use next start_line=${nextStartLine} to read more)`;
}


/**
 * Process read_code_smart request
 */
async function handleReadCodeSmart(input: ReadCodeSmartInput): Promise<string> {
  const { file_path, start_line, end_line, char_limit } = input;

  // Beautify the file and get source map
  const { code, rawMap } = await ensureBeautified(file_path);

  // Truncate long strings
  const truncatedCode = truncateCodeHighPerf(code, char_limit);

  // Split into lines
  const lines = truncatedCode.split('\n');
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
}


// Register ListTools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_code_smart',
        description:
          'Read and beautify minified/obfuscated JavaScript code with source map coordinates. ' +
          'Returns formatted code with original file positions for setting breakpoints.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the JavaScript file',
            },
            start_line: {
              type: 'number',
              description: 'Start line number (1-based)',
            },
            end_line: {
              type: 'number',
              description: 'End line number (1-based)',
            },
            char_limit: {
              type: 'number',
              description: 'Character limit for string truncation (default: 300)',
              default: 300,
            },
          },
          required: ['file_path', 'start_line', 'end_line'],
        },
      },
    ],
  };
});

// Register CallTool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'read_code_smart') {
    throw new Error(`Tool not found: ${name}`);
  }

  try {
    // Validate and parse input
    const input = ReadCodeSmartInputSchema.parse(args);
    const result = await handleReadCodeSmart(input);

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Main entry point
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('JSVMP Smart FS MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
