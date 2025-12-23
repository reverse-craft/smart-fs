import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureBeautified } from '../beautifier.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'jsvmp-test-fixtures');

describe('ensureBeautified', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should beautify minified JavaScript and return Source Map', async () => {
    // Create a minified test file
    const testFile = path.join(TEST_DIR, 'minified.js');
    const minifiedCode = 'const a=1;const b=2;function add(x,y){return x+y}console.log(add(a,b));';
    await fs.writeFile(testFile, minifiedCode, 'utf-8');

    const result = await ensureBeautified(testFile);

    // Verify code is beautified (has more lines)
    expect(result.code).toBeDefined();
    expect(result.code.split('\n').length).toBeGreaterThan(1);

    // Verify Source Map structure
    expect(result.rawMap).toBeDefined();
    expect(result.rawMap.version).toBe(3);
    expect(result.rawMap.sources).toBeDefined();
    expect(result.rawMap.mappings).toBeDefined();
  });

  it('should return cached results on second call', async () => {
    const testFile = path.join(TEST_DIR, 'cached.js');
    const code = 'const x=1;const y=2;';
    await fs.writeFile(testFile, code, 'utf-8');

    const result1 = await ensureBeautified(testFile);
    const result2 = await ensureBeautified(testFile);

    expect(result1.code).toBe(result2.code);
    expect(result1.rawMap.mappings).toBe(result2.rawMap.mappings);
  });

  it('should throw error for non-existent file', async () => {
    const nonExistentFile = path.join(TEST_DIR, 'does-not-exist.js');
    
    await expect(ensureBeautified(nonExistentFile)).rejects.toThrow('File not found');
  });
});
