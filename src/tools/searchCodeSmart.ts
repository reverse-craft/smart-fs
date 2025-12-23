import { z } from 'zod';
import { defineTool } from './ToolDefinition.js';
import { ensureBeautified } from '../beautifier.js';
import { truncateCodeHighPerf, truncateLongLines } from '../truncator.js';
import { searchInCode, formatSearchResult, unescapeBackslashes } from '../searcher.js';

/**
 * Schema for search_code_smart tool input validation
 */
export const SearchCodeSmartInputSchema = z.object({
  file_path: z.string().describe('Path to the JavaScript file'),
  query: z.string().describe('Regex pattern or text to search'),
  context_lines: z.number().int().min(0).default(2).describe('Number of context lines'),
  case_sensitive: z.boolean().default(false).describe('Case sensitive search'),
  char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
  max_line_chars: z.number().int().min(80).default(500).describe('Maximum characters per line'),
  is_regex: z.boolean().default(false).describe('Treat query as regex pattern (default: false for literal text search)'),
});

/**
 * search_code_smart tool definition
 * Search for text or regex patterns in beautified JavaScript code.
 */
export const searchCodeSmart = defineTool({
  name: 'search_code_smart',
  description:
    'Search for text or regex patterns in beautified JavaScript code. ' +
    'Returns matching lines with context and original source coordinates for setting breakpoints. ' +
    'Useful for finding code patterns in minified/obfuscated files.',
  schema: {
    file_path: z.string().describe('Path to the JavaScript file'),
    query: z.string().describe('Regex pattern or text to search'),
    context_lines: z.number().int().min(0).default(2).describe('Number of context lines'),
    case_sensitive: z.boolean().default(false).describe('Case sensitive search'),
    char_limit: z.number().int().min(50).default(300).describe('Character limit for string truncation'),
    max_line_chars: z.number().int().min(80).default(500).describe('Maximum characters per line'),
    is_regex: z.boolean().default(false).describe('Treat query as regex pattern (default: false for literal text search)'),
  },
  handler: async (params) => {
    const { file_path, query, context_lines, case_sensitive, char_limit, max_line_chars, is_regex } = params;

    // Unescape double-escaped backslashes from MCP JSON transmission
    const unescapedQuery = unescapeBackslashes(query);

    // Beautify the file and get source map
    const beautifyResult = await ensureBeautified(file_path);
    const { code, rawMap } = beautifyResult;

    // Truncate long strings before searching
    const truncatedCode = truncateCodeHighPerf(code, char_limit);

    // Execute search
    const searchResult = searchInCode(truncatedCode, rawMap, {
      query: unescapedQuery,
      contextLines: context_lines,
      caseSensitive: case_sensitive,
      maxMatches: 50,
      isRegex: is_regex,
    });

    // Format the result
    let output = formatSearchResult(file_path, unescapedQuery, case_sensitive, searchResult, 50, is_regex);

    // Truncate long lines in output
    output = truncateLongLines(output, max_line_chars);

    return output;
  },
});
