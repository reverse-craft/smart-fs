import { SourceMapConsumer } from 'source-map-js';
import { parse, ParserOptions } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import type { Identifier } from '@babel/types';
import type { SourceMap } from './beautifier.js';

// Dynamic import for babel traverse to handle ESM/CJS interop
type TraverseFn = (
  parent: Parameters<typeof import('@babel/traverse').default>[0],
  opts?: Parameters<typeof import('@babel/traverse').default>[1],
  scope?: Parameters<typeof import('@babel/traverse').default>[2],
  state?: Parameters<typeof import('@babel/traverse').default>[3],
  parentPath?: Parameters<typeof import('@babel/traverse').default>[4]
) => void;

let traverse: TraverseFn | null = null;

async function getTraverse(): Promise<TraverseFn> {
  if (!traverse) {
    const mod = await import('@babel/traverse');
    // Handle both ESM default export and CJS module.exports
    traverse = (mod.default?.default ?? mod.default) as TraverseFn;
  }
  return traverse;
}

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
  /** The location that matched the target line (if targeted search) */
  hitLocation?: LocationInfo;
}

/**
 * Analysis result containing all bindings for an identifier
 */
export interface AnalysisResult {
  /** All bindings found for the identifier */
  bindings: BindingInfo[];
  /** The identifier that was searched */
  identifier: string;
  /** Whether this was a targeted (line-specific) search */
  isTargeted: boolean;
  /** The target line if specified */
  targetLine?: number;
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
  /** Target line number for precise binding identification (1-based) */
  targetLine?: number;
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
export async function analyzeBindings(
  code: string,
  rawMap: SourceMap,
  identifier: string,
  options?: AnalyzeOptions
): Promise<AnalysisResult> {
  const targetLine = options?.targetLine;
  const isTargeted = targetLine !== undefined;
  // Use 15 max references for targeted searches, 10 for regular searches
  const maxReferences = options?.maxReferences ?? (isTargeted ? 15 : 10);
  
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
  
  // Get traverse function
  const traverse = await getTraverse();
  
  try {
    traverse(ast, {
      Identifier(path: NodePath<Identifier>) {
        // Only process if this is the identifier we're looking for
        if (path.node.name !== identifier) {
          return;
        }
        
        // For targeted search, check if this identifier is at the target line
        if (isTargeted) {
          const nodeLoc = path.node.loc;
          if (!nodeLoc || nodeLoc.start.line !== targetLine) {
            return;
          }
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
        
        // Create hit location for targeted search
        let hitLocation: LocationInfo | undefined;
        if (isTargeted) {
          const nodeLoc = path.node.loc!;
          hitLocation = createLocationInfo(
            nodeLoc.start.line,
            nodeLoc.start.column,
            lines,
            consumer
          );
        }
        
        bindings.push({
          scopeUid,
          kind: binding.kind,
          definition,
          references: limitedReferences,
          totalReferences,
          hitLocation,
        });
        
        // For targeted search, stop after finding the first matching binding
        if (isTargeted) {
          path.stop();
        }
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Analysis error: ${message}`);
  }
  
  return {
    bindings,
    identifier,
    isTargeted,
    targetLine,
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
 * Format a single code line with line number, source coordinates, and content
 * Matches the format used in read_code_smart
 */
function formatCodeLine(lineNumber: number, sourcePos: string, code: string, prefix: string = '  '): string {
  const lineNumStr = String(lineNumber).padStart(5, ' ');
  const srcPosPadded = sourcePos ? sourcePos.padEnd(10, ' ') : '          ';
  return `${prefix}${lineNumStr} ${srcPosPadded} ${code}`;
}

/**
 * Check if two locations match (same line and column)
 */
function locationsMatch(loc1: LocationInfo, loc2: LocationInfo): boolean {
  return loc1.line === loc2.line && loc1.column === loc2.column;
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
  const { bindings, identifier, isTargeted, targetLine } = result;
  
  const outputParts: string[] = [];
  
  // Header - matches read_code_smart format
  outputParts.push(`${filePath}`);
  outputParts.push(`Identifier="${identifier}"`);
  outputParts.push(`Src=original position for breakpoints`);
  
  // Handle no bindings found
  if (bindings.length === 0) {
    if (isTargeted && targetLine !== undefined) {
      outputParts.push(`Bindings: None at line ${targetLine}`);
      outputParts.push(`The variable may be global, externally defined, or not present at this line.`);
    } else {
      outputParts.push('Bindings: None');
    }
    return outputParts.join('\n');
  }
  
  // Display "Targeted Scope" header when isTargeted is true
  if (isTargeted) {
    outputParts.push(`Bindings: 1 (Targeted at line ${targetLine})`);
  } else {
    const scopeInfo = bindings.length > 1 ? ' (different scopes)' : '';
    outputParts.push(`Bindings: ${bindings.length}${scopeInfo}`);
  }
  
  // Format each binding
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    
    // Use "Targeted Scope" label for targeted searches
    if (isTargeted) {
      outputParts.push(`--- Targeted Scope (${binding.kind}) ---`);
    } else {
      outputParts.push(`--- Scope #${i + 1} (${binding.kind}) ---`);
    }
    
    // Format definition - check if definition is the hit location
    const defIsHit = isTargeted && binding.hitLocation && 
      locationsMatch(binding.definition, binding.hitLocation);
    const defPrefix = defIsHit ? '📍 Definition (hit):' : '📍 Definition:';
    outputParts.push(defPrefix);
    
    const defSrcPos = formatSourcePosition(
      binding.definition.originalPosition.line,
      binding.definition.originalPosition.column
    );
    const defMarker = defIsHit ? ' ◀── hit' : '';
    outputParts.push(formatCodeLine(binding.definition.line, defSrcPos, binding.definition.lineContent + defMarker, '  '));
    
    // Format references
    const totalRefs = binding.totalReferences;
    
    if (totalRefs === 0) {
      outputParts.push('🔎 References: None');
    } else {
      outputParts.push(`🔎 References (${totalRefs}):`);
      
      for (const ref of binding.references) {
        // Check if this reference is the hit location
        const refIsHit = isTargeted && binding.hitLocation && 
          locationsMatch(ref, binding.hitLocation);
        
        const refSrcPos = formatSourcePosition(
          ref.originalPosition.line,
          ref.originalPosition.column
        );
        const refMarker = refIsHit ? ' ◀── hit' : '';
        outputParts.push(formatCodeLine(ref.line, refSrcPos, ref.lineContent + refMarker, '  '));
      }
      
      // Add truncation message if references were limited
      if (totalRefs > maxReferences) {
        const remaining = totalRefs - maxReferences;
        outputParts.push(`  ... (${remaining} more references not shown)`);
      }
    }
  }
  
  return outputParts.join('\n');
}
