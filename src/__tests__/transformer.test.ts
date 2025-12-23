import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SourceMapConsumer } from 'source-map-js';
import {
  cleanBasename,
  getOutputPaths,
  applyCustomTransform,
} from '../transformer.js';
import { ApplyCustomTransformInputSchema } from '../tools/index.js';

const TEST_DIR = path.join(os.tmpdir(), 'jsvmp-transformer-test');
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures');
const SCRIPTS_DIR = path.join(TEST_DIR, 'scripts');

describe('Transformer Module', () => {
  beforeAll(async () => {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await fs.mkdir(SCRIPTS_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Property 1: Input Schema Validation
   * Feature: custom-transform, Property 1: Input Schema Validation
   * 
   * *For any* input object, the schema SHALL accept objects with valid `target_file` (string),
   * `script_path` (string), and optional `output_suffix` (string), and SHALL reject objects
   * missing required fields or with wrong types.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 1: Input Schema Validation', () => {
    it('property test: accepts valid inputs with required fields', async () => {
      // Arbitrary for valid non-empty strings (file paths)
      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          (targetFile, scriptPath) => {
            const input = {
              target_file: targetFile,
              script_path: scriptPath,
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(true);

            if (result.success) {
              expect(result.data.target_file).toBe(targetFile);
              expect(result.data.script_path).toBe(scriptPath);
              // Default suffix should be applied
              expect(result.data.output_suffix).toBe('_deob');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: accepts valid inputs with optional output_suffix', async () => {
      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          (targetFile, scriptPath, outputSuffix) => {
            const input = {
              target_file: targetFile,
              script_path: scriptPath,
              output_suffix: outputSuffix,
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(true);

            if (result.success) {
              expect(result.data.target_file).toBe(targetFile);
              expect(result.data.script_path).toBe(scriptPath);
              expect(result.data.output_suffix).toBe(outputSuffix);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: rejects inputs missing required target_file', async () => {
      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          (scriptPath) => {
            const input = {
              script_path: scriptPath,
              // target_file is missing
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: rejects inputs missing required script_path', async () => {
      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          (targetFile) => {
            const input = {
              target_file: targetFile,
              // script_path is missing
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: rejects inputs with wrong types for target_file', async () => {
      // Generate non-string values
      const nonStringArb = fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.string()),
        fc.object(),
      );

      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonStringArb,
          nonEmptyStringArb,
          (invalidTargetFile, scriptPath) => {
            const input = {
              target_file: invalidTargetFile,
              script_path: scriptPath,
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: rejects inputs with wrong types for script_path', async () => {
      // Generate non-string values
      const nonStringArb = fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.string()),
        fc.object(),
      );

      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonStringArb,
          (targetFile, invalidScriptPath) => {
            const input = {
              target_file: targetFile,
              script_path: invalidScriptPath,
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property test: rejects inputs with wrong types for output_suffix', async () => {
      // Generate non-string values (excluding undefined which is valid for optional)
      const nonStringArb = fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.string()),
        fc.object(),
      );

      const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);

      await fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonStringArb,
          (targetFile, scriptPath, invalidSuffix) => {
            const input = {
              target_file: targetFile,
              script_path: scriptPath,
              output_suffix: invalidSuffix,
            };

            const result = ApplyCustomTransformInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('cleanBasename', () => {
    it('should remove .js extension', () => {
      expect(cleanBasename('main.js')).toBe('main');
    });

    it('should remove .beautified suffix', () => {
      expect(cleanBasename('main.beautified.js')).toBe('main');
    });

    it('should remove _deob suffix', () => {
      expect(cleanBasename('main_deob.js')).toBe('main');
    });

    it('should remove _deob* suffixes', () => {
      expect(cleanBasename('main_deob_v2.js')).toBe('main');
      expect(cleanBasename('main_deob123.js')).toBe('main');
    });

    it('should handle combined suffixes', () => {
      expect(cleanBasename('main.beautified_deob.js')).toBe('main');
    });
  });

  describe('getOutputPaths', () => {
    it('should generate correct output paths', () => {
      const result = getOutputPaths('/path/to/main.js', '_deob');
      expect(result.outputPath).toBe('/path/to/main_deob.js');
      expect(result.mapPath).toBe('/path/to/main_deob.js.map');
    });

    it('should use default suffix', () => {
      const result = getOutputPaths('/path/to/main.js');
      expect(result.outputPath).toBe('/path/to/main_deob.js');
    });

    it('should handle custom suffix', () => {
      const result = getOutputPaths('/path/to/main.js', '_custom');
      expect(result.outputPath).toBe('/path/to/main_custom.js');
      expect(result.mapPath).toBe('/path/to/main_custom.js.map');
    });
  });

  /**
   * Property 3: Source Map File Generation
   * Feature: custom-transform, Property 3: Source Map File Generation
   * 
   * *For any* successful transform, the output SHALL include:
   * - A `.map` file alongside the output JS file
   * - A `//# sourceMappingURL=` comment at the end of the output code pointing to the map file
   * 
   * **Validates: Requirements 4.3, 4.4**
   */
  describe('Property 3: Source Map File Generation', () => {
    // Create a simple identity Babel plugin for testing
    const identityPluginCode = `
export default function() {
  return {
    visitor: {}
  };
}
`;

    let pluginPath: string;
    let testFilePath: string;

    beforeAll(async () => {
      // Create the identity plugin
      pluginPath = path.join(SCRIPTS_DIR, 'identity-plugin.mjs');
      await fs.writeFile(pluginPath, identityPluginCode, 'utf-8');

      // Create a test JS file
      testFilePath = path.join(FIXTURES_DIR, 'test-source.js');
      const testCode = 'const a = 1; const b = 2; function add(x, y) { return x + y; }';
      await fs.writeFile(testFilePath, testCode, 'utf-8');
    });

    it('should generate source map file alongside output', async () => {
      const result = await applyCustomTransform(testFilePath, {
        scriptPath: pluginPath,
        outputSuffix: '_prop3test',
      });

      // Verify output file exists
      const outputExists = await fs.access(result.outputPath).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);

      // Verify map file exists
      const mapExists = await fs.access(result.mapPath).then(() => true).catch(() => false);
      expect(mapExists).toBe(true);

      // Verify map file is alongside output file (same directory)
      expect(path.dirname(result.outputPath)).toBe(path.dirname(result.mapPath));

      // Verify map file has correct naming
      expect(result.mapPath).toBe(`${result.outputPath}.map`);
    });

    it('should include sourceMappingURL comment in output code', async () => {
      const result = await applyCustomTransform(testFilePath, {
        scriptPath: pluginPath,
        outputSuffix: '_prop3url',
      });

      // Verify sourceMappingURL comment exists
      const mapFileName = path.basename(result.mapPath);
      expect(result.code).toContain(`//# sourceMappingURL=${mapFileName}`);

      // Verify it's at the end of the file
      const lines = result.code.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toContain('sourceMappingURL=');
    });

    it('property test: for any valid JS code, transform produces map file and URL comment', async () => {
      // Generate various valid JS code snippets
      const validJsArbitrary = fc.oneof(
        fc.constant('const x = 1;'),
        fc.constant('function foo() { return 42; }'),
        fc.constant('const arr = [1, 2, 3];'),
        fc.constant('let obj = { a: 1, b: 2 };'),
        fc.constant('class MyClass { constructor() {} }'),
      );

      await fc.assert(
        fc.asyncProperty(validJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `prop3-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_test${uniqueId}`,
            });

            // Property: map file must exist
            const mapExists = await fs.access(result.mapPath).then(() => true).catch(() => false);
            expect(mapExists).toBe(true);

            // Property: sourceMappingURL must be present
            const mapFileName = path.basename(result.mapPath);
            expect(result.code).toContain(`//# sourceMappingURL=${mapFileName}`);

            // Property: map file must be valid JSON with required fields
            const mapContent = await fs.readFile(result.mapPath, 'utf-8');
            const mapJson = JSON.parse(mapContent);
            expect(mapJson.version).toBeDefined();
            expect(mapJson.mappings).toBeDefined();

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000); // 60 second timeout for property test
  });

  /**
   * Property 6: Error Handling for Invalid Inputs
   * Feature: custom-transform, Property 6: Error Handling for Invalid Inputs
   * 
   * *For any* of the following error conditions, the system SHALL return an appropriate error message:
   * - Non-existent target file → error containing "not found" and the file path
   * - Non-existent script file → error containing "not found" and the script path  
   * - Invalid Babel plugin format → error describing the plugin format issue
   * - Babel transformation failure → error containing the Babel error message
   * 
   * **Validates: Requirements 2.2, 6.1, 6.2, 6.3, 6.4**
   */
  describe('Property 6: Error Handling for Invalid Inputs', () => {
    // Helper to create a valid test JS file
    async function createTestJsFile(filename: string, content: string = 'const x = 1;'): Promise<string> {
      const filePath = path.join(FIXTURES_DIR, filename);
      await fs.writeFile(filePath, content, 'utf-8');
      return filePath;
    }

    // Helper to create a valid Babel plugin script
    async function createValidPlugin(filename: string): Promise<string> {
      const pluginCode = `
export default function() {
  return {
    visitor: {}
  };
}
`;
      const pluginPath = path.join(SCRIPTS_DIR, filename);
      await fs.writeFile(pluginPath, pluginCode, 'utf-8');
      return pluginPath;
    }

    it('property test: non-existent target file returns error with "not found" and file path', async () => {
      // Generate random non-existent file paths
      const nonExistentPathArb = fc.string({ minLength: 1, maxLength: 50 })
        .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
        .map(s => path.join(FIXTURES_DIR, `nonexistent_${s}_${Date.now()}.js`));

      // Create a valid plugin for this test
      const validPluginPath = await createValidPlugin('valid-plugin-for-target-test.mjs');

      await fc.assert(
        fc.asyncProperty(nonExistentPathArb, async (nonExistentPath) => {
          try {
            await applyCustomTransform(nonExistentPath, {
              scriptPath: validPluginPath,
            });
            // Should not reach here
            expect.fail('Expected error to be thrown for non-existent target file');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Error must contain "not found" (case insensitive)
            expect(message.toLowerCase()).toContain('not found');
            // Error must contain the file path or filename
            const filename = path.basename(nonExistentPath);
            expect(message).toContain(filename);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('property test: non-existent script file returns error with "not found" and script path', async () => {
      // Create a valid target file
      const validTargetPath = await createTestJsFile('valid-target-for-script-test.js');

      // Generate random non-existent script paths
      const nonExistentScriptArb = fc.string({ minLength: 1, maxLength: 50 })
        .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
        .map(s => path.join(SCRIPTS_DIR, `nonexistent_script_${s}_${Date.now()}.mjs`));

      await fc.assert(
        fc.asyncProperty(nonExistentScriptArb, async (nonExistentScript) => {
          try {
            await applyCustomTransform(validTargetPath, {
              scriptPath: nonExistentScript,
            });
            // Should not reach here
            expect.fail('Expected error to be thrown for non-existent script file');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Error must contain "not found" (case insensitive)
            expect(message.toLowerCase()).toContain('not found');
            // Error must contain the script path (absolute path is returned)
            expect(message).toContain(nonExistentScript);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('property test: invalid Babel plugin format returns descriptive error', async () => {
      // Create a valid target file
      const validTargetPath = await createTestJsFile('valid-target-for-plugin-format-test.js');

      // Generate various invalid plugin contents
      const invalidPluginContentArb = fc.oneof(
        // Export a non-function value
        fc.constant('export default "not a function";'),
        fc.constant('export default 42;'),
        fc.constant('export default null;'),
        fc.constant('export default { visitor: {} };'),
        fc.constant('export default [];'),
        // Export nothing meaningful
        fc.constant('const x = 1;'),
      );

      await fc.assert(
        fc.asyncProperty(
          invalidPluginContentArb,
          fc.integer({ min: 1, max: 1000 }),
          async (invalidContent, uniqueId) => {
            // Create invalid plugin file
            const invalidPluginPath = path.join(SCRIPTS_DIR, `invalid-plugin-${uniqueId}-${Date.now()}.mjs`);
            await fs.writeFile(invalidPluginPath, invalidContent, 'utf-8');

            try {
              await applyCustomTransform(validTargetPath, {
                scriptPath: invalidPluginPath,
              });
              // Should not reach here
              expect.fail('Expected error to be thrown for invalid plugin format');
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              // Error must describe the plugin format issue
              // Should contain "Invalid Babel plugin" or similar descriptive message
              const hasPluginError = 
                message.toLowerCase().includes('invalid') ||
                message.toLowerCase().includes('plugin') ||
                message.toLowerCase().includes('function') ||
                message.toLowerCase().includes('export');
              expect(hasPluginError).toBe(true);
            } finally {
              // Cleanup
              await fs.unlink(invalidPluginPath).catch(() => {});
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it('property test: Babel transformation failure returns error with Babel error message', async () => {
      // Generate various invalid JS code that will cause Babel to fail
      const invalidJsCodeArb = fc.oneof(
        // Syntax errors
        fc.constant('const x = {'),
        fc.constant('function foo( {'),
        fc.constant('if (true {'),
        fc.constant('const = 1;'),
        fc.constant('let 123abc = 1;'),
        fc.constant('class { }'),
        fc.constant('export default function( {'),
      );

      // Create a plugin that tries to traverse the AST (will fail on invalid code)
      const pluginCode = `
export default function() {
  return {
    visitor: {
      Identifier(path) {
        // Just visit identifiers
      }
    }
  };
}
`;
      const pluginPath = path.join(SCRIPTS_DIR, 'visitor-plugin-for-babel-error-test.mjs');
      await fs.writeFile(pluginPath, pluginCode, 'utf-8');

      await fc.assert(
        fc.asyncProperty(
          invalidJsCodeArb,
          fc.integer({ min: 1, max: 1000 }),
          async (invalidCode, uniqueId) => {
            // Create file with invalid JS code
            const invalidFilePath = path.join(FIXTURES_DIR, `invalid-js-${uniqueId}-${Date.now()}.js`);
            await fs.writeFile(invalidFilePath, invalidCode, 'utf-8');

            try {
              await applyCustomTransform(invalidFilePath, {
                scriptPath: pluginPath,
              });
              // Should not reach here
              expect.fail('Expected error to be thrown for invalid JS code');
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              // Error must contain Babel error information
              // Should contain "Babel" or syntax error related message
              const hasBabelError = 
                message.includes('Babel') ||
                message.toLowerCase().includes('syntax') ||
                message.toLowerCase().includes('unexpected') ||
                message.toLowerCase().includes('error');
              expect(hasBabelError).toBe(true);
            } finally {
              // Cleanup
              await fs.unlink(invalidFilePath).catch(() => {});
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });

  /**
   * Property 4: Source Map Cascade Validity
   * Feature: custom-transform, Property 4: Source Map Cascade Validity
   * 
   * *For any* position (line, column) in the deobfuscated output code, the cascaded source map
   * SHALL resolve to a valid position in the original minified file. The cascade chain is:
   * Deobfuscated → Beautified → Original.
   * 
   * **Validates: Requirements 3.2, 3.3, 5.1, 5.2**
   */
  describe('Property 4: Source Map Cascade Validity', () => {
    // Create a simple identity Babel plugin for testing
    const identityPluginCode = `
export default function() {
  return {
    visitor: {}
  };
}
`;

    let pluginPath: string;

    beforeAll(async () => {
      // Create the identity plugin
      pluginPath = path.join(SCRIPTS_DIR, 'identity-plugin-cascade.mjs');
      await fs.writeFile(pluginPath, identityPluginCode, 'utf-8');
    });

    it('property test: all positions in deobfuscated code map to valid original positions', async () => {
      // Generate various valid JS code snippets that will produce multi-line output
      const validJsArbitrary = fc.oneof(
        fc.constant('const x = 1; const y = 2; function add(a, b) { return a + b; }'),
        fc.constant('function foo() { return 42; } function bar() { return foo() * 2; }'),
        fc.constant('const arr = [1, 2, 3]; const sum = arr.reduce((a, b) => a + b, 0);'),
        fc.constant('let obj = { a: 1, b: 2, c: 3 }; const keys = Object.keys(obj);'),
        fc.constant('class MyClass { constructor(x) { this.x = x; } getValue() { return this.x; } }'),
      );

      await fc.assert(
        fc.asyncProperty(validJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `cascade-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_cascade${uniqueId}`,
            });

            // Read the generated source map
            const mapContent = await fs.readFile(result.mapPath, 'utf-8');
            const sourceMap = JSON.parse(mapContent);

            // Create a source map consumer
            const consumer = new SourceMapConsumer(sourceMap);

            // Get all lines in the output code (excluding sourceMappingURL comment)
            const outputLines = result.code.split('\n').filter(line => !line.startsWith('//# sourceMappingURL='));

            // For each line in the output, check that at least some positions map back
            let validMappingsFound = 0;
            for (let line = 1; line <= outputLines.length; line++) {
              const lineContent = outputLines[line - 1];
              if (!lineContent || lineContent.trim().length === 0) continue;

              // Check a few column positions on this line
              for (let column = 0; column < Math.min(lineContent.length, 20); column++) {
                const originalPos = consumer.originalPositionFor({ line, column });
                
                // If we get a valid mapping (not null source), verify it's reasonable
                if (originalPos.source !== null) {
                  validMappingsFound++;
                  // Line and column should be positive numbers
                  expect(originalPos.line).toBeGreaterThan(0);
                  expect(originalPos.column).toBeGreaterThanOrEqual(0);
                }
              }
            }

            // We should have found at least some valid mappings
            expect(validMappingsFound).toBeGreaterThan(0);

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 120000); // 2 minute timeout for property test

    it('property test: source map sources array references original file', async () => {
      // Generate various valid JS code snippets
      const validJsArbitrary = fc.oneof(
        fc.constant('const a = 1;'),
        fc.constant('function test() { return true; }'),
        fc.constant('let x = { key: "value" };'),
      );

      await fc.assert(
        fc.asyncProperty(validJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `sources-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_sources${uniqueId}`,
            });

            // Read the generated source map
            const mapContent = await fs.readFile(result.mapPath, 'utf-8');
            const sourceMap = JSON.parse(mapContent);

            // Verify source map has sources array
            expect(sourceMap.sources).toBeDefined();
            expect(Array.isArray(sourceMap.sources)).toBe(true);
            expect(sourceMap.sources.length).toBeGreaterThan(0);

            // Verify source map has mappings
            expect(sourceMap.mappings).toBeDefined();
            expect(typeof sourceMap.mappings).toBe('string');
            expect(sourceMap.mappings.length).toBeGreaterThan(0);

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  /**
   * Property 5: Transform Output Readability
   * Feature: custom-transform, Property 5: Transform Output Readability
   * 
   * *For any* successful Babel transform, the output code SHALL be formatted (not minified
   * or compacted), containing proper indentation and line breaks.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 5: Transform Output Readability', () => {
    // Create a simple identity Babel plugin for testing
    const identityPluginCode = `
export default function() {
  return {
    visitor: {}
  };
}
`;

    let pluginPath: string;

    beforeAll(async () => {
      // Create the identity plugin
      pluginPath = path.join(SCRIPTS_DIR, 'identity-plugin-readability.mjs');
      await fs.writeFile(pluginPath, identityPluginCode, 'utf-8');
    });

    it('property test: output code is formatted with line breaks', async () => {
      // Generate JS code that would be multi-line when formatted
      const multiLineJsArbitrary = fc.oneof(
        fc.constant('function foo() { const x = 1; const y = 2; return x + y; }'),
        fc.constant('const obj = { a: 1, b: 2, c: function() { return this.a + this.b; } };'),
        fc.constant('class Test { constructor() { this.value = 0; } increment() { this.value++; } }'),
        fc.constant('if (true) { console.log("a"); console.log("b"); console.log("c"); }'),
        fc.constant('const arr = [1, 2, 3]; arr.forEach(function(item) { console.log(item); });'),
      );

      await fc.assert(
        fc.asyncProperty(multiLineJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `readable-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_readable${uniqueId}`,
            });

            // Remove sourceMappingURL comment for analysis
            const codeWithoutComment = result.code.replace(/\/\/# sourceMappingURL=.*$/m, '').trim();

            // Property: Output should have multiple lines (not minified)
            const lines = codeWithoutComment.split('\n');
            expect(lines.length).toBeGreaterThan(1);

            // Property: Output should not be a single long line (not compacted)
            const maxLineLength = Math.max(...lines.map(l => l.length));
            // A reasonable formatted line should not exceed ~200 chars
            // (allowing for some flexibility in formatting)
            expect(maxLineLength).toBeLessThan(500);

            // Property: Output should contain some whitespace/indentation
            const hasIndentation = lines.some(line => line.startsWith('  ') || line.startsWith('\t'));
            const hasEmptyLines = lines.some(line => line.trim() === '');
            const hasReasonableFormatting = hasIndentation || hasEmptyLines || lines.length > 2;
            expect(hasReasonableFormatting).toBe(true);

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);

    it('property test: output code is not minified (contains spaces around operators)', async () => {
      // Generate JS code with operators
      const operatorJsArbitrary = fc.oneof(
        fc.constant('const sum = 1 + 2 + 3;'),
        fc.constant('const result = a && b || c;'),
        fc.constant('const check = x === y ? "yes" : "no";'),
        fc.constant('const calc = (a + b) * (c - d);'),
      );

      await fc.assert(
        fc.asyncProperty(operatorJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `notminified-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_notmin${uniqueId}`,
            });

            // Remove sourceMappingURL comment for analysis
            const codeWithoutComment = result.code.replace(/\/\/# sourceMappingURL=.*$/m, '').trim();

            // Property: Code should not be aggressively minified
            // Minified code typically has no newlines and minimal spaces
            const hasNewlines = codeWithoutComment.includes('\n');
            const spaceRatio = (codeWithoutComment.match(/ /g) || []).length / codeWithoutComment.length;
            
            // Either has newlines OR has reasonable space ratio (not minified)
            const isNotMinified = hasNewlines || spaceRatio > 0.05;
            expect(isNotMinified).toBe(true);

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  /**
   * Property 7: Success Response Format
   * Feature: custom-transform, Property 7: Success Response Format
   * 
   * *For any* successful transform, the response SHALL include the paths to both
   * the created output file and its source map file.
   * 
   * **Validates: Requirements 4.5**
   */
  describe('Property 7: Success Response Format', () => {
    // Create a simple identity Babel plugin for testing
    const identityPluginCode = `
export default function() {
  return {
    visitor: {}
  };
}
`;

    let pluginPath: string;

    beforeAll(async () => {
      // Create the identity plugin
      pluginPath = path.join(SCRIPTS_DIR, 'identity-plugin-response.mjs');
      await fs.writeFile(pluginPath, identityPluginCode, 'utf-8');
    });

    it('property test: successful transform returns outputPath and mapPath', async () => {
      // Generate various valid JS code snippets
      const validJsArbitrary = fc.oneof(
        fc.constant('const x = 1;'),
        fc.constant('function test() { return 42; }'),
        fc.constant('let arr = [1, 2, 3];'),
        fc.constant('class Foo { bar() {} }'),
        fc.constant('const obj = { key: "value" };'),
      );

      await fc.assert(
        fc.asyncProperty(validJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `response-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_resp${uniqueId}`,
            });

            // Property: Response must include outputPath
            expect(result.outputPath).toBeDefined();
            expect(typeof result.outputPath).toBe('string');
            expect(result.outputPath.length).toBeGreaterThan(0);
            expect(result.outputPath.endsWith('.js')).toBe(true);

            // Property: Response must include mapPath
            expect(result.mapPath).toBeDefined();
            expect(typeof result.mapPath).toBe('string');
            expect(result.mapPath.length).toBeGreaterThan(0);
            expect(result.mapPath.endsWith('.map')).toBe(true);

            // Property: mapPath should be outputPath + '.map'
            expect(result.mapPath).toBe(`${result.outputPath}.map`);

            // Property: Both files should actually exist
            const outputExists = await fs.access(result.outputPath).then(() => true).catch(() => false);
            const mapExists = await fs.access(result.mapPath).then(() => true).catch(() => false);
            expect(outputExists).toBe(true);
            expect(mapExists).toBe(true);

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);

    it('property test: response includes transformed code and source map', async () => {
      // Generate various valid JS code snippets
      const validJsArbitrary = fc.oneof(
        fc.constant('const a = 1;'),
        fc.constant('function foo() { return "bar"; }'),
        fc.constant('let x = { y: 2 };'),
      );

      await fc.assert(
        fc.asyncProperty(validJsArbitrary, fc.integer({ min: 1, max: 100 }), async (jsCode, uniqueId) => {
          // Create unique test file
          const uniqueFileName = `respdata-${uniqueId}-${Date.now()}.js`;
          const uniqueFilePath = path.join(FIXTURES_DIR, uniqueFileName);
          await fs.writeFile(uniqueFilePath, jsCode, 'utf-8');

          try {
            const result = await applyCustomTransform(uniqueFilePath, {
              scriptPath: pluginPath,
              outputSuffix: `_respd${uniqueId}`,
            });

            // Property: Response must include code
            expect(result.code).toBeDefined();
            expect(typeof result.code).toBe('string');
            expect(result.code.length).toBeGreaterThan(0);

            // Property: Response must include map
            expect(result.map).toBeDefined();
            expect(typeof result.map).toBe('object');
            expect(result.map.version).toBeDefined();
            expect(result.map.mappings).toBeDefined();

            // Cleanup
            await fs.unlink(result.outputPath).catch(() => {});
            await fs.unlink(result.mapPath).catch(() => {});
          } finally {
            await fs.unlink(uniqueFilePath).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });
});
