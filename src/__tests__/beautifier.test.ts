import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureBeautified } from '../beautifier.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'smart-fs-test-fixtures');

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
    expect(result.rawMap!.version).toBe(3);
    expect(result.rawMap!.sources).toBeDefined();
    expect(result.rawMap!.mappings).toBeDefined();
  });

  it('should preserve all variable names exactly (no renaming)', async () => {
    // Create a test file with various variable names including obfuscated ones
    const testFile = path.join(TEST_DIR, 'preserve-names.js');
    const originalCode = `
var _0x1234 = 'hello';
var _0xabcd = function(_0x5678, _0x9abc) {
  var _0xdef0 = _0x5678 + _0x9abc;
  return _0xdef0;
};
const myLongVariableName = 42;
let anotherVar = _0x1234;
function processData(inputData, outputCallback) {
  var localTemp = inputData * 2;
  outputCallback(localTemp);
}
`;
    await fs.writeFile(testFile, originalCode, 'utf-8');

    const result = await ensureBeautified(testFile);

    // All original variable names must be preserved exactly
    expect(result.code).toContain('_0x1234');
    expect(result.code).toContain('_0xabcd');
    expect(result.code).toContain('_0x5678');
    expect(result.code).toContain('_0x9abc');
    expect(result.code).toContain('_0xdef0');
    expect(result.code).toContain('myLongVariableName');
    expect(result.code).toContain('anotherVar');
    expect(result.code).toContain('processData');
    expect(result.code).toContain('inputData');
    expect(result.code).toContain('outputCallback');
    expect(result.code).toContain('localTemp');

    // Should NOT contain any single-letter renamed variables like 'a', 'b', 'c' 
    // that weren't in the original (except as part of other identifiers)
    // Check that the code doesn't have unexpected short variable declarations
    const lines = result.code.split('\n');
    for (const line of lines) {
      // Should not have patterns like "var a =" or "let b =" that indicate renaming
      expect(line).not.toMatch(/\b(var|let|const)\s+[a-z]\s*=/);
    }
  });

  it('should return cached results on second call', async () => {
    const testFile = path.join(TEST_DIR, 'cached.js');
    const code = 'const x=1;const y=2;';
    await fs.writeFile(testFile, code, 'utf-8');

    const result1 = await ensureBeautified(testFile);
    const result2 = await ensureBeautified(testFile);

    expect(result1.code).toBe(result2.code);
    expect(result1.rawMap!.mappings).toBe(result2.rawMap!.mappings);
  });

  it('should throw error for non-existent file', async () => {
    const nonExistentFile = path.join(TEST_DIR, 'does-not-exist.js');
    
    await expect(ensureBeautified(nonExistentFile)).rejects.toThrow('File not found');
  });
});
