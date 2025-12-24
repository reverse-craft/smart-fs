import { describe, it, expect } from 'vitest';
import { createRegex, searchInCode, formatSearchResult, formatSourcePosition } from '../searcher.js';
import type { SourceMap } from '../beautifier.js';

// Helper to create a minimal source map for testing
function createTestSourceMap(lineCount: number): SourceMap {
  // Create a simple source map that maps each line to itself
  const mappings: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    // Simple mapping: each line maps to line i+1, column 0 in original
    mappings.push('AAAA');
  }
  return {
    version: 3,
    sources: ['test.js'],
    sourcesContent: [''],
    names: [],
    mappings: mappings.join(';'),
  };
}

describe('createRegex', () => {
  it('should create case-insensitive regex by default', () => {
    const regex = createRegex('test');
    expect(regex.flags).toContain('i');
    expect(regex.flags).toContain('g');
  });

  it('should create case-sensitive regex when specified', () => {
    const regex = createRegex('test', true);
    expect(regex.flags).not.toContain('i');
    expect(regex.flags).toContain('g');
  });

  it('should throw error for invalid regex when isRegex is true', () => {
    expect(() => createRegex('[invalid', false, true)).toThrow('Invalid regex');
  });

  it('should not throw for invalid regex when isRegex is false (default)', () => {
    // With isRegex=false (default), special chars are escaped, so no error
    expect(() => createRegex('[invalid')).not.toThrow();
  });

  it('should handle special regex characters when isRegex is true', () => {
    const regex = createRegex('console\\.log', false, true);
    expect(regex.test('console.log("test")')).toBe(true);
    expect(regex.test('consolexlog')).toBe(false);
  });

  it('should escape special regex characters when isRegex is false (default)', () => {
    const regex = createRegex('console.log');
    expect(regex.test('console.log("test")')).toBe(true);
    expect(regex.test('consolexlog')).toBe(false); // dot is escaped, so doesn't match 'x'
  });
});

describe('searchInCode', () => {
  const sampleCode = `function init() {
  var config = {};
  console.log("Starting...");
  return config;
}

function process(data) {
  console.log("Processing");
  return data;
}`;

  const sourceMap = createTestSourceMap(sampleCode.split('\n').length);

  it('should find matches with correct line numbers', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'console.log',
    });

    expect(result.matches.length).toBe(2);
    expect(result.matches[0].lineNumber).toBe(3);
    expect(result.matches[1].lineNumber).toBe(8);
  });

  it('should collect context lines before and after match', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'console.log',
      contextLines: 2,
    });

    const firstMatch = result.matches[0];
    expect(firstMatch.contextBefore.length).toBe(2);
    expect(firstMatch.contextAfter.length).toBe(2);
    
    // Check context before
    expect(firstMatch.contextBefore[0].lineNumber).toBe(1);
    expect(firstMatch.contextBefore[1].lineNumber).toBe(2);
    
    // Check context after
    expect(firstMatch.contextAfter[0].lineNumber).toBe(4);
    expect(firstMatch.contextAfter[1].lineNumber).toBe(5);
  });

  it('should handle context at file boundaries', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'function init',
      contextLines: 3,
    });

    const match = result.matches[0];
    // First line, so no context before
    expect(match.contextBefore.length).toBe(0);
    expect(match.contextAfter.length).toBe(3);
  });

  it('should respect maxMatches limit', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'console.log',
      maxMatches: 1,
    });

    expect(result.matches.length).toBe(1);
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('should return empty matches when no match found', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'nonexistent',
    });

    expect(result.matches.length).toBe(0);
    expect(result.totalMatches).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('should perform case-insensitive search by default', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'CONSOLE',
    });

    expect(result.matches.length).toBe(2);
  });

  it('should perform case-sensitive search when specified', () => {
    const result = searchInCode(sampleCode, sourceMap, {
      query: 'CONSOLE',
      caseSensitive: true,
    });

    expect(result.matches.length).toBe(0);
  });
});

describe('formatSourcePosition', () => {
  it('should format valid position', () => {
    expect(formatSourcePosition(10, 5)).toBe('L10:5');
  });

  it('should return empty string for null line', () => {
    expect(formatSourcePosition(null, 5)).toBe('');
  });

  it('should return empty string for null column', () => {
    expect(formatSourcePosition(10, null)).toBe('');
  });
});

describe('formatSearchResult', () => {
  const sourceMap = createTestSourceMap(10);
  const sampleCode = `line1
line2
match here
line4
line5`;

  it('should format no matches message', () => {
    const result = {
      matches: [],
      totalMatches: 0,
      truncated: false,
    };

    const output = formatSearchResult('/test/file.js', 'query', false, result);
    expect(output).toContain('Matches: None');
  });

  it('should format matches with context', () => {
    const searchResult = searchInCode(sampleCode, sourceMap, {
      query: 'match',
      contextLines: 1,
    });

    const output = formatSearchResult('/test/file.js', 'match', false, searchResult);
    
    expect(output).toContain('/test/file.js');
    expect(output).toContain('Query="match"');
    expect(output).toContain('Matches: 1');
    expect(output).toContain('>>'); // Match line indicator
  });

  it('should show truncation message when results are limited', () => {
    const result = {
      matches: [{
        lineNumber: 3,
        lineContent: 'match here',
        originalPosition: { line: 1, column: 0 },
        contextBefore: [],
        contextAfter: [],
      }],
      totalMatches: 100,
      truncated: true,
    };

    const output = formatSearchResult('/test/file.js', 'query', false, result, 50);
    expect(output).toContain('showing first 50');
    expect(output).toContain('50 more matches not shown');
  });
});
