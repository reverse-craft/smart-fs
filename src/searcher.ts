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
  /** Timeout in milliseconds for search operation (default 500) */
  timeoutMs?: number;
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
 * Build line offset index using Int32Array for memory efficiency.
 * Returns the offset array and total line count.
 */
function buildLineOffsets(code: string): { offsets: Int32Array; totalLines: number } {
  // Pre-allocate with estimated average line length of 40 chars
  let capacity = Math.max(16, Math.ceil(code.length / 40));
  let offsets = new Int32Array(capacity);
  let lineCount = 0;

  offsets[0] = 0; // First line starts at index 0

  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') {
      lineCount++;
      // Dynamic resize if needed
      if (lineCount >= capacity) {
        capacity *= 2;
        const newArr = new Int32Array(capacity);
        newArr.set(offsets);
        offsets = newArr;
      }
      offsets[lineCount] = i + 1; // Next line starts after \n
    }
  }

  return {
    offsets: offsets.subarray(0, lineCount + 1),
    totalLines: lineCount + 1,
  };
}

/**
 * Binary search to find line number (1-based) from character index.
 */
function getLineNumberFromIndex(offsets: Int32Array, totalLines: number, index: number): number {
  let low = 0;
  let high = totalLines - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (offsets[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return low; // 1-based line number
}

/**
 * Get line content by line number (1-based) without splitting entire string.
 */
function getLineContent(
  code: string,
  offsets: Int32Array,
  totalLines: number,
  lineNo: number
): string {
  if (lineNo < 1 || lineNo > totalLines) return '';

  const start = offsets[lineNo - 1];
  let end: number;

  if (lineNo < totalLines) {
    // End is one before the next line's start (exclude \n)
    end = offsets[lineNo] - 1;
  } else {
    // Last line: go to end of string
    end = code.length;
  }

  // Handle \r\n line endings
  if (end > start && code[end - 1] === '\r') {
    end--;
  }

  return code.slice(start, end);
}

/**
 * Search for pattern in code and return matches with context.
 * Optimized version: avoids split() for large files, uses index-based iteration.
 *
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
    maxMatches = 10,
    isRegex = false,
    timeoutMs = 500,
  } = options;

  // Build line offset index (memory efficient)
  const { offsets, totalLines } = buildLineOffsets(code);

  // Create regex with global + multiline flags
  const flags = (caseSensitive ? 'g' : 'gi') + 'm';
  const patternStr = isRegex ? unescapeBackslashes(query) : escapeRegex(query);

  let regex: RegExp;
  try {
    regex = new RegExp(patternStr, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex: ${message}`);
  }

  // Create source map consumer
  const consumer = new SourceMapConsumer({
    ...rawMap,
    version: String(rawMap.version),
  });

  const matches: SearchMatch[] = [];
  let lastMatchedLine = -1;
  let totalMatchesFound = 0;
  let match: RegExpExecArray | null;

  // Performance protection
  const startTime = Date.now();

  // Iterate matches using exec() - no string splitting
  while ((match = regex.exec(code)) !== null) {
    // Prevent infinite loop on zero-width matches
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    const lineNumber = getLineNumberFromIndex(offsets, totalLines, match.index);

    // Dedupe: skip if same line already matched
    if (lineNumber === lastMatchedLine) {
      continue;
    }
    lastMatchedLine = lineNumber;
    totalMatchesFound++;

    // Only build match details if we haven't hit the limit yet
    if (matches.length < maxMatches) {
      // Build context (lazy: only fetch line content when needed)
      const contextBefore: ContextLine[] = [];
      for (let i = Math.max(1, lineNumber - contextLines); i < lineNumber; i++) {
        contextBefore.push({
          lineNumber: i,
          content: getLineContent(code, offsets, totalLines, i),
          originalPosition: getOriginalPosition(consumer, i),
        });
      }

      const contextAfter: ContextLine[] = [];
      for (let i = lineNumber + 1; i <= Math.min(totalLines, lineNumber + contextLines); i++) {
        contextAfter.push({
          lineNumber: i,
          content: getLineContent(code, offsets, totalLines, i),
          originalPosition: getOriginalPosition(consumer, i),
        });
      }

      matches.push({
        lineNumber,
        lineContent: getLineContent(code, offsets, totalLines, lineNumber),
        originalPosition: getOriginalPosition(consumer, lineNumber),
        contextBefore,
        contextAfter,
      });
    }

    // Timeout protection (still count but stop searching)
    if (Date.now() - startTime > timeoutMs) {
      break;
    }
  }

  return {
    matches,
    totalMatches: totalMatchesFound,
    truncated: totalMatchesFound > maxMatches,
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
 * Format a single code line with line number, source coordinates, and content
 * Matches the format used in read_code_smart
 */
function formatCodeLine(lineNumber: number, sourcePos: string, code: string, maxLineNumWidth: number, prefix: string = '  '): string {
  const lineNumStr = String(lineNumber).padStart(maxLineNumWidth, ' ');
  const srcPosPadded = sourcePos ? sourcePos.padEnd(10, ' ') : '          ';
  return `${prefix}${lineNumStr} ${srcPosPadded} ${code}`;
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

  // Header - matches read_code_smart format
  const caseInfo = caseSensitive ? 'case-sensitive' : 'case-insensitive';
  const modeInfo = isRegex ? 'regex' : 'literal';
  outputParts.push(`${filePath}`);
  outputParts.push(`Query="${query}" (${modeInfo}, ${caseInfo})`);
  outputParts.push(`Src=original position for breakpoints`);

  if (totalMatches === 0) {
    outputParts.push('Matches: None');
    return outputParts.join('\n');
  }

  const matchInfo = truncated
    ? `Matches: ${totalMatches} (showing first ${maxMatches})`
    : `Matches: ${totalMatches}`;
  outputParts.push(matchInfo);

  // Format each match
  for (const match of matches) {
    outputParts.push(`--- Line ${match.lineNumber} ---`);

    // Calculate max line number width for alignment
    const allLineNumbers = [
      ...match.contextBefore.map((c) => c.lineNumber),
      match.lineNumber,
      ...match.contextAfter.map((c) => c.lineNumber),
    ];
    const maxLineNumWidth = Math.max(...allLineNumbers.map((n) => String(n).length));

    // Format context before
    for (const ctx of match.contextBefore) {
      const srcPos = formatSourcePosition(ctx.originalPosition.line, ctx.originalPosition.column);
      outputParts.push(formatCodeLine(ctx.lineNumber, srcPos, ctx.content, maxLineNumWidth, '  '));
    }

    // Format match line with >> prefix
    const matchSrcPos = formatSourcePosition(match.originalPosition.line, match.originalPosition.column);
    outputParts.push(formatCodeLine(match.lineNumber, matchSrcPos, match.lineContent, maxLineNumWidth, '>>'));

    // Format context after
    for (const ctx of match.contextAfter) {
      const srcPos = formatSourcePosition(ctx.originalPosition.line, ctx.originalPosition.column);
      outputParts.push(formatCodeLine(ctx.lineNumber, srcPos, ctx.content, maxLineNumWidth, '  '));
    }
  }

  // Add truncation message if needed
  if (truncated) {
    outputParts.push(`\n... (${totalMatches - maxMatches} more matches not shown)`);
  }

  return outputParts.join('\n');
}
