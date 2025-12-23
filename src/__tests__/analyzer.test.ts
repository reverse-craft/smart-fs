import { describe, it, expect } from 'vitest';
import { parseCode, analyzeBindings, formatAnalysisResult, formatSourcePosition } from '../analyzer.js';
import type { SourceMap } from '../beautifier.js';

// Helper to create a minimal source map for testing
function createTestSourceMap(lineCount: number): SourceMap {
  const mappings: string[] = [];
  for (let i = 0; i < lineCount; i++) {
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

describe('parseCode', () => {
  it('should parse valid JavaScript code', () => {
    const code = 'const x = 1;';
    const ast = parseCode(code);
    expect(ast.type).toBe('File');
    expect(ast.program.body.length).toBe(1);
  });

  it('should parse code with modern syntax', () => {
    const code = `
      const fn = async () => {
        const result = await fetch('/api');
        return result?.data ?? [];
      };
    `;
    const ast = parseCode(code);
    expect(ast.type).toBe('File');
  });

  it('should throw error for invalid code', () => {
    const invalidCode = 'const x = {{{';
    expect(() => parseCode(invalidCode)).toThrow('Parse error');
  });

  it('should handle JSX syntax', () => {
    const jsxCode = 'const el = <div>Hello</div>;';
    const ast = parseCode(jsxCode);
    expect(ast.type).toBe('File');
  });
});

describe('analyzeBindings', () => {
  it('should find binding definition and references', async () => {
    const code = `const x = 1;
console.log(x);
const y = x + 1;`;
    const sourceMap = createTestSourceMap(3);

    const result = await analyzeBindings(code, sourceMap, 'x');

    expect(result.identifier).toBe('x');
    expect(result.bindings.length).toBe(1);
    
    const binding = result.bindings[0];
    expect(binding.kind).toBe('const');
    expect(binding.definition.line).toBe(1);
    expect(binding.references.length).toBe(2);
  });

  it('should separate bindings in different scopes', async () => {
    const code = `function outer() {
  const x = 1;
  console.log(x);
}
function inner() {
  const x = 2;
  console.log(x);
}`;
    const sourceMap = createTestSourceMap(8);

    const result = await analyzeBindings(code, sourceMap, 'x');

    expect(result.bindings.length).toBe(2);
    expect(result.bindings[0].scopeUid).not.toBe(result.bindings[1].scopeUid);
  });

  it('should identify different binding kinds', async () => {
    const code = `var a = 1;
let b = 2;
const c = 3;
function fn(d) {
  console.log(d);
}`;
    const sourceMap = createTestSourceMap(6);

    const resultA = await analyzeBindings(code, sourceMap, 'a');
    const resultB = await analyzeBindings(code, sourceMap, 'b');
    const resultC = await analyzeBindings(code, sourceMap, 'c');
    const resultD = await analyzeBindings(code, sourceMap, 'd');

    expect(resultA.bindings[0].kind).toBe('var');
    expect(resultB.bindings[0].kind).toBe('let');
    expect(resultC.bindings[0].kind).toBe('const');
    expect(resultD.bindings[0].kind).toBe('param');
  });

  it('should return empty bindings for non-existent identifier', async () => {
    const code = 'const x = 1;';
    const sourceMap = createTestSourceMap(1);

    const result = await analyzeBindings(code, sourceMap, 'nonexistent');

    expect(result.bindings.length).toBe(0);
  });

  it('should limit references per binding', async () => {
    const code = `const x = 1;
console.log(x, x, x, x, x);
console.log(x, x, x, x, x);
console.log(x, x, x);`;
    const sourceMap = createTestSourceMap(4);

    const result = await analyzeBindings(code, sourceMap, 'x', { maxReferences: 5 });

    const binding = result.bindings[0];
    expect(binding.references.length).toBe(5);
    expect(binding.totalReferences).toBeGreaterThan(5);
  });

  it('should include line content in location info', async () => {
    const code = `const myVar = 42;
console.log(myVar);`;
    const sourceMap = createTestSourceMap(2);

    const result = await analyzeBindings(code, sourceMap, 'myVar');

    const binding = result.bindings[0];
    expect(binding.definition.lineContent).toContain('const myVar = 42');
    expect(binding.references[0].lineContent).toContain('console.log(myVar)');
  });
});

describe('formatSourcePosition', () => {
  it('should format valid position', () => {
    expect(formatSourcePosition(10, 5)).toBe('L10:5');
  });

  it('should return empty string for null values', () => {
    expect(formatSourcePosition(null, 5)).toBe('');
    expect(formatSourcePosition(10, null)).toBe('');
  });
});

describe('formatAnalysisResult', () => {
  it('should format no bindings message', () => {
    const result = {
      bindings: [],
      identifier: 'test',
    };

    const output = formatAnalysisResult('/test/file.js', result);
    expect(output).toContain('No definitions or references found');
  });

  it('should format binding with definition and references', () => {
    const result = {
      bindings: [{
        scopeUid: 1,
        kind: 'const',
        definition: {
          line: 1,
          column: 6,
          originalPosition: { line: 1, column: 100 },
          lineContent: 'const x = 1;',
        },
        references: [{
          line: 2,
          column: 12,
          originalPosition: { line: 1, column: 200 },
          lineContent: 'console.log(x);',
        }],
        totalReferences: 1,
      }],
      identifier: 'x',
    };

    const output = formatAnalysisResult('/test/file.js', result);
    
    expect(output).toContain('FILE: /test/file.js');
    expect(output).toContain('IDENTIFIER: "x"');
    expect(output).toContain('BINDINGS: 1 found');
    expect(output).toContain('Scope #1 (const)');
    expect(output).toContain('📍 Definition:');
    expect(output).toContain('🔎 References');
  });

  it('should show truncation message for limited references', () => {
    const result = {
      bindings: [{
        scopeUid: 1,
        kind: 'const',
        definition: {
          line: 1,
          column: 6,
          originalPosition: { line: 1, column: 0 },
          lineContent: 'const x = 1;',
        },
        references: [{
          line: 2,
          column: 0,
          originalPosition: { line: 1, column: 0 },
          lineContent: 'x;',
        }],
        totalReferences: 15,
      }],
      identifier: 'x',
    };

    const output = formatAnalysisResult('/test/file.js', result, 10);
    expect(output).toContain('more references not shown');
  });
});
