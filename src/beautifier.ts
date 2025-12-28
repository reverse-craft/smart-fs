import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import * as babelGenerator from '@babel/generator';
import { detectLanguage, getLanguageInfo, type SupportedLanguage } from './languageDetector.js';

// Handle both ESM default export and CommonJS module.exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate = (babelGenerator as any).default || babelGenerator;

export interface SourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
  file?: string;
  sourceRoot?: string;
}

export interface BeautifyOptions {
  /** Override auto-detected language */
  language?: SupportedLanguage;
}

export interface BeautifyResult {
  code: string;
  /** Source map (null for languages that don't support it) */
  rawMap: SourceMap | null;
  /** 本地保存的美化文件路径 */
  localPath: string;
  /** 本地保存的 source map 路径 */
  localMapPath: string;
  /** 本地保存失败时的错误信息 */
  localSaveError?: string;
  /** Whether fallback mode was used */
  usedFallback: boolean;
}

/**
 * Local paths result interface
 */
export interface LocalPaths {
  /** Path to the beautified file in the same directory as the original */
  beautifiedPath: string;
  /** Path to the source map file in the same directory as the original */
  mapPath: string;
}

/**
 * Get local file paths for beautified output
 * Given an original file path, returns the paths where the beautified file
 * and source map should be saved in the same directory.
 * 
 * Naming convention:
 * - Original: {filename}.js -> Beautified: {filename}.beautified.js
 * - Source map: {filename}.beautified.js.map
 * 
 * @param originalPath - Path to the original JavaScript file
 * @returns Object containing beautifiedPath and mapPath
 */
export function getLocalPaths(originalPath: string): LocalPaths {
  const absolutePath = path.resolve(originalPath);
  const dir = path.dirname(absolutePath);
  const ext = path.extname(absolutePath);
  const baseName = path.basename(absolutePath, ext);
  
  const cacheDir = path.join(dir, '__smart_fs_cache__');
  const beautifiedPath = path.join(cacheDir, `${baseName}.beautified.js`);
  const mapPath = `${beautifiedPath}.map`;
  
  return { beautifiedPath, mapPath };
}

/**
 * Local cache validation result interface
 */
export interface LocalCacheCheck {
  /** Original file modification time in milliseconds */
  originalMtime: number;
  /** Whether the beautified file exists */
  beautifiedExists: boolean;
  /** Beautified file modification time in milliseconds (0 if not exists) */
  beautifiedMtime: number;
  /** Whether the cache is valid (beautifiedMtime >= originalMtime) */
  isValid: boolean;
}

/**
 * Check if local beautified cache is valid
 * 
 * A local cache is considered valid when:
 * 1. The beautified file exists
 * 2. The beautified file's modification time is >= the original file's modification time
 * 
 * @param originalPath - Path to the original JavaScript file
 * @returns LocalCacheCheck object with validation details
 */
export async function isLocalCacheValid(originalPath: string): Promise<LocalCacheCheck> {
  const absolutePath = path.resolve(originalPath);
  const { beautifiedPath } = getLocalPaths(absolutePath);
  
  // Get original file stats
  let originalStats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    originalStats = await fs.stat(absolutePath);
  } catch {
    // Original file doesn't exist - cache cannot be valid
    return {
      originalMtime: 0,
      beautifiedExists: false,
      beautifiedMtime: 0,
      isValid: false
    };
  }
  
  const originalMtime = originalStats.mtimeMs;
  
  // Check if beautified file exists and get its stats
  let beautifiedStats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    beautifiedStats = await fs.stat(beautifiedPath);
  } catch {
    // Beautified file doesn't exist
    return {
      originalMtime,
      beautifiedExists: false,
      beautifiedMtime: 0,
      isValid: false
    };
  }
  
  const beautifiedMtime = beautifiedStats.mtimeMs;
  const isValid = beautifiedMtime >= originalMtime;
  
  return {
    originalMtime,
    beautifiedExists: true,
    beautifiedMtime,
    isValid
  };
}

/**
 * Beautify JSON content with proper indentation
 * @param content - JSON string to beautify
 * @returns Object with beautified JSON string and error flag
 */
export function beautifyJson(content: string): { code: string; parseFailed: boolean } {
  try {
    const parsed = JSON.parse(content);
    return { code: JSON.stringify(parsed, null, 2), parseFailed: false };
  } catch {
    // If parsing fails, return original content (Requirement 8.5)
    return { code: content, parseFailed: true };
  }
}

/**
 * Simple HTML/XML beautification with indentation
 * This is a basic formatter that handles common cases
 * @param content - HTML/XML string to beautify
 * @returns Beautified HTML/XML string, or original content if formatting fails
 */
export function beautifyHtml(content: string): string {
  try {
    // Simple regex-based formatting for HTML/XML
    // This handles basic indentation without a full parser
    
    let formatted = '';
    let indent = 0;
    const indentStr = '  '; // 2 spaces
    
    // Normalize line endings and split by tags
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split content into tokens (tags and text)
    const tokens = normalized.split(/(<[^>]+>)/g).filter(token => token.trim() !== '');
    
    for (const token of tokens) {
      const trimmedToken = token.trim();
      
      if (!trimmedToken) continue;
      
      // Check if it's a tag
      if (trimmedToken.startsWith('<')) {
        // Self-closing tag or declaration
        if (trimmedToken.startsWith('<!') || 
            trimmedToken.startsWith('<?') || 
            trimmedToken.endsWith('/>')) {
          formatted += indentStr.repeat(indent) + trimmedToken + '\n';
        }
        // Closing tag
        else if (trimmedToken.startsWith('</')) {
          indent = Math.max(0, indent - 1);
          formatted += indentStr.repeat(indent) + trimmedToken + '\n';
        }
        // Opening tag
        else {
          formatted += indentStr.repeat(indent) + trimmedToken + '\n';
          indent++;
        }
      } else {
        // Text content - preserve it with current indentation
        const textLines = trimmedToken.split('\n');
        for (const line of textLines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            formatted += indentStr.repeat(indent) + trimmedLine + '\n';
          }
        }
      }
    }
    
    return formatted.trimEnd();
  } catch {
    // If formatting fails, return original content (Requirement 8.5)
    return content;
  }
}

/**
 * Simple CSS beautification with indentation
 * @param content - CSS string to beautify
 * @returns Beautified CSS string, or original content if formatting fails
 */
export function beautifyCss(content: string): string {
  try {
    // Simple regex-based formatting for CSS
    let formatted = content;
    
    // Normalize line endings
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Add newline after { and before }
    formatted = formatted.replace(/\{/g, ' {\n');
    formatted = formatted.replace(/\}/g, '\n}\n');
    
    // Add newline after ;
    formatted = formatted.replace(/;/g, ';\n');
    
    // Clean up multiple newlines
    formatted = formatted.replace(/\n\s*\n/g, '\n');
    
    // Add indentation
    const lines = formatted.split('\n');
    let indent = 0;
    const indentStr = '  ';
    const result: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Decrease indent before closing brace
      if (trimmed.startsWith('}')) {
        indent = Math.max(0, indent - 1);
      }
      
      result.push(indentStr.repeat(indent) + trimmed);
      
      // Increase indent after opening brace
      if (trimmed.endsWith('{')) {
        indent++;
      }
    }
    
    return result.join('\n');
  } catch {
    // If formatting fails, return original content (Requirement 8.5)
    return content;
  }
}

/**
 * Beautify code string directly based on language
 * @param code - Source code to beautify
 * @param language - Language type
 * @returns Beautified code (or original if fallback mode)
 */
export function beautifyCode(
  code: string,
  language: SupportedLanguage
): { code: string; usedFallback: boolean } {
  const langInfo = getLanguageInfo(language);
  
  // If language doesn't support beautification, return original (fallback mode)
  if (!langInfo.supportsBeautify) {
    return { code, usedFallback: true };
  }
  
  switch (language) {
    case 'json': {
      const result = beautifyJson(code);
      // If JSON parsing failed, use fallback mode (Requirement 8.4)
      return { code: result.code, usedFallback: result.parseFailed };
    }
    case 'html':
    case 'xml':
      return { code: beautifyHtml(code), usedFallback: false };
    case 'css':
      return { code: beautifyCss(code), usedFallback: false };
    case 'javascript':
    case 'typescript':
      // JS/TS beautification requires async Babel, handled separately
      // This function is for sync beautification of simple formats
      return { code, usedFallback: true };
    default:
      // Unknown language - fallback mode
      return { code, usedFallback: true };
  }
}

/**
 * Beautify file based on detected or specified language
 * - JS/TS: Use Babel for formatting with source map (preserves all variable names)
 * - JSON: Use JSON.stringify with indentation
 * - HTML/XML: Use simple indentation-based formatting
 * - CSS: Use simple formatting
 * - Unknown: Return original (fallback mode)
 * 
 * @param originalPath - Original file path
 * @param options - Optional beautify options (language override)
 * @returns Beautified code and Source Map (null for non-JS/TS)
 */
export async function ensureBeautified(
  originalPath: string,
  options?: BeautifyOptions
): Promise<BeautifyResult> {
  // Resolve to absolute path
  const absolutePath = path.resolve(originalPath);
  
  // Check if file exists
  try {
    await fs.stat(absolutePath);
  } catch {
    throw new Error(`File not found: ${originalPath}`);
  }
  
  // Detect or use specified language
  const langInfo = options?.language 
    ? getLanguageInfo(options.language)
    : detectLanguage(absolutePath);
  
  const language = langInfo.language;
  
  // Get local paths (same directory as original file)
  const localPaths = getLocalPaths(absolutePath);
  
  // Handle non-JS/TS languages (no caching, no source map)
  if (language !== 'javascript' && language !== 'typescript') {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const beautified = beautifyCode(content, language);
    
    return {
      code: beautified.code,
      rawMap: null, // No source map for non-JS/TS
      localPath: localPaths.beautifiedPath,
      localMapPath: localPaths.mapPath,
      usedFallback: beautified.usedFallback,
    };
  }
  
  // JS/TS processing with Babel and caching
  // Check local cache first (same directory as original file)
  const localCacheCheck = await isLocalCacheValid(absolutePath);
  if (localCacheCheck.isValid) {
    // Local cache hit - read from local files
    try {
      const [code, mapContent] = await Promise.all([
        fs.readFile(localPaths.beautifiedPath, 'utf-8'),
        fs.readFile(localPaths.mapPath, 'utf-8')
      ]);
      return {
        code,
        rawMap: JSON.parse(mapContent) as SourceMap,
        localPath: localPaths.beautifiedPath,
        localMapPath: localPaths.mapPath,
        usedFallback: false,
      };
    } catch {
      // If reading local cache fails, fall through to regenerate
    }
  }
  
  // Cache miss - beautify with Babel
  const content = await fs.readFile(absolutePath, 'utf-8');
  
  let code: string;
  let rawMap: SourceMap | null = null;
  let mapText: string | null = null;
  
  try {
    // Parse with Babel - use permissive settings for potentially malformed code
    const ast = parse(content, {
      sourceType: 'unambiguous', // Auto-detect module vs script
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'nullishCoalescingOperator',
        'optionalChaining',
        'bigInt',
        'topLevelAwait',
      ],
      errorRecovery: true, // Continue parsing even with errors
    });
    
    // Generate beautified code with source map
    const generated = generate(ast, {
      sourceMaps: true,
      sourceFileName: path.basename(absolutePath),
      // Beautify settings - preserve original structure
      retainLines: false,
      compact: false,
      minified: false,
      comments: true,
      // Use consistent formatting
      jsescOption: {
        minimal: true,
      },
    }, content);
    
    code = generated.code;
    
    // Convert Babel source map to our SourceMap format
    if (generated.map) {
      rawMap = {
        version: generated.map.version,
        sources: generated.map.sources,
        names: generated.map.names,
        mappings: generated.map.mappings,
        file: generated.map.file,
        sourceRoot: generated.map.sourceRoot,
      };
      mapText = JSON.stringify(rawMap);
    }
  } catch (err) {
    // Babel 失败时直接抛出错误，不允许静默回退
    const error = err as Error;
    throw new Error(`Babel beautification failed for ${originalPath}: ${error.message || String(err)}`);
  }
  
  const result: BeautifyResult = {
    code,
    rawMap,
    localPath: localPaths.beautifiedPath,
    localMapPath: localPaths.mapPath,
    usedFallback: false,
  };
  
  // Save to local directory (same directory as original file)
  if (mapText) {
    await saveToLocal(result, localPaths, mapText);
  }
  
  return result;
}

/**
 * Save beautified code and source map to local directory
 * Handles errors gracefully by setting localSaveError instead of throwing
 */
async function saveToLocal(
  result: BeautifyResult,
  localPaths: LocalPaths,
  mapText: string
): Promise<void> {
  try {
    // Ensure cache directory exists
    const cacheDir = path.dirname(localPaths.beautifiedPath);
    await fs.mkdir(cacheDir, { recursive: true });
    
    await Promise.all([
      fs.writeFile(localPaths.beautifiedPath, result.code, 'utf-8'),
      fs.writeFile(localPaths.mapPath, mapText, 'utf-8')
    ]);
    result.localPath = localPaths.beautifiedPath;
    result.localMapPath = localPaths.mapPath;
  } catch (err) {
    // Handle specific error types
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      result.localSaveError = `Permission denied: Cannot write to ${path.dirname(localPaths.beautifiedPath)}`;
    } else if (error.code === 'ENOSPC') {
      result.localSaveError = `Insufficient disk space: Cannot write to ${path.dirname(localPaths.beautifiedPath)}`;
    } else {
      result.localSaveError = `Failed to save locally: ${error.message || String(err)}`;
    }
    // Don't throw - the result is still valid
  }
}
