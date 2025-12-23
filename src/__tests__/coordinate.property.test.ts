/**
 * Property-Based Tests for Coordinate Mapping
 * 
 * **Property 2: Search Result Coordinate Mapping**
 * *For any* search match, the reported `[Src L:C]` coordinate SHALL be a valid mapping 
 * from the beautified line to the original minified file via the source map.
 * **Validates: Requirements 2.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { searchInCode } from '../searcher.js';
import type { SourceMap } from '../beautifier.js';

/**
 * Create a source map that maps beautified lines to specific original positions.
 * This creates a predictable mapping for testing.
 */
function createMappedSourceMap(lineCount: number, originalLine: number = 1): SourceMap {
  // VLQ encoding for simple mappings
  // Each line maps to originalLine with incrementing columns
  const mappings: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    // AAAA = column 0, source 0, original line 0, original column 0
    // For subsequent lines, we use relative encoding
    if (i === 0) {
      mappings.push('AAAA');
    } else {
      // AACA = column 0, source 0, original line +1, original column 0
      mappings.push('AACA');
    }
  }
  return {
    version: 3,
    sources: ['original.js'],
    sourcesContent: [''],
    names: [],
    mappings: mappings.join(';'),
  };
}

describe('Coordinate Mapping Property Tests', () => {
  /**
   * Feature: smart-search-tools, Property 2: Search Result Coordinate Mapping
   * *For any* search match, the reported coordinate SHALL be a valid mapping via source map.
   * **Validates: Requirements 2.5**
   */
  describe('Property 2: Search Result Coordinate Mapping', () => {
    it('should return valid original positions for all matches', () => {
      // Generate code with multiple searchable patterns
      const codeArb = fc.array(
        fc.constantFrom(
          'const x = 1;',
          'console.log("test");',
          'function fn() {}',
          'var y = 2;',
          'return result;'
        ),
        { minLength: 5, maxLength: 20 }
      ).map(lines => lines.join('\n'));

      fc.assert(
        fc.property(codeArb, (code) => {
          const lines = code.split('\n');
          const sourceMap = createMappedSourceMap(lines.length);
          
          // Search for a common pattern
          const result = searchInCode(code, sourceMap, {
            query: 'const|var|function',
            contextLines: 1,
          });

          // For each match, verify the original position is valid
          for (const match of result.matches) {
            // Original position should be non-null (valid mapping exists)
            expect(match.originalPosition.line).not.toBeNull();
            expect(match.originalPosition.column).not.toBeNull();
            
            // Original line should be a positive integer
            if (match.originalPosition.line !== null) {
              expect(match.originalPosition.line).toBeGreaterThan(0);
            }
            
            // Original column should be non-negative
            if (match.originalPosition.column !== null) {
              expect(match.originalPosition.column).toBeGreaterThanOrEqual(0);
            }
          }

          // Context lines should also have valid positions
          for (const match of result.matches) {
            for (const ctx of [...match.contextBefore, ...match.contextAfter]) {
              expect(ctx.originalPosition.line).not.toBeNull();
              expect(ctx.originalPosition.column).not.toBeNull();
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should maintain line number ordering in original positions', () => {
      // For a simple source map where each beautified line maps to sequential original lines,
      // the original line numbers should be in order
      const codeArb = fc.array(
        fc.constantFrom(
          'const a = 1;',
          'const b = 2;',
          'const c = 3;',
          'const d = 4;',
          'const e = 5;'
        ),
        { minLength: 3, maxLength: 10 }
      ).map(lines => lines.join('\n'));

      fc.assert(
        fc.property(codeArb, (code) => {
          const lines = code.split('\n');
          const sourceMap = createMappedSourceMap(lines.length);
          
          const result = searchInCode(code, sourceMap, {
            query: 'const',
            contextLines: 0,
          });

          // If we have multiple matches, their original lines should be in order
          if (result.matches.length > 1) {
            for (let i = 1; i < result.matches.length; i++) {
              const prevLine = result.matches[i - 1].originalPosition.line;
              const currLine = result.matches[i].originalPosition.line;
              
              if (prevLine !== null && currLine !== null) {
                expect(currLine).toBeGreaterThanOrEqual(prevLine);
              }
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should map beautified line numbers to original positions consistently', () => {
      // The same beautified line should always map to the same original position
      const code = `function test() {
  const x = 1;
  console.log(x);
  return x;
}`;
      const sourceMap = createMappedSourceMap(5);

      fc.assert(
        fc.property(
          fc.constantFrom('const', 'console', 'return', 'function'),
          (query) => {
            const result1 = searchInCode(code, sourceMap, { query, contextLines: 0 });
            const result2 = searchInCode(code, sourceMap, { query, contextLines: 0 });

            // Same query should produce same results
            expect(result1.matches.length).toBe(result2.matches.length);

            for (let i = 0; i < result1.matches.length; i++) {
              expect(result1.matches[i].lineNumber).toBe(result2.matches[i].lineNumber);
              expect(result1.matches[i].originalPosition.line).toBe(
                result2.matches[i].originalPosition.line
              );
              expect(result1.matches[i].originalPosition.column).toBe(
                result2.matches[i].originalPosition.column
              );
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
