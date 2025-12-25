/**
 * Property-Based Tests for Code Formatting
 * 
 * **Property 3: Code Formatting Correctness**
 * *For any* valid code string and line range, the formatted output SHALL contain 
 * exactly one line per source line in the format "LineNo SourceLoc Code", 
 * where LineNo matches the actual line number.
 * **Validates: Requirements 2.1, 2.2**
 * 
 * **Property 4: Line Range Boundary Adjustment**
 * *For any* line range where start_line < 1 or end_line > totalLines, 
 * the formatter SHALL adjust the range to valid boundaries 
 * (max(1, start_line) to min(totalLines, end_line)).
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { formatCodeForAnalysis } from '../tools/aiFindJsvmpDispatcher.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'smart-fs-formatcode-property-test');

describe('Code Formatting Property Tests', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Feature: jsvmp-detector, Property 3: Code Formatting Correctness
   * *For any* valid code string and line range, the formatted output SHALL contain 
   * exactly one line per source line in the format "LineNo SourceLoc Code".
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 3: Code Formatting Correctness', () => {
    it('should format each line with correct line number', async () => {
      // Generate random JavaScript code snippets with guaranteed unique variable names
      const codeArb = fc.array(
        fc.tuple(
          fc.constantFrom('const', 'let', 'var', 'function'),
          fc.integer({ min: 0, max: 1000 })
        ),
        { minLength: 3, maxLength: 15 }
      ).chain(items => 
        fc.constant(items.map(([keyword, num], idx) => {
          const uniqueName = `v_${idx}_${num}_${Date.now()}`;
          if (keyword === 'function') {
            return `function ${uniqueName}() { return ${num}; }`;
          }
          return `${keyword} ${uniqueName} = ${num};`;
        }).join('\n'))
      );

      await fc.assert(
        fc.asyncProperty(codeArb, async (code) => {
          // Create a test file
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            // Format the code
            const result = await formatCodeForAnalysis(testFile, 1, 100);

            // Split formatted content into lines
            const formattedLines = result.content.split('\n');

            // Calculate expected number of lines
            const expectedLineCount = result.endLine - result.startLine + 1;

            // Verify we have exactly one formatted line per source line
            expect(formattedLines.length).toBe(expectedLineCount);

            // Verify each line has the correct format: "LineNo SourceLoc Code"
            for (let i = 0; i < formattedLines.length; i++) {
              const formattedLine = formattedLines[i];
              const expectedLineNum = result.startLine + i;

              // Check that the line starts with the correct line number
              // Format is: "    N " where N is padded to 5 characters
              const lineNumMatch = formattedLine.match(/^\s*(\d+)\s+/);
              expect(lineNumMatch).not.toBeNull();

              if (lineNumMatch) {
                const actualLineNum = parseInt(lineNumMatch[1], 10);
                expect(actualLineNum).toBe(expectedLineNum);
              }
            }

            return true;
          } finally {
            // Clean up test file
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should include source location in formatted output', async () => {
      // Generate code with guaranteed unique variable names
      const codeArb = fc.array(
        fc.integer({ min: 0, max: 1000 }),
        { minLength: 2, maxLength: 10 }
      ).chain(nums => 
        fc.constant(nums.map((num, idx) => {
          const keyword = ['const', 'let', 'var'][idx % 3];
          return `${keyword} v_${idx}_${num}_${Date.now()} = ${num};`;
        }).join('\n'))
      );

      await fc.assert(
        fc.asyncProperty(codeArb, async (code) => {
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            const result = await formatCodeForAnalysis(testFile, 1, 100);
            const formattedLines = result.content.split('\n');

            // Each line should have the format: "LineNo SourceLoc Code"
            // SourceLoc is either "L{line}:{col}" or empty (10 chars padded)
            for (const line of formattedLines) {
              // After line number, there should be source location info
              // Format: "    N SSSSSSSSSS code" where S is source location (10 chars)
              const match = line.match(/^\s*\d+\s+(.{10})\s/);
              expect(match).not.toBeNull();

              if (match) {
                const sourceLoc = match[1].trim();
                // Source location should either be empty or match "L{line}:{col}" format
                if (sourceLoc !== '') {
                  expect(sourceLoc).toMatch(/^L\d+:\d+$/);
                }
              }
            }

            return true;
          } finally {
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: jsvmp-detector, Property 4: Line Range Boundary Adjustment
   * *For any* line range where start_line < 1 or end_line > totalLines, 
   * the formatter SHALL adjust the range to valid boundaries.
   * **Validates: Requirements 2.3**
   */
  describe('Property 4: Line Range Boundary Adjustment', () => {
    it('should adjust start_line to 1 when less than 1', async () => {
      // Generate random negative or zero start lines
      const startLineArb = fc.integer({ min: -100, max: 0 });
      const codeArb = fc.constantFrom(
        'const x1 = 1;\nconst y2 = 2;\nconst z3 = 3;',
        'function test() {}\nvar a1 = 1;',
        'console.log("test");\nlet b2 = 42;'
      );

      await fc.assert(
        fc.asyncProperty(startLineArb, codeArb, async (startLine, code) => {
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            const result = await formatCodeForAnalysis(testFile, startLine, 10);

            // Start line should be adjusted to 1
            expect(result.startLine).toBe(1);
            expect(result.startLine).toBeGreaterThanOrEqual(1);

            return true;
          } finally {
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should adjust end_line to totalLines when exceeding file length', async () => {
      // Generate random large end lines
      const endLineArb = fc.integer({ min: 100, max: 10000 });
      const codeArb = fc.array(
        fc.integer({ min: 0, max: 1000 }),
        { minLength: 2, maxLength: 10 }
      ).chain(nums => 
        fc.constant(nums.map((num, idx) => `const v_${idx}_${num}_${Date.now()} = ${num};`).join('\n'))
      );

      await fc.assert(
        fc.asyncProperty(endLineArb, codeArb, async (endLine, code) => {
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            const result = await formatCodeForAnalysis(testFile, 1, endLine);

            // End line should be adjusted to totalLines
            expect(result.endLine).toBe(result.totalLines);
            expect(result.endLine).toBeLessThanOrEqual(result.totalLines);

            return true;
          } finally {
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should handle both boundaries being out of range', async () => {
      // Generate random out-of-range values
      const startLineArb = fc.integer({ min: -50, max: 0 });
      const endLineArb = fc.integer({ min: 100, max: 5000 });
      const codeArb = fc.array(
        fc.integer({ min: 0, max: 1000 }),
        { minLength: 2, maxLength: 8 }
      ).chain(nums => 
        fc.constant(nums.map((num, idx) => `const a_${idx}_${num}_${Date.now()} = ${num};`).join('\n'))
      );

      await fc.assert(
        fc.asyncProperty(startLineArb, endLineArb, codeArb, async (startLine, endLine, code) => {
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            const result = await formatCodeForAnalysis(testFile, startLine, endLine);

            // Both boundaries should be adjusted
            expect(result.startLine).toBe(1);
            expect(result.endLine).toBe(result.totalLines);
            expect(result.startLine).toBeLessThanOrEqual(result.endLine);

            // Should return all lines in the file
            const formattedLines = result.content.split('\n');
            expect(formattedLines.length).toBe(result.totalLines);

            return true;
          } finally {
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should maintain valid range relationship after adjustment', async () => {
      // Generate any random start and end lines
      const rangeArb = fc.tuple(
        fc.integer({ min: -100, max: 10000 }),
        fc.integer({ min: -100, max: 10000 })
      );
      const codeArb = fc.array(
        fc.integer({ min: 0, max: 1000 }),
        { minLength: 1, maxLength: 12 }
      ).chain(nums => 
        fc.constant(nums.map((num, idx) => `let z_${idx}_${num}_${Date.now()} = ${num};`).join('\n'))
      );

      await fc.assert(
        fc.asyncProperty(rangeArb, codeArb, async ([startLine, endLine], code) => {
          const testFile = path.join(TEST_DIR, `test-${Date.now()}-${Math.random()}.js`);
          await fs.writeFile(testFile, code, 'utf-8');

          try {
            const result = await formatCodeForAnalysis(testFile, startLine, endLine);

            // After adjustment, start should be <= end
            expect(result.startLine).toBeLessThanOrEqual(result.endLine);

            // Both should be within valid range
            expect(result.startLine).toBeGreaterThanOrEqual(1);
            expect(result.endLine).toBeLessThanOrEqual(result.totalLines);

            // Number of formatted lines should match the range
            const formattedLines = result.content.split('\n');
            const expectedLines = result.endLine - result.startLine + 1;
            expect(formattedLines.length).toBe(expectedLines);

            return true;
          } finally {
            await fs.unlink(testFile).catch(() => {});
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
