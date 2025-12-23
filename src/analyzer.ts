import { SourceMapConsumer } from 'source-map-js';
import { parse, ParserOptions } from '@babel/parser';
import type { NodePath, Visitor } from '@babel/traverse';
import type { Identifier } from '@babel/types';
import type { SourceMap } from './beautifier.js';

// Dynamic import for babel traverse to handle ESM/CJS interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const traverse = require('@babel/traverse').default as (
  parent: Parameters<typeof import('@babel/traverse').default>[0],
  opts?: Parameters<typeof import('@babel/traverse').default>[1],
  scope?: Parameters<typeof import('@babel/traverse').default>[2],
  state?: Parameters<typeof import('@babel/traverse').default>[3],
  parentPath?: Parameters<typeof import('@babel/traverse').default>[4]
) => void;

/**
 * Original position from source map
 */
export interface OriginalPosition {
  line: number | null;
  column: number | null;
}

/**
 * Location information for a definition or reference
 */
export interface LocationInfo {
  /** Line number in beautified code (1-based) */
  line: number;
  /** Column number in beautified code (0-based) */
  column: number;
  /** Original file coordinates from source map */
  originalPosition: OriginalPosition;
  /** Content of the line containing this location */
  lineContent: string;
}

/**
 * Binding information for a variable/function
 */
export interface BindingInfo {
  /** Unique scope identifier */
  scopeUid: number;
  /** Binding kind (var, let, const, param, etc.) */
  kind: string;
  /** Definition location */
  definition: LocationInfo;
  /** All reference locations */
  references: LocationInfo[];
  /** Total reference count (before limiting) */
  totalReferences: number;
}

/**
 * Analysis result containing all bindings for an identifier
 */
export interface AnalysisResult {
  /** All bindings found for the identifier */
  bindings: BindingInfo[];
  /** The identifier that was searched */
  identifier: string;
}


/**
 * Default parser options for Babel
 */
const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  sourceType: 'unambiguous',
  plugins: [
    'jsx',
    'typescript',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'dynamicImport',
    'optionalChaining',
    'nullishCoalescingOperator',
    'objectRestSpread',
  ],
  errorRecovery: true,
};

/**
 * Parse JavaScript/TypeScript code into an AST
 * @param code - Source code to parse
 * @returns Parsed AST
 * @throws Error if parsing fails
 */
export function parseCode(code: string) {
  try {
    return parse(code, DEFAULT_PARSER_OPTIONS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Parse error: ${message}`);
  }
}


/**
 * Get original position for a location using source map consumer
 */
function getOriginalPosition(
  consumer: SourceMapConsumer,
  line: number,
  column: number
): OriginalPosition {
  const pos = consumer.originalPositionFor({ line, column });
  return {
    line: pos.line,
    column: pos.column,
  };
}

/**
 * Get line content from code by line number (1-based)
 */
function getLineContent(lines: string[], lineNumber: number): string {
  if (lineNumber < 1 || lineNumber > lines.length) {
    return '';
  }
  return lines[lineNumber - 1];
}

/**
 * Create a LocationInfo object
 */
function createLocationInfo(
  line: number,
  column: number,
  lines: string[],
  consumer: SourceMapConsumer
): LocationInfo {
  return {
    line,
    column,
    originalPosition: getOriginalPosition(consumer, line, column),
    lineContent: getLineContent(lines, line),
  };
}

/**
 * Options for binding analysis
 */
export interface AnalyzeOptions {
  /** Maximum references to return per binding (default 10) */
  maxReferences?: number;
}

/**
 * Analyze bindings for a specific identifier in the code
 * Uses Babel traverse to find all bindings and their references
 * 
 * @param code - Beautified code to analyze
 * @param rawMap - Source map for coordinate mapping
 * @param identifier - Variable/function name to find
 * @param options - Analysis options
 * @returns Analysis result with all bindings
 */
export function analyzeBindings(
  code: string,
  rawMap: SourceMap,
  identifier: string,
  options?: AnalyzeOptions
): AnalysisResult {
  const maxReferences = options?.maxReferences ?? 10;
  
  // Parse the code
  const ast = parseCode(code);
  
  // Split code into lines for content extraction
  const lines = code.split('\n');
  
  // Create source map consumer
  const consumer = new SourceMapConsumer({
    ...rawMap,
    version: String(rawMap.version),
  });
  
  // Collect all bindings for the identifier
  const bindings: BindingInfo[] = [];
  const processedScopes = new Set<number>();
  
  try {
    traverse(ast, {
      Identifier(path: NodePath<Identifier>) {
        // Only process if this is the identifier we're looking for
        if (path.node.name !== identifier) {
          return;
        }
        
        // Get the binding for this identifier
        const binding = path.scope.getBinding(identifier);
        if (!binding) {
          return;
        }
        
        // Get scope UID to avoid processing same binding multiple times
        const scopeUid = binding.scope.uid;
        if (processedScopes.has(scopeUid)) {
          return;
        }
        processedScopes.add(scopeUid);
        
        // Get definition location
        const defNode = binding.identifier;
        const defLoc = defNode.loc;
        if (!defLoc) {
          return;
        }
        
        const definition = createLocationInfo(
          defLoc.start.line,
          defLoc.start.column,
          lines,
          consumer
        );
        
        // Get all reference locations
        const allReferences: LocationInfo[] = [];
        for (const refPath of binding.referencePaths) {
          const refLoc = refPath.node.loc;
          if (!refLoc) {
            continue;
          }
          
          allReferences.push(
            createLocationInfo(
              refLoc.start.line,
              refLoc.start.column,
              lines,
              consumer
            )
          );
        }
        
        // Store total count before limiting
        const totalReferences = allReferences.length;
        
        // Limit references
        const limitedReferences = allReferences.slice(0, maxReferences);
        
        bindings.push({
          scopeUid,
          kind: binding.kind,
          definition,
          references: limitedReferences,
          totalReferences,
        });
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Analysis error: ${message}`);
  }
  
  return {
    bindings,
    identifier,
  };
}


/**
 * Format source position as "L{line}:{column}" or placeholder
 */
export function formatSourcePosition(line: number | null, column: number | null): string {
  if (line !== null && column !== null) {
    return `L${line}:${column}`;
  }
  return '';
}

/**
 * Format analysis result for output
 * @param filePath - Path to the file
 * @param result - Analysis result
 * @param maxReferences - Maximum references shown per binding
 * @returns Formatted output string
 */
export function formatAnalysisResult(
  filePath: string,
  result: AnalysisResult,
  maxReferences: number = 10
): string {
  const { bindings, identifier } = result;
  
  const outputParts: string[] = [];
  
  // Header
  outputParts.push(`FILE: ${filePath}`);
  outputParts.push(`IDENTIFIER: "${identifier}"`);
  
  if (bindings.length === 0) {
    outputParts.push('BINDINGS: No definitions or references found');
    return outputParts.join('\n');
  }
  
  const scopeInfo = bindings.length > 1 ? ' (in different scopes)' : '';
  outputParts.push(`BINDINGS: ${bindings.length} found${scopeInfo}`);
  outputParts.push('-'.repeat(85));
  
  // Format each binding
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    
    outputParts.push(`=== Scope #${i + 1} (${binding.kind}) ===`);
    
    // Format definition
    outputParts.push('📍 Definition:');
    const defSrcPos = formatSourcePosition(
      binding.definition.originalPosition.line,
      binding.definition.originalPosition.column
    );
    const defSrcPosPadded = defSrcPos ? `Src ${defSrcPos}` : '';
    outputParts.push(
      `   ${binding.definition.line} | [${defSrcPosPadded.padEnd(14, ' ')}] | ${binding.definition.lineContent}`
    );
    
    // Format references
    const refCount = binding.references.length;
    const totalRefs = binding.totalReferences;
    
    if (totalRefs === 0) {
      outputParts.push('🔎 References: None');
    } else {
      outputParts.push(`🔎 References (${totalRefs}):`);
      
      for (const ref of binding.references) {
        const refSrcPos = formatSourcePosition(
          ref.originalPosition.line,
          ref.originalPosition.column
        );
        const refSrcPosPadded = refSrcPos ? `Src ${refSrcPos}` : '';
        outputParts.push(
          `   ${ref.line} | [${refSrcPosPadded.padEnd(14, ' ')}] | ${ref.lineContent}`
        );
      }
      
      // Add truncation message if references were limited
      if (totalRefs > maxReferences) {
        const remaining = totalRefs - maxReferences;
        outputParts.push(`   ... (${remaining} more references not shown)`);
      }
    }
    
    outputParts.push(''); // Empty line between bindings
  }
  
  return outputParts.join('\n');
}
