/**
 * Property-Based Tests for JSVMP Detection Result Parsing
 * 
 * **Property 5: Detection Result Structure Validity**
 * *For any* valid JSON response from LLM containing summary and regions, the parsed result 
 * SHALL have a non-empty summary string and an array of regions where each region contains 
 * all required fields (start, end, type, confidence, description).
 * **Validates: Requirements 3.3, 4.1, 4.2**
 * 
 * **Property 6: Detection Type and Confidence Enum Validity**
 * *For any* parsed detection region, the type field SHALL be one of the valid DetectionType 
 * values and the confidence field SHALL be one of the valid ConfidenceLevel values.
 * **Validates: Requirements 4.3, 4.4**
 * 
 * **Property 7: Invalid JSON Error Handling**
 * *For any* non-JSON string or malformed JSON response, the result parser SHALL throw an 
 * error indicating parse failure.
 * **Validates: Requirements 3.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseDetectionResult, type DetectionType, type ConfidenceLevel } from '../tools/aiFindJsvmpDispatcher.js';

// Arbitraries for generating test data
const detectionTypeArb = fc.constantFrom<DetectionType>(
  'If-Else Dispatcher',
  'Switch Dispatcher',
  'Instruction Array',
  'Stack Operation'
);

const confidenceLevelArb = fc.constantFrom<ConfidenceLevel>(
  'ultra_high',
  'high',
  'medium',
  'low'
);

const detectionRegionArb = fc.record({
  start: fc.integer({ min: 1, max: 10000 }),
  end: fc.integer({ min: 1, max: 10000 }),
  type: detectionTypeArb,
  confidence: confidenceLevelArb,
  description: fc.string({ minLength: 1, maxLength: 200 }),
});

const detectionResultArb = fc.record({
  summary: fc.string({ minLength: 1, maxLength: 500 }),
  regions: fc.array(detectionRegionArb, { minLength: 0, maxLength: 10 }),
});

describe('JSVMP Detection Result Parsing Property Tests', () => {
  /**
   * Feature: jsvmp-detector, Property 5: Detection Result Structure Validity
   * *For any* valid JSON response from LLM containing summary and regions, the parsed result 
   * SHALL have a non-empty summary string and an array of regions where each region contains 
   * all required fields (start, end, type, confidence, description).
   * **Validates: Requirements 3.3, 4.1, 4.2**
   */
  describe('Property 5: Detection Result Structure Validity', () => {
    it('should parse valid detection results with all required fields', () => {
      fc.assert(
        fc.property(detectionResultArb, (detectionResult) => {
          const jsonString = JSON.stringify(detectionResult);
          const parsed = parseDetectionResult(jsonString);

          // Verify summary is present and non-empty
          expect(parsed.summary).toBe(detectionResult.summary);
          expect(parsed.summary.length).toBeGreaterThan(0);

          // Verify regions array
          expect(Array.isArray(parsed.regions)).toBe(true);
          expect(parsed.regions.length).toBe(detectionResult.regions.length);

          // Verify each region has all required fields
          parsed.regions.forEach((region, index) => {
            expect(region.start).toBe(detectionResult.regions[index].start);
            expect(region.end).toBe(detectionResult.regions[index].end);
            expect(region.type).toBe(detectionResult.regions[index].type);
            expect(region.confidence).toBe(detectionResult.regions[index].confidence);
            expect(region.description).toBe(detectionResult.regions[index].description);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('should reject JSON missing summary field', () => {
      fc.assert(
        fc.property(
          fc.array(detectionRegionArb, { minLength: 0, maxLength: 5 }),
          (regions) => {
            const invalidJson = JSON.stringify({ regions });
            expect(() => parseDetectionResult(invalidJson)).toThrow('缺少必需字段: summary');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject JSON missing regions field', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (summary) => {
            const invalidJson = JSON.stringify({ summary });
            expect(() => parseDetectionResult(invalidJson)).toThrow('缺少必需字段: regions');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject regions with missing required fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.constantFrom('start', 'end', 'type', 'confidence', 'description'),
          (summary, missingField) => {
            const region: any = {
              start: 1,
              end: 10,
              type: 'Switch Dispatcher',
              confidence: 'high',
              description: 'test',
            };
            delete region[missingField];

            const invalidJson = JSON.stringify({
              summary,
              regions: [region],
            });

            expect(() => parseDetectionResult(invalidJson)).toThrow(`缺少必需字段: ${missingField}`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: jsvmp-detector, Property 6: Detection Type and Confidence Enum Validity
   * *For any* parsed detection region, the type field SHALL be one of the valid DetectionType 
   * values and the confidence field SHALL be one of the valid ConfidenceLevel values.
   * **Validates: Requirements 4.3, 4.4**
   */
  describe('Property 6: Detection Type and Confidence Enum Validity', () => {
    it('should accept all valid detection types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          detectionTypeArb,
          confidenceLevelArb,
          (summary, type, confidence) => {
            const json = JSON.stringify({
              summary,
              regions: [{
                start: 1,
                end: 10,
                type,
                confidence,
                description: 'test',
              }],
            });

            const result = parseDetectionResult(json);
            expect(result.regions[0].type).toBe(type);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept all valid confidence levels', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          detectionTypeArb,
          confidenceLevelArb,
          (summary, type, confidence) => {
            const json = JSON.stringify({
              summary,
              regions: [{
                start: 1,
                end: 10,
                type,
                confidence,
                description: 'test',
              }],
            });

            const result = parseDetectionResult(json);
            expect(result.regions[0].confidence).toBe(confidence);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid detection types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }).filter(s => 
            !['If-Else Dispatcher', 'Switch Dispatcher', 'Instruction Array', 'Stack Operation'].includes(s)
          ),
          (summary, invalidType) => {
            const json = JSON.stringify({
              summary,
              regions: [{
                start: 1,
                end: 10,
                type: invalidType,
                confidence: 'high',
                description: 'test',
              }],
            });

            expect(() => parseDetectionResult(json)).toThrow('type 值无效');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid confidence levels', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }).filter(s => 
            !['ultra_high', 'high', 'medium', 'low'].includes(s)
          ),
          (summary, invalidConfidence) => {
            const json = JSON.stringify({
              summary,
              regions: [{
                start: 1,
                end: 10,
                type: 'Switch Dispatcher',
                confidence: invalidConfidence,
                description: 'test',
              }],
            });

            expect(() => parseDetectionResult(json)).toThrow('confidence 值无效');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: jsvmp-detector, Property 7: Invalid JSON Error Handling
   * *For any* non-JSON string or malformed JSON response, the result parser SHALL throw an 
   * error indicating parse failure.
   * **Validates: Requirements 3.5**
   */
  describe('Property 7: Invalid JSON Error Handling', () => {
    it('should reject non-JSON strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => {
            try {
              JSON.parse(s);
              return false; // Valid JSON, skip
            } catch {
              return true; // Invalid JSON, use it
            }
          }),
          (invalidJson) => {
            expect(() => parseDetectionResult(invalidJson)).toThrow('无法解析 LLM 响应');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-object JSON values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.integer(),
            fc.boolean(),
            fc.string(),
            fc.array(fc.anything())
          ),
          (nonObject) => {
            const jsonString = JSON.stringify(nonObject);
            expect(() => parseDetectionResult(jsonString)).toThrow('响应格式无效');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
