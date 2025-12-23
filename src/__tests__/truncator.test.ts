import { describe, it, expect } from 'vitest';
import { truncateCodeHighPerf } from '../truncator.js';

describe('truncateCodeHighPerf', () => {
  it('should return original code for short strings', () => {
    const code = 'const x = "short string";';
    const result = truncateCodeHighPerf(code, 200);
    expect(result).toBe(code);
  });

  it('should truncate long strings', () => {
    const longString = 'a'.repeat(300);
    const code = `const x = "${longString}";`;
    const result = truncateCodeHighPerf(code, 200);
    
    expect(result).toContain('[TRUNCATED 300 CHARS]');
    expect(result.length).toBeLessThan(code.length);
  });

  it('should preserve line count when truncating strings with newlines', () => {
    const stringWithNewlines = 'line1\nline2\nline3\n' + 'a'.repeat(300) + '\nline5\nline6';
    const code = `const x = "${stringWithNewlines}";`;
    
    const originalLineCount = code.split('\n').length;
    const result = truncateCodeHighPerf(code, 200);
    const resultLineCount = result.split('\n').length;
    
    expect(resultLineCount).toBe(originalLineCount);
  });

  it('should handle template literals', () => {
    const longString = 'b'.repeat(300);
    const code = `const x = \`${longString}\`;`;
    const result = truncateCodeHighPerf(code, 200);
    
    expect(result).toContain('[TRUNCATED 300 CHARS]');
  });

  it('should return original code when AST parsing fails', () => {
    const invalidCode = 'const x = {{{invalid';
    const result = truncateCodeHighPerf(invalidCode, 200);
    expect(result).toBe(invalidCode);
  });

  it('should respect custom character limit', () => {
    const mediumString = 'c'.repeat(150);
    const code = `const x = "${mediumString}";`;
    
    // With limit 200, should not truncate
    const result1 = truncateCodeHighPerf(code, 200);
    expect(result1).toBe(code);
    
    // With lower limit 100, should truncate
    const result2 = truncateCodeHighPerf(code, 100);
    expect(result2).toContain('[TRUNCATED 150 CHARS]');
  });

  it('should handle multiple strings in code', () => {
    const longString1 = 'd'.repeat(250);
    const longString2 = 'e'.repeat(250);
    const code = `const a = "${longString1}"; const b = "${longString2}";`;
    const result = truncateCodeHighPerf(code, 200);
    
    expect(result).toContain('[TRUNCATED 250 CHARS]');
    // Should truncate both strings
    const matches = result.match(/\[TRUNCATED 250 CHARS\]/g);
    expect(matches?.length).toBe(2);
  });
});
