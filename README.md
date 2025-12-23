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

The server provides one tool: `read_code_smart`

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | ✓ | - | Path to JavaScript file |
| `start_line` | number | ✓ | - | Start line (1-based) |
| `end_line` | number | ✓ | - | End line (1-based) |
| `char_limit` | number | | 300 | Max string length before truncation |

### Example Output

```
FILE: /path/to/obfuscated.js
VIEW: Auto-beautified (Lines 1-20 of 5000)
INFO: [Src L:C] = Location in original minified file (for Chrome Breakpoints)
-------------------------------------------------------------------------------------
 1 | [Src L1:0        ] | var _0x1234 = function() {
 2 | [Src L1:25       ] |   var data = "SGVsbG8gV29ybGQ=...[TRUNCATED 50000 CHARS]...base64==";
 3 | [Src L1:50078    ] |   return decode(data);
 4 | [Src L1:50100    ] | };
...
```

The `[Src L:C]` column shows the original position in the minified file - use these coordinates to set breakpoints in Chrome DevTools.

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
