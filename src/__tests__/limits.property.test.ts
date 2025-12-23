/**
 * Property-Based Tests for Result Limits
 * 
 * **Property 3: Search Result Limit**
 * *For any* search with more than `maxMatches` results, the output SHALL contain 
 * exactly `maxMatches` matches and a truncation message.
 * **Validates: Requirements 3.1, 3.2**
 * 
 * **Property 6: Find Usage Reference Limit**
 * *For any* binding with more than 10 references, the output SHALL show at most 
 * 10 references and indicate how many more exist.
 * **Validates: Requirements 6.1, 6.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { searchInCode } from '../searcher.js';
import { analyzeBindings } from '../analyzer.js';
import type { SourceMap } from '../beautifier.js';

/**
 * Create a minimal source map for testing
 */
function createTestSourceMap(lineCount: number): SourceMap {
  const mappings: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    mappings.push('AAAA');
  }
  return {
    version: 3,
    sources: ['test.js'],
    names: [],
    mappings: mappings.join(';'),
  };
}

describe('Result Limits Property Tests', () => {
  /**
   * Feature: smart-search-tools, Property 3: Search Result Limit
   * *For any* search with more than maxMatches results, the output SHALL contain 
   * exactly maxMatches matches and indicate truncation.
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 3: Search Result Limit', () => {
    it('should limit matches to maxMatches and set truncated flag', () => {
      // Generate code with many matching lines
      const matchCountArb = fc.integer({ min: 10, max: 100 });
      const maxMatchesArb = fc.integer({ min: 1, max: 9 });

      fc.assert(
        fc.property(matchCountArb, maxMatchesArb, (matchCount, maxMatches) => {
          // Create code with exactly matchCount lines containing "test"
          const lines = Array(matchCount).fill('const test = 1;');
          const code = lines.join('\n');
          const sourceMap = createTestSourceMap(matchCount);

          const result = searchInCode(code, sourceMap, {
            query: 'test',
            maxMatches,
            contextLines: 0,
          });

          // Should have exactly maxMatches results
          expect(result.matches.length).toBe(maxMatches);
          
          // Total matches should be the actual count
          expect(result.totalMatches).toBe(matchCount);
          
          // Truncated flag should be true
          expect(result.truncated).toBe(true);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should not truncate when matches are within limit', () => {
      const matchCountArb = fc.integer({ min: 1, max: 10 });
      const maxMatchesArb = fc.integer({ min: 10, max: 50 });

      fc.assert(
        fc.property(matchCountArb, maxMatchesArb, (matchCount, maxMatches) => {
          const lines = Array(matchCount).fill('const test = 1;');
          const code = lines.join('\n');
          const sourceMap = createTestSourceMap(matchCount);

          const result = searchInCode(code, sourceMap, {
            query: 'test',
            maxMatches,
            contextLines: 0,
          });

          // Should have all matches
          expect(result.matches.length).toBe(matchCount);
          
          // Total matches equals returned matches
          expect(result.totalMatches).toBe(matchCount);
          
          // Truncated flag should be false
          expect(result.truncated).toBe(false);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should return first maxMatches matches in order', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 20, max: 50 }),
          fc.integer({ min: 5, max: 15 }),
          (lineCount, maxMatches) => {
            // Create code where each line has a unique identifier
            const lines = Array(lineCount).fill(0).map((_, i) => `const test_${i} = ${i};`);
            const code = lines.join('\n');
            const sourceMap = createTestSourceMap(lineCount);

            const result = searchInCode(code, sourceMap, {
              query: 'test_',
              maxMatches,
              contextLines: 0,
            });

            // Verify we get the first maxMatches matches
            expect(result.matches.length).toBe(maxMatches);
            
            // Verify they are in order (line numbers should be sequential)
            for (let i = 0; i < result.matches.length; i++) {
              expect(result.matches[i].lineNumber).toBe(i + 1);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: smart-search-tools, Property 6: Find Usage Reference Limit
   * *For any* binding with more than maxReferences, the output SHALL show at most 
   * maxReferences and report the total count.
   * **Validates: Requirements 6.1, 6.2**
   */
  describe('Property 6: Find Usage Reference Limit', () => {
    it('should limit references to maxReferences', async () => {
      // Generate code with many references to a variable
      const refCountArb = fc.integer({ min: 15, max: 50 });
      const maxRefsArb = fc.integer({ min: 1, max: 10 });

      await fc.assert(
        fc.asyncProperty(refCountArb, maxRefsArb, async (refCount, maxRefs) => {
          // Create code with one definition and many references
          const refs = Array(refCount).fill('console.log(x);');
          const code = `const x = 1;\n${refs.join('\n')}`;
          const sourceMap = createTestSourceMap(refCount + 1);

          const result = await analyzeBindings(code, sourceMap, 'x', {
            maxReferences: maxRefs,
          });

          // Should have one binding
          expect(result.bindings.length).toBe(1);
          
          const binding = result.bindings[0];
          
          // References should be limited to maxRefs
          expect(binding.references.length).toBe(maxRefs);
          
          // Total references should be the actual count
          expect(binding.totalReferences).toBe(refCount);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should not limit when references are within limit', async () => {
      const refCountArb = fc.integer({ min: 1, max: 5 });
      const maxRefsArb = fc.integer({ min: 10, max: 20 });

      await fc.assert(
        fc.asyncProperty(refCountArb, maxRefsArb, async (refCount, maxRefs) => {
          const refs = Array(refCount).fill('console.log(x);');
          const code = `const x = 1;\n${refs.join('\n')}`;
          const sourceMap = createTestSourceMap(refCount + 1);

          const result = await analyzeBindings(code, sourceMap, 'x', {
            maxReferences: maxRefs,
          });

          expect(result.bindings.length).toBe(1);
          
          const binding = result.bindings[0];
          
          // All references should be returned
          expect(binding.references.length).toBe(refCount);
          expect(binding.totalReferences).toBe(refCount);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve reference order when limiting', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 20, max: 30 }),
          fc.integer({ min: 5, max: 10 }),
          async (refCount, maxRefs) => {
            // Create code where each reference is on a different line
            const refs = Array(refCount).fill(0).map((_, i) => `console.log(x); // ref ${i}`);
            const code = `const x = 1;\n${refs.join('\n')}`;
            const sourceMap = createTestSourceMap(refCount + 1);

            const result = await analyzeBindings(code, sourceMap, 'x', {
              maxReferences: maxRefs,
            });

            const binding = result.bindings[0];
            
            // References should be in line order
            for (let i = 1; i < binding.references.length; i++) {
              expect(binding.references[i].line).toBeGreaterThan(
                binding.references[i - 1].line
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
