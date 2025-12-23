import { parse } from 'meriyah';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Node } from 'estree';

/**
 * Count newlines in a string
 */
function countNewlines(str: string): number {
  let count = 0;
  for (const char of str) {
    if (char === '\n') count++;
  }
  return count;
}

/**
 * Create truncated string with preserved newlines
 * Format: "start ...[TRUNCATED {length} CHARS]... \n\n\nend"
 */
function createTruncatedString(original: string, previewLength: number): string {
  const newlineCount = countNewlines(original);
  const start = original.slice(0, previewLength);
  const end = original.slice(-previewLength);
  
  // Build the truncation marker with preserved newlines
  const marker = `...[TRUNCATED ${original.length} CHARS]...`;
  
  // Create newlines to preserve line count
  // We need to account for newlines already in start and end portions
  const startNewlines = countNewlines(start);
  const endNewlines = countNewlines(end);
  const preservedNewlines = Math.max(0, newlineCount - startNewlines - endNewlines);
  const newlineStr = '\n'.repeat(preservedNewlines);
  
  return `${start}${marker}${newlineStr}${end}`;
}

/**
 * Truncate long strings in JavaScript code while preserving line numbers
 * @param sourceCode - Source code to process
 * @param limit - Character limit for strings (default 200)
 * @param previewLength - Length of start/end preview portions (default 50)
 * @returns Truncated code with preserved line count
 */
export function truncateCodeHighPerf(sourceCode: string, limit: number = 200, previewLength: number = 50): string {
  // Try to parse the AST
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(sourceCode, {
      module: true,
      next: true,
      ranges: true,
      loc: true,
      raw: true,
    });
  } catch {
    // AST parsing failed - return original code unchanged (Requirement 2.4)
    return sourceCode;
  }

  const magicString = new MagicString(sourceCode);
  
  // Walk the AST and find string literals to truncate
  walk(ast as unknown as Node, {
    enter(node: Node) {
      // Handle regular string literals
      if (node.type === 'Literal' && typeof (node as any).value === 'string') {
        const literal = node as any;
        const value = literal.value as string;
        
        if (value.length > limit && literal.start !== undefined && literal.end !== undefined) {
          const truncated = createTruncatedString(value, previewLength);
          // Wrap in quotes matching the original
          const originalText = sourceCode.slice(literal.start, literal.end);
          const quote = originalText[0]; // Get the quote character used
          magicString.overwrite(literal.start, literal.end, `${quote}${truncated}${quote}`);
        }
      }
      
      // Handle template literals
      if (node.type === 'TemplateLiteral') {
        const template = node as any;
        
        // Process each quasi (template element)
        for (const quasi of template.quasis) {
          const value = quasi.value.raw as string;
          
          if (value.length > limit && quasi.start !== undefined && quasi.end !== undefined) {
            const truncated = createTruncatedString(value, previewLength);
            // Template literal quasis don't have surrounding quotes
            magicString.overwrite(quasi.start, quasi.end, truncated);
          }
        }
      }
    }
  });

  return magicString.toString();
}

/**
 * Truncate lines that exceed the maximum character limit
 * @param code - Source code to process
 * @param maxLineChars - Maximum characters per line (default 500)
 * @param previewRatio - Ratio of line to show at start/end (default 0.2)
 * @returns Code with truncated long lines
 */
export function truncateLongLines(
  code: string,
  maxLineChars: number = 500,
  previewRatio: number = 0.2
): string {
  if (!code) {
    return code;
  }

  const lines = code.split('\n');
  const previewLength = Math.floor(maxLineChars * previewRatio);

  const processedLines = lines.map((line) => {
    if (line.length <= maxLineChars) {
      return line;
    }

    const start = line.slice(0, previewLength);
    const end = line.slice(-previewLength);
    const truncatedChars = line.length - previewLength * 2;
    const marker = `...[LINE TRUNCATED ${truncatedChars} CHARS]...`;

    return `${start}${marker}${end}`;
  });

  return processedLines.join('\n');
}
