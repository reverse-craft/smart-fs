/**
 * Property-Based Tests for Schema Validation
 * 
 * **Property 1: Search Input Schema Validation**
 * *For any* input object, the schema SHALL accept objects with valid `file_path` (string), 
 * `query` (string), and optional parameters, and SHALL reject objects missing required 
 * fields or with wrong types.
 * **Validates: Requirements 1.3**
 * 
 * **Property 4: Find Usage Input Schema Validation**
 * *For any* input object, the schema SHALL accept objects with valid `file_path` (string), 
 * `identifier` (string), and optional parameters, and SHALL reject objects missing required fields.
 * **Validates: Requirements 4.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchCodeSmartInputSchema, FindUsageSmartInputSchema } from '../tools/index.js';

describe('Schema Property Tests', () => {
  /**
   * Feature: smart-search-tools, Property 1: Search Input Schema Validation
   * *For any* input object with valid file_path and query strings, the schema SHALL accept it.
   * *For any* input missing required fields or with wrong types, the schema SHALL reject it.
   * **Validates: Requirements 1.3**
   */
  describe('Property 1: Search Input Schema Validation', () => {
    it('should accept valid inputs with required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            query: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid inputs with all optional fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            query: fc.string({ minLength: 1 }),
            context_lines: fc.integer({ min: 0, max: 10 }),
            case_sensitive: fc.boolean(),
            char_limit: fc.integer({ min: 50, max: 1000 }),
            max_line_chars: fc.integer({ min: 80, max: 1000 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs missing file_path', () => {
      fc.assert(
        fc.property(
          fc.record({
            query: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs missing query', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs with wrong types', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.integer(), // wrong type
            query: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject char_limit below minimum', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            query: fc.string({ minLength: 1 }),
            char_limit: fc.integer({ min: 1, max: 49 }),
          }),
          (input) => {
            const result = SearchCodeSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: smart-search-tools, Property 4: Find Usage Input Schema Validation
   * *For any* input object with valid file_path and identifier strings, the schema SHALL accept it.
   * *For any* input missing required fields, the schema SHALL reject it.
   * **Validates: Requirements 4.3**
   */
  describe('Property 4: Find Usage Input Schema Validation', () => {
    it('should accept valid inputs with required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            identifier: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = FindUsageSmartInputSchema.safeParse(input);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid inputs with all optional fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            identifier: fc.string({ minLength: 1 }),
            char_limit: fc.integer({ min: 50, max: 1000 }),
            max_line_chars: fc.integer({ min: 80, max: 1000 }),
          }),
          (input) => {
            const result = FindUsageSmartInputSchema.safeParse(input);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs missing file_path', () => {
      fc.assert(
        fc.property(
          fc.record({
            identifier: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = FindUsageSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs missing identifier', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
          }),
          (input) => {
            const result = FindUsageSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject max_line_chars below minimum', () => {
      fc.assert(
        fc.property(
          fc.record({
            file_path: fc.string({ minLength: 1 }),
            identifier: fc.string({ minLength: 1 }),
            max_line_chars: fc.integer({ min: 1, max: 79 }),
          }),
          (input) => {
            const result = FindUsageSmartInputSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
