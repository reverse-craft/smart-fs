import * as esbuild from 'esbuild';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'jsvmp-mcp-cache');

export interface SourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
  file?: string;
  sourceRoot?: string;
}

export interface BeautifyOptions {
  /** 是否保存到原始文件同级目录 */
  saveLocal?: boolean;
}

export interface BeautifyResult {
  code: string;
  rawMap: SourceMap;
  /** 本地保存的美化文件路径 (仅当 saveLocal=true 时存在) */
  localPath?: string;
  /** 本地保存的 source map 路径 (仅当 saveLocal=true 时存在) */
  localMapPath?: string;
  /** 本地保存失败时的错误信息 */
  localSaveError?: string;
}

/**
 * Ensure the cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Calculate cache key based on file path and modification time
 */
function calculateCacheKey(originalPath: string, mtimeMs: number): string {
  const fileKey = `${originalPath}-${mtimeMs}`;
  return crypto.createHash('md5').update(fileKey).digest('hex');
}

/**
 * Get cache file paths for a given original file
 */
function getCachePaths(originalPath: string, hash: string): { beautifiedPath: string; mapPath: string } {
  const fileName = path.basename(originalPath, '.js');
  const beautifiedPath = path.join(TEMP_DIR, `${fileName}.${hash}.beautified.js`);
  const mapPath = `${beautifiedPath}.map`;
  return { beautifiedPath, mapPath };
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
  
  const beautifiedPath = path.join(dir, `${baseName}.beautified.js`);
  const mapPath = `${beautifiedPath}.map`;
  
  return { beautifiedPath, mapPath };
}

/**
 * Check if cache exists and is valid (for temp directory cache)
 */
async function isCacheValid(beautifiedPath: string, mapPath: string): Promise<boolean> {
  try {
    await Promise.all([
      fs.access(beautifiedPath),
      fs.access(mapPath)
    ]);
    return true;
  } catch {
    return false;
  }
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
 * Beautify JavaScript file and generate Source Map
 * @param originalPath - Original file path
 * @param options - Optional beautify options (saveLocal, etc.)
 * @returns Beautified code and Source Map
 */
export async function ensureBeautified(
  originalPath: string,
  options?: BeautifyOptions
): Promise<BeautifyResult> {
  // Resolve to absolute path
  const absolutePath = path.resolve(originalPath);
  const saveLocal = options?.saveLocal ?? false;
  
  // Check if file exists
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    throw new Error(`File not found: ${originalPath}`);
  }
  
  // Get local paths for potential local save/read
  const localPaths = getLocalPaths(absolutePath);
  
  // If saveLocal is true, check local cache first
  if (saveLocal) {
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
          localMapPath: localPaths.mapPath
        };
      } catch {
        // If reading local cache fails, fall through to regenerate
      }
    }
  }
  
  // Ensure temp cache directory exists
  await ensureCacheDir();
  
  // Calculate cache key for temp directory
  const hash = calculateCacheKey(absolutePath, stats.mtimeMs);
  const { beautifiedPath, mapPath } = getCachePaths(absolutePath, hash);
  
  // Check temp cache
  if (await isCacheValid(beautifiedPath, mapPath)) {
    // Temp cache hit - read from cache
    const [code, mapContent] = await Promise.all([
      fs.readFile(beautifiedPath, 'utf-8'),
      fs.readFile(mapPath, 'utf-8')
    ]);
    
    const result: BeautifyResult = {
      code,
      rawMap: JSON.parse(mapContent) as SourceMap
    };
    
    // If saveLocal is true, also save to local directory
    if (saveLocal) {
      await saveToLocal(result, localPaths, mapContent);
    }
    
    return result;
  }
  
  // Cache miss - beautify with Esbuild
  let esbuildResult: esbuild.BuildResult;
  try {
    esbuildResult = await esbuild.build({
      entryPoints: [absolutePath],
      bundle: false,
      write: false,
      format: 'esm',
      sourcemap: 'external',
      sourcesContent: false,
      outfile: 'out.js',
      // Beautify settings
      minify: false,
      keepNames: true,
      treeShaking: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Esbuild processing failed: ${message}`);
  }
  
  // Extract code and source map from result
  const codeFile = esbuildResult.outputFiles?.find(f => f.path.endsWith('.js'));
  const mapFile = esbuildResult.outputFiles?.find(f => f.path.endsWith('.map'));
  
  if (!codeFile || !mapFile) {
    throw new Error('Esbuild processing failed: Missing output files');
  }
  
  const code = codeFile.text;
  const rawMap = JSON.parse(mapFile.text) as SourceMap;
  const mapText = mapFile.text;
  
  // Write to temp cache
  await Promise.all([
    fs.writeFile(beautifiedPath, code, 'utf-8'),
    fs.writeFile(mapPath, mapText, 'utf-8')
  ]);
  
  const result: BeautifyResult = { code, rawMap };
  
  // If saveLocal is true, also save to local directory
  if (saveLocal) {
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
    // Don't throw - the temp cache result is still valid
  }
}
