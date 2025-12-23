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

export interface BeautifyResult {
  code: string;
  rawMap: SourceMap;
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
 * Check if cache exists and is valid
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
 * Beautify JavaScript file and generate Source Map
 * @param originalPath - Original file path
 * @returns Beautified code and Source Map
 */
export async function ensureBeautified(originalPath: string): Promise<BeautifyResult> {
  // Resolve to absolute path
  const absolutePath = path.resolve(originalPath);
  
  // Check if file exists
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    throw new Error(`File not found: ${originalPath}`);
  }
  
  // Ensure cache directory exists
  await ensureCacheDir();
  
  // Calculate cache key
  const hash = calculateCacheKey(absolutePath, stats.mtimeMs);
  const { beautifiedPath, mapPath } = getCachePaths(absolutePath, hash);
  
  // Check cache
  if (await isCacheValid(beautifiedPath, mapPath)) {
    // Cache hit - read from cache
    const [code, mapContent] = await Promise.all([
      fs.readFile(beautifiedPath, 'utf-8'),
      fs.readFile(mapPath, 'utf-8')
    ]);
    return {
      code,
      rawMap: JSON.parse(mapContent) as SourceMap
    };
  }
  
  // Cache miss - beautify with Esbuild
  let result: esbuild.BuildResult;
  try {
    result = await esbuild.build({
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
  const codeFile = result.outputFiles?.find(f => f.path.endsWith('.js'));
  const mapFile = result.outputFiles?.find(f => f.path.endsWith('.map'));
  
  if (!codeFile || !mapFile) {
    throw new Error('Esbuild processing failed: Missing output files');
  }
  
  const code = codeFile.text;
  const rawMap = JSON.parse(mapFile.text) as SourceMap;
  
  // Write to cache
  await Promise.all([
    fs.writeFile(beautifiedPath, code, 'utf-8'),
    fs.writeFile(mapPath, mapFile.text, 'utf-8')
  ]);
  
  return { code, rawMap };
}
