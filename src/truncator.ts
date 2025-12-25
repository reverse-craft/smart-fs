import { parse } from 'meriyah';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Node } from 'estree';
import { detectLanguage, getLanguageInfo, type SupportedLanguage } from './languageDetector.js';

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
 * Options for truncation operations
 */
export interface TruncateOptions {
  /** Override auto-detected language */
  language?: SupportedLanguage;
  /** Character limit for string truncation (default: 200) */
  charLimit?: number;
  /** Maximum characters per line (default: 500) */
  maxLineChars?: number;
  /** Preview length for truncated content (default: 50) */
  previewLength?: number;
}

/**
 * Result of truncation operation
 */
export interface TruncateResult {
  /** Truncated code */
  code: string;
  /** Whether fallback mode was used */
  usedFallback: boolean;
}

/**
 * Result of AST-based truncation
 */
interface ASTTruncateResult {
  /** Truncated code */
  code: string;
  /** Whether parsing failed and fallback was used */
  parseFailed: boolean;
}

/**
 * Truncate long strings in JavaScript/TypeScript code using AST-based processing
 * This function uses meriyah to parse the AST and truncate string literals
 * 
 * @param sourceCode - Source code to process
 * @param limit - Character limit for strings (default 200)
 * @param previewLength - Length of start/end preview portions (default 50)
 * @returns ASTTruncateResult with truncated code and parse failure indicator
 */
function truncateCodeAST(sourceCode: string, limit: number = 200, previewLength: number = 50): ASTTruncateResult {
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
    // AST parsing failed - return original code unchanged (Requirement 8.4, 8.5)
    // Signal that fallback mode should be used
    return { code: sourceCode, parseFailed: true };
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

  return { code: magicString.toString(), parseFailed: false };
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use truncateCode instead
 */
export function truncateCodeHighPerf(sourceCode: string, limit: number = 200, previewLength: number = 50): string {
  return truncateCodeAST(sourceCode, limit, previewLength).code;
}

/**
 * Fallback truncation for unsupported languages
 * Only truncates lines exceeding the character limit, no AST parsing
 * Preserves the original line count (Requirement 3.3)
 * 
 * @param code - Source code to process
 * @param maxLineChars - Maximum characters per line (default: 500)
 * @param previewLength - Length of start/end preview portions (default: 50)
 * @returns Truncated code with preserved line count
 */
export function truncateFallback(
  code: string,
  maxLineChars: number = 500,
  previewLength: number = 50
): string {
  if (!code) {
    return code;
  }

  const lines = code.split('\n');

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

/**
 * Truncate code based on language type
 * - For JS/TS: Use AST-based truncation for string literals + line truncation
 * - For other languages: Use line-based truncation only (fallback mode)
 * 
 * @param code - Source code to process
 * @param options - Truncation options including language, limits, etc.
 * @returns TruncateResult with truncated code and fallback indicator
 */
export function truncateCode(
  code: string,
  options?: TruncateOptions
): TruncateResult {
  const {
    language,
    charLimit = 200,
    maxLineChars = 500,
    previewLength = 50,
  } = options ?? {};

  // Determine language info
  const langInfo = language ? getLanguageInfo(language) : null;
  
  // Check if AST-based truncation is supported
  const supportsAST = langInfo?.supportsAST ?? false;
  
  if (supportsAST && (language === 'javascript' || language === 'typescript')) {
    // Use AST-based truncation for JS/TS
    const astResult = truncateCodeAST(code, charLimit, previewLength);
    
    // If AST parsing failed, fall back to line-based truncation (Requirement 8.4)
    if (astResult.parseFailed) {
      const truncatedCode = truncateFallback(code, maxLineChars, previewLength);
      return {
        code: truncatedCode,
        usedFallback: true,
      };
    }
    
    // Also apply line truncation to AST-processed code
    const truncatedCode = truncateLongLines(astResult.code, maxLineChars, previewLength / maxLineChars);
    return {
      code: truncatedCode,
      usedFallback: false,
    };
  }
  
  // Fallback mode: only line-based truncation (Requirement 3.2)
  const truncatedCode = truncateFallback(code, maxLineChars, previewLength);
  return {
    code: truncatedCode,
    usedFallback: true,
  };
}

/**
 * Truncate code from a file path, auto-detecting language
 * 
 * @param filePath - Path to the file (used for language detection)
 * @param code - Source code to process
 * @param options - Truncation options (language override, limits, etc.)
 * @returns TruncateResult with truncated code and fallback indicator
 */
export function truncateCodeFromFile(
  filePath: string,
  code: string,
  options?: Omit<TruncateOptions, 'language'> & { language?: SupportedLanguage }
): TruncateResult {
  // Detect language from file path if not specified
  const language = options?.language ?? detectLanguage(filePath).language;
  
  return truncateCode(code, {
    ...options,
    language,
  });
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
