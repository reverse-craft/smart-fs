import * as path from 'path';

/**
 * Supported language types for smart-fs processing
 */
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'xml'
  | 'css'
  | 'unknown';

/**
 * Information about a language's processing capabilities
 */
export interface LanguageInfo {
  /** The language identifier */
  language: SupportedLanguage;
  /** Whether AST-based processing is supported */
  supportsAST: boolean;
  /** Whether beautification is supported */
  supportsBeautify: boolean;
  /** Whether source map generation is supported */
  supportsSourceMap: boolean;
}

/**
 * Language configuration mapping
 */
const LANGUAGE_CONFIG: Record<SupportedLanguage, LanguageInfo> = {
  javascript: {
    language: 'javascript',
    supportsAST: true,
    supportsBeautify: true,
    supportsSourceMap: true,
  },
  typescript: {
    language: 'typescript',
    supportsAST: true,
    supportsBeautify: true,
    supportsSourceMap: true,
  },
  json: {
    language: 'json',
    supportsAST: false,
    supportsBeautify: true,
    supportsSourceMap: false,
  },
  html: {
    language: 'html',
    supportsAST: false,
    supportsBeautify: true,
    supportsSourceMap: false,
  },
  xml: {
    language: 'xml',
    supportsAST: false,
    supportsBeautify: true,
    supportsSourceMap: false,
  },
  css: {
    language: 'css',
    supportsAST: false,
    supportsBeautify: true,
    supportsSourceMap: false,
  },
  unknown: {
    language: 'unknown',
    supportsAST: false,
    supportsBeautify: false,
    supportsSourceMap: false,
  },
};

/**
 * File extension to language mapping
 */
const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.css': 'css',
};

/**
 * Detect language from file path based on extension
 * 
 * @param filePath - Path to the file (can be relative or absolute)
 * @returns LanguageInfo object with detected language and capabilities
 * 
 * @example
 * ```typescript
 * const info = detectLanguage('./src/app.ts');
 * // { language: 'typescript', supportsAST: true, supportsBeautify: true, supportsSourceMap: true }
 * 
 * const unknown = detectLanguage('./readme.md');
 * // { language: 'unknown', supportsAST: false, supportsBeautify: false, supportsSourceMap: false }
 * ```
 */
export function detectLanguage(filePath: string): LanguageInfo {
  const ext = path.extname(filePath).toLowerCase();
  const language = EXTENSION_MAP[ext] ?? 'unknown';
  return LANGUAGE_CONFIG[language];
}

/**
 * Get language info by explicit language name
 * 
 * @param language - The language identifier
 * @returns LanguageInfo object with language capabilities
 * 
 * @example
 * ```typescript
 * const info = getLanguageInfo('typescript');
 * // { language: 'typescript', supportsAST: true, supportsBeautify: true, supportsSourceMap: true }
 * ```
 */
export function getLanguageInfo(language: SupportedLanguage): LanguageInfo {
  return LANGUAGE_CONFIG[language];
}

/**
 * Check if a language supports full processing (AST + beautify + source map)
 * 
 * @param language - The language identifier
 * @returns true if the language supports all processing features
 * 
 * @example
 * ```typescript
 * isFullySupportedLanguage('javascript'); // true
 * isFullySupportedLanguage('json'); // false (no AST or source map)
 * isFullySupportedLanguage('unknown'); // false
 * ```
 */
export function isFullySupportedLanguage(language: SupportedLanguage): boolean {
  const info = LANGUAGE_CONFIG[language];
  return info.supportsAST && info.supportsBeautify && info.supportsSourceMap;
}

/**
 * Get all supported file extensions
 * 
 * @returns Array of supported file extensions (including the dot)
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}

/**
 * Check if a file extension is supported (not unknown)
 * 
 * @param ext - File extension (with or without leading dot)
 * @returns true if the extension maps to a known language
 */
export function isExtensionSupported(ext: string): boolean {
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return normalizedExt in EXTENSION_MAP;
}
