import { SourceMapConsumer } from 'source-map-js';
import type { SourceMap } from './beautifier.js';

/**
 * Original position from source map
 */
export interface OriginalPosition {
  line: number | null;
  column: number | null;
}

/**
 * Context line with position info
 */
export interface ContextLine {
  lineNumber: number;
  content: string;
  originalPosition: OriginalPosition;
}

/**
 * Search match result
 */
export interface SearchMatch {
  /** Match line number (1-based, in beautified code) */
  lineNumber: number;
  /** Match line content */
  lineContent: string;
  /** Original file coordinates */
  originalPosition: OriginalPosition;
  /** Context lines before match */
  contextBefore: ContextLine[];
  /** Context lines after match */
  contextAfter: ContextLine[];
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Regex pattern or text to search */
  query: string;
  /** Number of context lines (default 2) */
  contextLines?: number;
  /** Case sensitive search (default false) */
  caseSensitive?: boolean;
  /** Maximum matches to return (default 50) */
  maxMatches?: number;
  /** Treat query as regex pattern (default false for literal text search) */
  isRegex?: boolean;
}

/**
 * Search result
 */
export interface SearchResult {
  /** Matched results */
  matches: SearchMatch[];
  /** Total matches found (before truncation) */
  totalMatches: number;
  /** Whether results were truncated */
  truncated: boolean;
}


/**
 * Convert double-escaped backslashes to single backslashes.
 * Fixes MCP JSON transmission double-escaping issue.
 * 
 * @param str - String with potentially double-escaped backslashes
 * @returns String with `\\` converted to `\`
 * 
 * @example
 * unescapeBackslashes("for\\s*\\(") // returns "for\s*\("
 * unescapeBackslashes("\\\\n")      // returns "\\n" (literal backslash + n)
 * unescapeBackslashes("hello")      // returns "hello" (unchanged)
 */
export function unescapeBackslashes(str: string): string {
  return str.replace(/\\\\/g, '\\');
}

/**
 * Escape all regex special characters in a string for literal matching
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
export function escapeRegex(str: string): string {
  return str.replace(/[()[\]{}.*+?^$|\\]/g, '\\$&');
}

/**
 * Create regex from query string with error handling
 * @param query - Regex pattern or text
 * @param caseSensitive - Whether to be case sensitive
 * @param isRegex - Whether to treat query as regex (default false)
 * @returns Created RegExp
 * @throws Error if regex is invalid
 */
export function createRegex(query: string, caseSensitive: boolean = false, isRegex: boolean = false): RegExp {
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = isRegex ? query : escapeRegex(query);
    return new RegExp(pattern, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex: ${message}`);
  }
}

/**
 * Get original position for a line using source map consumer
 */
function getOriginalPosition(
  consumer: SourceMapConsumer,
  lineNumber: number
): OriginalPosition {
  const pos = consumer.originalPositionFor({
    line: lineNumber,
    column: 0,
  });
  return {
    line: pos.line,
    column: pos.column,
  };
}

/**
 * Create a context line object
 */
function createContextLine(
  lineNumber: number,
  content: string,
  consumer: SourceMapConsumer
): ContextLine {
  return {
    lineNumber,
    content,
    originalPosition: getOriginalPosition(consumer, lineNumber),
  };
}

/**
 * Search for pattern in code and return matches with context
 * @param code - Beautified code to search in
 * @param rawMap - Source map for coordinate mapping
 * @param options - Search options
 * @returns Search result with matches
 */
export function searchInCode(
  code: string,
  rawMap: SourceMap,
  options: SearchOptions
): SearchResult {
  const {
    query,
    contextLines = 2,
    caseSensitive = false,
    maxMatches = 50,
    isRegex = false,
  } = options;

  // Create regex from query
  const regex = createRegex(query, caseSensitive, isRegex);

  // Split code into lines
  const lines = code.split('\n');
  const totalLines = lines.length;

  // Create source map consumer
  const consumer = new SourceMapConsumer({
    ...rawMap,
    version: String(rawMap.version),
  });

  // Find all matching line numbers
  const matchingLineNumbers: number[] = [];
  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];
    // Reset regex lastIndex for each line
    regex.lastIndex = 0;
    if (regex.test(line)) {
      matchingLineNumbers.push(i + 1); // 1-based line number
    }
  }

  const totalMatches = matchingLineNumbers.length;
  const truncated = totalMatches > maxMatches;

  // Limit matches
  const limitedLineNumbers = matchingLineNumbers.slice(0, maxMatches);

  // Build match results
  const matches: SearchMatch[] = limitedLineNumbers.map((lineNumber) => {
    const lineIndex = lineNumber - 1;
    const lineContent = lines[lineIndex];

    // Collect context before
    const contextBefore: ContextLine[] = [];
    for (let i = Math.max(0, lineIndex - contextLines); i < lineIndex; i++) {
      contextBefore.push(createContextLine(i + 1, lines[i], consumer));
    }

    // Collect context after
    const contextAfter: ContextLine[] = [];
    for (let i = lineIndex + 1; i <= Math.min(totalLines - 1, lineIndex + contextLines); i++) {
      contextAfter.push(createContextLine(i + 1, lines[i], consumer));
    }

    return {
      lineNumber,
      lineContent,
      originalPosition: getOriginalPosition(consumer, lineNumber),
      contextBefore,
      contextAfter,
    };
  });

  return {
    matches,
    totalMatches,
    truncated,
  };
}

/**
 * Format source position as "L{line}:{column}" or placeholder
 */
export function formatSourcePosition(line: number | null, column: number | null): string {
  if (line !== null && column !== null) {
    return `L${line}:${column}`;
  }
  return '';
}

/**
 * Format search result for output
 * @param filePath - Path to the file
 * @param query - Search query
 * @param caseSensitive - Whether search was case sensitive
 * @param result - Search result
 * @param maxMatches - Maximum matches limit
 * @param isRegex - Whether query was treated as regex pattern
 * @returns Formatted output string
 */
export function formatSearchResult(
  filePath: string,
  query: string,
  caseSensitive: boolean,
  result: SearchResult,
  maxMatches: number = 50,
  isRegex: boolean = false
): string {
  const { matches, totalMatches, truncated } = result;

  const outputParts: string[] = [];

  // Header
  const caseInfo = caseSensitive ? 'case-sensitive' : 'case-insensitive';
  const modeInfo = isRegex ? 'regex' : 'literal';
  outputParts.push(`FILE: ${filePath}`);
  outputParts.push(`QUERY: "${query}" (${modeInfo}, ${caseInfo})`);

  if (totalMatches === 0) {
    outputParts.push('MATCHES: No matches found');
    return outputParts.join('\n');
  }

  const matchInfo = truncated
    ? `MATCHES: ${totalMatches} found (showing first ${maxMatches})`
    : `MATCHES: ${totalMatches} found`;
  outputParts.push(matchInfo);
  outputParts.push('-'.repeat(85));

  // Format each match
  for (const match of matches) {
    outputParts.push(`--- Match at Line ${match.lineNumber} ---`);

    // Calculate max line number width for alignment
    const allLineNumbers = [
      ...match.contextBefore.map((c) => c.lineNumber),
      match.lineNumber,
      ...match.contextAfter.map((c) => c.lineNumber),
    ];
    const maxLineNumWidth = Math.max(...allLineNumbers.map((n) => String(n).length));

    // Format context before
    for (const ctx of match.contextBefore) {
      const lineNumStr = String(ctx.lineNumber).padStart(maxLineNumWidth, ' ');
      const srcPos = formatSourcePosition(ctx.originalPosition.line, ctx.originalPosition.column);
      const srcPosPadded = srcPos ? `Src ${srcPos}` : '';
      outputParts.push(`    ${lineNumStr} | [${srcPosPadded.padEnd(14, ' ')}] | ${ctx.content}`);
    }

    // Format match line with >> prefix
    const matchLineNumStr = String(match.lineNumber).padStart(maxLineNumWidth, ' ');
    const matchSrcPos = formatSourcePosition(match.originalPosition.line, match.originalPosition.column);
    const matchSrcPosPadded = matchSrcPos ? `Src ${matchSrcPos}` : '';
    outputParts.push(`>>  ${matchLineNumStr} | [${matchSrcPosPadded.padEnd(14, ' ')}] | ${match.lineContent}`);

    // Format context after
    for (const ctx of match.contextAfter) {
      const lineNumStr = String(ctx.lineNumber).padStart(maxLineNumWidth, ' ');
      const srcPos = formatSourcePosition(ctx.originalPosition.line, ctx.originalPosition.column);
      const srcPosPadded = srcPos ? `Src ${srcPos}` : '';
      outputParts.push(`    ${lineNumStr} | [${srcPosPadded.padEnd(14, ' ')}] | ${ctx.content}`);
    }

    outputParts.push(''); // Empty line between matches
  }

  // Add truncation message if needed
  if (truncated) {
    outputParts.push(`... (${totalMatches - maxMatches} more matches not shown)`);
  }

  return outputParts.join('\n');
}
