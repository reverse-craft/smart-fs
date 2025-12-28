/**
 * smart-fs - Smart file processing library
 * 
 * Provides code beautification, truncation, search, analysis, and transformation
 * with multi-language support and source map generation.
 * 
 * @module smart-fs
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Re-export all types
export * from './types.js';

// Re-export language detector
export {
  type SupportedLanguage,
  type LanguageInfo,
  detectLanguage,
  getLanguageInfo,
  isFullySupportedLanguage,
  getSupportedExtensions,
  isExtensionSupported,
} from './languageDetector.js';

// Re-export beautifier
export {
  type SourceMap,
  type BeautifyOptions,
  type BeautifyResult,
  type LocalPaths,
  type LocalCacheCheck,
  ensureBeautified,
  beautifyCode,
  beautifyJson,
  beautifyHtml,
  beautifyCss,
  getLocalPaths,
  isLocalCacheValid,
} from './beautifier.js';

// Re-export truncator
export {
  type TruncateOptions,
  type TruncateResult,
  truncateCode,
  truncateCodeFromFile,
  truncateFallback,
  truncateLongLines,
  truncateCodeHighPerf,
} from './truncator.js';

// Re-export searcher
export {
  type OriginalPosition as SearchOriginalPosition,
  type ContextLine,
  type SearchMatch,
  type SearchOptions,
  type SearchResult,
  searchInCode,
  formatSearchResult,
  formatSourcePosition as formatSearchSourcePosition,
  createRegex,
  escapeRegex,
  unescapeBackslashes,
} from './searcher.js';

// Re-export analyzer
export {
  type OriginalPosition as AnalyzeOriginalPosition,
  type LocationInfo,
  type BindingInfo,
  type AnalysisResult,
  type AnalyzeOptions,
  analyzeBindings,
  formatAnalysisResult,
  formatSourcePosition as formatAnalyzeSourcePosition,
  parseCode,
} from './analyzer.js';

// Re-export transformer
export {
  type TransformOptions,
  type TransformResult,
  type OutputPaths,
  type BabelPluginFunction,
  applyCustomTransform,
  loadBabelPlugin,
  runBabelTransform,
  getOutputPaths,
  cleanBasename,
} from './transformer.js';

// Import types for convenience functions
import type { SmartReadOptions, ProcessingResult } from './types.js';
import type { SearchOptions, SearchResult } from './searcher.js';
import type { AnalyzeOptions, AnalysisResult } from './analyzer.js';
import { detectLanguage, getLanguageInfo } from './languageDetector.js';
import { ensureBeautified } from './beautifier.js';
import { truncateCodeFromFile } from './truncator.js';
import { searchInCode, formatSearchResult } from './searcher.js';
import { analyzeBindings, formatAnalysisResult } from './analyzer.js';


/**
 * Smart read file with beautification and truncation
 * 
 * This is a convenience function that combines beautification and truncation
 * into a single operation. It handles:
 * - Language detection (or uses specified language)
 * - Code beautification (for supported languages)
 * - String/line truncation
 * - Optional line range extraction
 * 
 * @param filePath - Path to the file to read
 * @param options - Processing options
 * @returns ProcessingResult with processed code and metadata
 * 
 * @example
 * ```typescript
 * // Read and process entire file
 * const result = await smartRead('./src/app.js');
 * 
 * // Read specific lines with custom options
 * const result = await smartRead('./src/app.js', {
 *   startLine: 10,
 *   endLine: 50,
 *   charLimit: 200,
 *   maxLineChars: 400
 * });
 * ```
 */
export async function smartRead(
  filePath: string,
  options?: SmartReadOptions
): Promise<ProcessingResult> {
  const absolutePath = path.resolve(filePath);
  
  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    return {
      code: '',
      sourceMap: null,
      language: 'unknown',
      usedFallback: true,
      error: `File not found: ${filePath}`,
    };
  }
  
  // Detect or use specified language
  const langInfo = options?.language 
    ? getLanguageInfo(options.language)
    : detectLanguage(absolutePath);
  
  try {
    // Beautify the file
    const beautifyResult = await ensureBeautified(absolutePath, {
      language: options?.language,
    });
    
    let code = beautifyResult.code;
    
    // Extract line range if specified
    if (options?.startLine !== undefined || options?.endLine !== undefined) {
      const lines = code.split('\n');
      const startLine = Math.max(1, options?.startLine ?? 1);
      const endLine = Math.min(lines.length, options?.endLine ?? lines.length);
      code = lines.slice(startLine - 1, endLine).join('\n');
    }
    
    // Apply truncation
    const truncateResult = truncateCodeFromFile(absolutePath, code, {
      language: options?.language,
      charLimit: options?.charLimit,
      maxLineChars: options?.maxLineChars,
      previewLength: options?.previewLength,
    });
    
    return {
      code: truncateResult.code,
      sourceMap: beautifyResult.rawMap,
      language: langInfo.language,
      usedFallback: beautifyResult.usedFallback || truncateResult.usedFallback,
      localPath: beautifyResult.localPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: '',
      sourceMap: null,
      language: langInfo.language,
      usedFallback: true,
      error: message,
    };
  }
}

/**
 * Smart search in file with beautification and source map support
 * 
 * This function beautifies the file first, then searches in the beautified code.
 * Results include original file positions via source map for setting breakpoints.
 * 
 * @param filePath - Path to the file to search
 * @param query - Search query (text or regex pattern)
 * @param options - Search options
 * @returns SearchResult with matches and original positions
 * 
 * @example
 * ```typescript
 * // Simple text search
 * const result = await smartSearch('./src/app.js', 'function');
 * 
 * // Regex search with options
 * const result = await smartSearch('./src/app.js', 'function\\s+\\w+', {
 *   isRegex: true,
 *   caseSensitive: true,
 *   contextLines: 3
 * });
 * ```
 */
export async function smartSearch(
  filePath: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult & { formatted: string; error?: string }> {
  const absolutePath = path.resolve(filePath);
  
  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      formatted: `File not found: ${filePath}`,
      error: `File not found: ${filePath}`,
    };
  }
  
  try {
    // Beautify the file first
    const beautifyResult = await ensureBeautified(absolutePath);
    
    // Source map is required for search
    if (!beautifyResult.rawMap) {
      return {
        matches: [],
        totalMatches: 0,
        truncated: false,
        formatted: `Search not supported for this file type (no source map available)`,
        error: `Search requires source map support`,
      };
    }
    
    // Perform search
    const searchResult = searchInCode(
      beautifyResult.code,
      beautifyResult.rawMap,
      options ?? { query }
    );
    
    // Format result
    const formatted = formatSearchResult(
      filePath,
      query,
      options?.caseSensitive ?? false,
      searchResult,
      options?.maxMatches ?? 50,
      options?.isRegex ?? false
    );
    
    return {
      ...searchResult,
      formatted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      formatted: `Search error: ${message}`,
      error: message,
    };
  }
}

/**
 * Find variable/function usage in file
 * 
 * This function analyzes the code to find all bindings (definitions and references)
 * for a specific identifier. Results include original file positions via source map.
 * 
 * @param filePath - Path to the file to analyze
 * @param identifier - Variable or function name to find
 * @param options - Analysis options
 * @returns AnalysisResult with bindings and original positions
 * 
 * @example
 * ```typescript
 * // Find all usages of 'myFunction'
 * const result = await findUsage('./src/app.js', 'myFunction');
 * 
 * // Find usage at specific line
 * const result = await findUsage('./src/app.js', 'data', {
 *   targetLine: 42
 * });
 * ```
 */
export async function findUsage(
  filePath: string,
  identifier: string,
  options?: AnalyzeOptions
): Promise<AnalysisResult & { formatted: string; error?: string }> {
  const absolutePath = path.resolve(filePath);
  
  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    return {
      bindings: [],
      identifier,
      isTargeted: options?.targetLine !== undefined,
      targetLine: options?.targetLine,
      formatted: `File not found: ${filePath}`,
      error: `File not found: ${filePath}`,
    };
  }
  
  try {
    // Beautify the file first
    const beautifyResult = await ensureBeautified(absolutePath);
    
    // Source map is required for analysis
    if (!beautifyResult.rawMap) {
      return {
        bindings: [],
        identifier,
        isTargeted: options?.targetLine !== undefined,
        targetLine: options?.targetLine,
        formatted: `Analysis not supported for this file type (no source map available)`,
        error: `Analysis requires source map support`,
      };
    }
    
    // Perform analysis
    const analysisResult = await analyzeBindings(
      beautifyResult.code,
      beautifyResult.rawMap,
      identifier,
      options
    );
    
    // Format result
    const formatted = formatAnalysisResult(
      filePath,
      analysisResult,
      options?.maxReferences ?? 10
    );
    
    return {
      ...analysisResult,
      formatted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      bindings: [],
      identifier,
      isTargeted: options?.targetLine !== undefined,
      targetLine: options?.targetLine,
      formatted: `Analysis error: ${message}`,
      error: message,
    };
  }
}
