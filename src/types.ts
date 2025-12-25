/**
 * Public types for smart-fs library
 * @module types
 */

import type { SupportedLanguage } from './languageDetector.js';
import type { SourceMap } from './beautifier.js';

/**
 * Options for processing files with smart-fs
 */
export interface ProcessingOptions {
  /** Override auto-detected language */
  language?: SupportedLanguage;
  /** Character limit for string truncation (default: 300) */
  charLimit?: number;
  /** Maximum characters per line (default: 500) */
  maxLineChars?: number;
  /** Preview length for truncated content (default: 50) */
  previewLength?: number;
  /** Save beautified file locally */
  saveLocal?: boolean;
}

/**
 * Result of processing a file
 */
export interface ProcessingResult {
  /** Processed code */
  code: string;
  /** Source map (null for unsupported languages) */
  sourceMap: SourceMap | null;
  /** Detected or specified language */
  language: SupportedLanguage;
  /** Whether fallback mode was used */
  usedFallback: boolean;
  /** Local file path if saved */
  localPath?: string;
  /** Error message if any */
  error?: string;
}

/**
 * Options for smartRead function
 */
export interface SmartReadOptions extends ProcessingOptions {
  /** Starting line number (1-based, inclusive) */
  startLine?: number;
  /** Ending line number (1-based, inclusive) */
  endLine?: number;
}

/**
 * Error codes for smart-fs operations
 */
export type ErrorCode = 
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_OPTIONS';

/**
 * Error result structure
 */
export interface ErrorResult {
  success: false;
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
}
