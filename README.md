# @reverse-craft/smart-fs

Smart code processing library with beautification, truncation, search, analysis, and transformation. Multi-language support with source map generation.

## Features

- **Code Beautification** - Format minified/obfuscated code with source maps (set breakpoints in Chrome DevTools)
- **Smart Truncation** - Truncate long strings while preserving line numbers and structure
- **Code Search** - Search in beautified code, returns original file positions
- **Variable Analysis** - AST-based scope analysis to find definitions and references
- **Code Transform** - Apply custom Babel plugins for transformation

## Supported Languages

| Language | Beautify | AST Truncation | Source Map |
|----------|----------|----------------|------------|
| JavaScript/TypeScript | ✓ | ✓ | ✓ |
| JSON | ✓ | - | - |
| HTML/XML | ✓ | - | - |
| CSS | ✓ | - | - |
| Others | Fallback | Fallback | - |

## Installation

```bash
npm install @reverse-craft/smart-fs
```

## Quick Start

```typescript
import { smartRead, smartSearch, findUsage } from '@reverse-craft/smart-fs';

// Read and process file
const result = await smartRead('./dist/app.min.js', {
  charLimit: 300,      // String truncation length
  maxLineChars: 500,   // Max characters per line
});
console.log(result.code);

// Search code
const searchResult = await smartSearch('./dist/app.min.js', 'function', {
  contextLines: 2,
  caseSensitive: false,
});
console.log(searchResult.formatted);

// Find variable usage
const usageResult = await findUsage('./dist/app.min.js', 'myFunction');
console.log(usageResult.formatted);
```

## API

### Convenience Functions

#### `smartRead(filePath, options?)`

Read file with beautification and truncation.

```typescript
const result = await smartRead('./app.min.js', {
  startLine: 1,        // Start line (optional)
  endLine: 100,        // End line (optional)
  charLimit: 300,      // String truncation length
  maxLineChars: 500,   // Max characters per line
  saveLocal: false,    // Save beautified file locally
});
```

#### `smartSearch(filePath, query, options?)`

Search in beautified code, returns original file positions.

```typescript
const result = await smartSearch('./app.min.js', 'decrypt', {
  isRegex: false,
  caseSensitive: false,
  contextLines: 2,
  maxMatches: 50,
});
```

#### `findUsage(filePath, identifier, options?)`

Find all definitions and references of a variable/function.

```typescript
const result = await findUsage('./app.min.js', '_0x1234', {
  targetLine: 42,      // Target line for precise binding
  maxReferences: 10,
});
```

### Module Exports

The library exports the following modules:

```typescript
// Language detection
import { detectLanguage, getLanguageInfo, isFullySupportedLanguage } from '@reverse-craft/smart-fs';

// Code beautification
import { beautifyCode, ensureBeautified } from '@reverse-craft/smart-fs';

// Code truncation
import { truncateCode, truncateCodeFromFile, truncateFallback } from '@reverse-craft/smart-fs';

// Code search
import { searchInCode, formatSearchResult } from '@reverse-craft/smart-fs';

// Variable analysis
import { analyzeBindings, formatAnalysisResult } from '@reverse-craft/smart-fs';

// Code transformation
import { applyCustomTransform, loadBabelPlugin } from '@reverse-craft/smart-fs';
```

## Output Examples

### smartRead Output

```
/path/to/app.min.js (1-20/5000)
Src=original position for breakpoints
 1 L1:0       var _0x1234 = function() {
 2 L1:25        var data = "SGVsbG8gV29ybGQ=...[TRUNCATED 50000 CHARS]...base64==";
 3 L1:50078    return decode(data);
 4 L1:50100  };
```

### smartSearch Output

```
/path/to/app.min.js
Query="decrypt" (literal, case-insensitive)
Src=original position for breakpoints
Matches: 3
--- Line 42 ---
  40 L1:1000    function process(data) {
  41 L1:1020      var key = getKey();
>>42 L1:1050      return decrypt(data, key);
  43 L1:1080    }
```

### findUsage Output

```
/path/to/app.min.js
Identifier="_0x1234"
Src=original position for breakpoints
Bindings: 1 (Targeted at line 10)
--- Targeted Scope (const) ---
📍 Definition:
      5 L1:100      const _0x1234 = function() {
� Referetnces (3):
     10 L1:200      return _0x1234(); ◀── hit
     15 L1:300      _0x1234.call(this);
     20 L1:400      console.log(_0x1234);
```

## Related Packages

- **[@reverse-craft/smart-fs-mcp](https://github.com/reverse-craft/smart-fs-mcp)** - MCP server exposing smart-fs as MCP tools
- **[@reverse-craft/ai-tools](https://github.com/reverse-craft/ai-tools)** - AI-powered tools like JSVMP dispatcher detection

## How It Works

1. **Beautification**: Uses Babel parser and generator to format minified code with source maps (preserves all variable names exactly)
2. **Truncation**: Parses AST with meriyah, truncates long strings while preserving newlines
3. **Mapping**: Uses source-map-js to map beautified lines back to original positions

## Use Cases

- Reverse engineering obfuscated/minified JavaScript
- Understanding minified third-party libraries
- Setting breakpoints in beautified code while debugging original

## License

MIT
