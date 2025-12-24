# @reverse-craft/smart-fs

MCP server for AI-assisted JavaScript reverse engineering. Beautifies minified/obfuscated code and truncates long strings to prevent LLM context overflow.

## Why?

When reverse engineering JavaScript (minified or obfuscated code), AI assistants face two problems:

1. **Minified code is unreadable** - Single-line code with no formatting
2. **Long strings overflow context** - Base64 blobs, encrypted data, and huge arrays waste precious tokens

This MCP server solves both by:
- Auto-beautifying code with source maps (so you can set breakpoints in Chrome DevTools)
- Truncating strings over a configurable limit while preserving line numbers

## Installation

```bash
npm install -g @reverse-craft/smart-fs
```

## MCP Configuration

Add to your MCP config (e.g., `~/.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "smart-fs": {
      "command": "npx",
      "args": ["@reverse-craft/smart-fs"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "smart-fs": {
      "command": "smart-fs"
    }
  }
}
```

## Usage

The server provides five tools:

### 1. read_code_smart

Read and beautify minified/obfuscated JavaScript code with source map coordinates.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | ✓ | - | Path to JavaScript file |
| `start_line` | number | ✓ | - | Start line (1-based) |
| `end_line` | number | ✓ | - | End line (1-based) |
| `char_limit` | number | | 300 | Max string length before truncation |
| `max_line_chars` | number | | 500 | Maximum characters per line |
| `save_local` | boolean | | false | Save beautified file locally |

#### Example Output

```
/path/to/obfuscated.js (1-20/5000)
Src=original position for breakpoints
 1 L1:0       var _0x1234 = function() {
 2 L1:25        var data = "SGVsbG8gV29ybGQ=...[TRUNCATED 50000 CHARS]...base64==";
 3 L1:50078    return decode(data);
 4 L1:50100  };

... (Use next start_line=21 to read more)
```

### 2. find_usage_smart

Find all definitions and references of a variable/function using AST scope analysis.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | ✓ | - | Path to JavaScript file |
| `identifier` | string | ✓ | - | Variable or function name to find |
| `line` | number | | - | Line number for precise binding (recommended for obfuscated code) |
| `char_limit` | number | | 300 | Max string length before truncation |
| `max_line_chars` | number | | 500 | Maximum characters per line |

#### Example Output

```
/path/to/obfuscated.js
Identifier="_0x1234"
Src=original position for breakpoints
Bindings: 1 (Targeted at line 10)
--- Targeted Scope (const) ---
📍 Definition:
      5 L1:100      const _0x1234 = function() {
🔎 References (3):
     10 L1:200      return _0x1234(); ◀── hit
     15 L1:300      _0x1234.call(this);
     20 L1:400      console.log(_0x1234);
```

### 3. search_code_smart

Search for text or regex patterns in beautified JavaScript code.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | ✓ | - | Path to JavaScript file |
| `query` | string | ✓ | - | Text or regex pattern to search |
| `context_lines` | number | | 2 | Number of context lines |
| `case_sensitive` | boolean | | false | Case sensitive search |
| `is_regex` | boolean | | false | Treat query as regex pattern |
| `char_limit` | number | | 300 | Max string length before truncation |
| `max_line_chars` | number | | 500 | Maximum characters per line |

#### Example Output

```
/path/to/obfuscated.js
Query="decrypt" (literal, case-insensitive)
Src=original position for breakpoints
Matches: 3
--- Line 42 ---
  40 L1:1000    function process(data) {
  41 L1:1020      var key = getKey();
>>42 L1:1050      return decrypt(data, key);
  43 L1:1080    }
  44 L1:1100    
```

### 4. apply_custom_transform

Apply a custom Babel transformation to deobfuscate JavaScript code.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `target_file` | string | ✓ | - | Path to the JavaScript file to transform |
| `script_path` | string | ✓ | - | Path to a JS file exporting a Babel Plugin function |
| `output_suffix` | string | | _deob | Suffix for output file name |

#### Example Plugin Script

```javascript
// deob-plugin.js
module.exports = function() {
  return {
    visitor: {
      // Evaluate constant binary expressions: "a" + "b" -> "ab"
      BinaryExpression(path) {
        const { left, right, operator } = path.node;
        if (operator === '+' && 
            left.type === 'StringLiteral' && 
            right.type === 'StringLiteral') {
          path.replaceWith({ type: 'StringLiteral', value: left.value + right.value });
        }
      }
    }
  };
};
```

#### Example Output

```
Transform completed successfully!

Output file: /path/to/obfuscated_deob.js
Source map: /path/to/obfuscated_deob.js.map
```

The output file includes a cascaded source map that traces back to the original minified file, so breakpoints still work in Chrome DevTools.

### 5. ai_find_jsvmp_dispatcher

AI-powered tool to find JSVMP (JavaScript Virtual Machine Protection) dispatcher patterns in code using LLM analysis. Requires `OPENAI_API_KEY` environment variable.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | ✓ | - | Path to JavaScript file |
| `start_line` | number | ✓ | - | Start line (1-based) |
| `end_line` | number | ✓ | - | End line (1-based) |
| `char_limit` | number | | 300 | Max string length before truncation |

#### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✓ | - | OpenAI API key |
| `OPENAI_BASE_URL` | | `https://api.openai.com/v1` | API base URL |
| `OPENAI_MODEL` | | `gpt-4o-mini` | Model name |

#### Example Output

```
=== JSVMP Dispatcher Detection Result ===
File: /path/to/obfuscated.js (100-500)

Summary: 检测到 JSVMP 保护代码，包含主分发器和虚拟栈操作

Detected Regions:
[ultra_high] Lines 150-300: Switch Dispatcher
  大型 switch 语句，包含 50+ case 分支，典型的 JSVMP 分发器结构

[high] Lines 120-140: Stack Operation
  数组操作模式，疑似虚拟栈实现
```

The `Src L:C` shows the original position in the minified file - use these coordinates to set breakpoints in Chrome DevTools.

## Features

- **Auto-beautify**: Formats minified JS using esbuild
- **Source maps**: Maps beautified lines back to original positions
- **Smart truncation**: Preserves line count when truncating strings
- **Caching**: Beautified files are cached based on file modification time
- **Pagination**: Large files can be read in chunks

## How It Works

1. **Beautification**: Uses esbuild to format minified code and generate source maps
2. **Truncation**: Parses AST with meriyah, truncates long string literals while preserving newlines
3. **Mapping**: Uses source-map-js to map each beautified line back to original coordinates

## Use Cases

- Reverse engineering obfuscated/minified JavaScript
- Analyzing obfuscated JavaScript
- Understanding minified third-party libraries
- Setting breakpoints in beautified code while debugging original

## License

MIT
