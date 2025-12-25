import * as path from 'path';
import * as fs from 'fs/promises';
import { transformSync, type BabelFileResult, type PluginItem } from '@babel/core';
import { ensureBeautified, type SourceMap } from './beautifier.js';

/**
 * Transform options interface
 */
export interface TransformOptions {
  /** Path to the user's Babel plugin script */
  scriptPath: string;
  /** Output file suffix (default "_deob") */
  outputSuffix?: string;
}

/**
 * Transform result interface
 */
export interface TransformResult {
  /** Transformed code */
  code: string;
  /** Cascaded Source Map */
  map: SourceMap;
  /** Output file path */
  outputPath: string;
  /** Source Map file path */
  mapPath: string;
}

/**
 * Output paths interface
 */
export interface OutputPaths {
  /** Output JS file path */
  outputPath: string;
  /** Source Map file path */
  mapPath: string;
}

/**
 * Clean basename by removing .beautified and _deob* suffixes
 * 
 * Examples:
 * - main.js -> main
 * - main.beautified.js -> main
 * - main_deob.js -> main
 * - main.beautified_deob.js -> main
 * - main_deob_v2.js -> main
 * 
 * @param filename - Original filename (with or without path)
 * @returns Cleaned basename without extension
 */
export function cleanBasename(filename: string): string {
  // Get just the filename without directory
  const base = path.basename(filename);
  
  // Remove .js extension
  let name = base.endsWith('.js') ? base.slice(0, -3) : base;
  
  // Remove _deob* suffix first (e.g., _deob, _deob_v2, _deob123)
  // This handles cases like main.beautified_deob.js
  name = name.replace(/_deob[^/]*$/, '');
  
  // Remove .beautified suffix if present
  if (name.endsWith('.beautified')) {
    name = name.slice(0, -'.beautified'.length);
  }
  
  return name;
}

/**
 * Calculate output paths for transformed file
 * 
 * @param targetFile - Path to the target file
 * @param outputSuffix - Suffix for output file (default "_deob")
 * @returns Output paths for JS and map files
 */
export function getOutputPaths(targetFile: string, outputSuffix: string = '_deob'): OutputPaths {
  const absolutePath = path.resolve(targetFile);
  const dir = path.dirname(absolutePath);
  const basename = cleanBasename(absolutePath);
  
  const outputPath = path.join(dir, `${basename}${outputSuffix}.js`);
  const mapPath = `${outputPath}.map`;
  
  return { outputPath, mapPath };
}

/**
 * Babel plugin function type
 * A Babel plugin is a function that receives babel API and returns a visitor object
 */
export type BabelPluginFunction = (babel: { types: typeof import('@babel/types') }) => {
  visitor: Record<string, unknown>;
};

/**
 * Load a Babel plugin script from the given path
 * 
 * Features:
 * - Resolves to absolute path
 * - Clears require cache for hot-reloading
 * - Validates plugin format
 * 
 * @param scriptPath - Path to the Babel plugin script
 * @returns The loaded Babel plugin function
 * @throws Error if script not found or invalid format
 */
export async function loadBabelPlugin(scriptPath: string): Promise<BabelPluginFunction> {
  // Resolve to absolute path
  const absolutePath = path.resolve(scriptPath);
  
  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Script not found: ${absolutePath}`);
  }
  
  // Convert to file URL for ESM import
  const fileUrl = `file://${absolutePath}?t=${Date.now()}`;
  
  // Dynamic import with cache busting for hot-reload
  let module: unknown;
  try {
    module = await import(fileUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load script: ${message}`);
  }
  
  // Extract the plugin function
  const plugin = (module as { default?: unknown }).default ?? module;
  
  // Validate plugin format - must be a function
  if (typeof plugin !== 'function') {
    throw new Error(
      `Invalid Babel plugin: Script must export a function that returns a visitor object. ` +
      `Got ${typeof plugin} instead.`
    );
  }
  
  return plugin as BabelPluginFunction;
}


/**
 * Babel transform result interface
 */
interface BabelTransformResult {
  /** Transformed code */
  code: string;
  /** Generated source map (cascaded) */
  map: SourceMap;
}

/**
 * Run Babel transform with source map cascade
 * 
 * Configuration:
 * - inputSourceMap: Enables cascade from beautified -> original
 * - sourceMaps: true to generate output source map
 * - retainLines: false for best readability
 * - compact: false for readable output
 * - minified: false for readable output
 * 
 * @param code - Input code (beautified)
 * @param inputSourceMap - Source map from beautifier (beautified -> original)
 * @param plugin - Babel plugin function
 * @param filename - Original filename for source map
 * @returns Transformed code and cascaded source map
 */
export function runBabelTransform(
  code: string,
  inputSourceMap: SourceMap,
  plugin: BabelPluginFunction,
  filename: string
): BabelTransformResult {
  let result: BabelFileResult | null;
  
  try {
    result = transformSync(code, {
      filename,
      plugins: [plugin as PluginItem],
      // Source map configuration for cascade
      // @ts-expect-error - SourceMap is compatible with InputSourceMap at runtime
      inputSourceMap: inputSourceMap,
      sourceMaps: true,
      // Readability settings
      retainLines: false,
      compact: false,
      minified: false,
      // Preserve code structure
      parserOpts: {
        sourceType: 'unambiguous',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Babel Error: ${message}`);
  }
  
  if (!result || !result.code) {
    throw new Error('Babel Error: Transform produced no output');
  }
  
  if (!result.map) {
    throw new Error('Babel Error: Transform produced no source map');
  }
  
  return {
    code: result.code,
    map: result.map as unknown as SourceMap,
  };
}


/**
 * Apply custom Babel transform to a JavaScript file
 * 
 * Process:
 * 1. Load and validate the Babel plugin script
 * 2. Get beautified code and source map from target file
 * 3. Run Babel transform with source map cascade
 * 4. Write output file and source map
 * 5. Append sourceMappingURL comment
 * 
 * @param targetFile - Path to the JavaScript file to transform
 * @param options - Transform options (scriptPath, outputSuffix)
 * @returns Transform result with output paths
 */
export async function applyCustomTransform(
  targetFile: string,
  options: TransformOptions
): Promise<TransformResult> {
  const { scriptPath, outputSuffix = '_deob' } = options;
  
  // Resolve target file path
  const absoluteTargetPath = path.resolve(targetFile);
  
  // Check if target file exists
  try {
    await fs.access(absoluteTargetPath);
  } catch {
    throw new Error(`File not found: ${targetFile}`);
  }
  
  // Load the Babel plugin script
  const plugin = await loadBabelPlugin(scriptPath);
  
  // Get beautified code and source map
  const beautifyResult = await ensureBeautified(absoluteTargetPath);
  const { code: beautifiedCode, rawMap: inputSourceMap } = beautifyResult;
  
  // Ensure source map is available (required for cascade)
  if (!inputSourceMap) {
    throw new Error(`Cannot transform ${targetFile}: Source map generation failed during beautification`);
  }
  
  // Run Babel transform with source map cascade
  const transformResult = runBabelTransform(
    beautifiedCode,
    inputSourceMap,
    plugin,
    absoluteTargetPath
  );
  
  // Calculate output paths
  const { outputPath, mapPath } = getOutputPaths(absoluteTargetPath, outputSuffix);
  
  // Prepare output code with sourceMappingURL comment
  const mapFileName = path.basename(mapPath);
  const outputCode = `${transformResult.code}\n//# sourceMappingURL=${mapFileName}`;
  
  // Prepare source map with correct file reference
  const outputMap: SourceMap = {
    ...transformResult.map,
    file: path.basename(outputPath),
  };
  
  // Write output files
  try {
    await Promise.all([
      fs.writeFile(outputPath, outputCode, 'utf-8'),
      fs.writeFile(mapPath, JSON.stringify(outputMap, null, 2), 'utf-8'),
    ]);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`Permission denied: Cannot write to ${path.dirname(outputPath)}`);
    }
    throw new Error(`Failed to write output files: ${error.message || String(err)}`);
  }
  
  return {
    code: outputCode,
    map: outputMap,
    outputPath,
    mapPath,
  };
}
