# @reverse-craft/smart-fs

智能代码处理库，提供代码美化、截断、搜索、分析和转换功能，支持多语言和 Source Map 生成。

## 功能特性

- **代码美化** - 格式化压缩/混淆代码，生成 Source Map（可在 Chrome DevTools 中设置断点）
- **智能截断** - 截断超长字符串，保留行号和代码结构
- **代码搜索** - 在美化后的代码中搜索，返回原始文件位置
- **变量分析** - 基于 AST 作用域分析，查找变量/函数的定义和引用
- **代码转换** - 应用自定义 Babel 插件进行代码转换

## 支持的语言

| 语言 | 美化 | AST 截断 | Source Map |
|------|------|----------|------------|
| JavaScript/TypeScript | ✓ | ✓ | ✓ |
| JSON | ✓ | - | - |
| HTML/XML | ✓ | - | - |
| CSS | ✓ | - | - |
| 其他 | 回退模式 | 回退模式 | - |

## 安装

```bash
npm install @reverse-craft/smart-fs
```

## 快速开始

```typescript
import { smartRead, smartSearch, findUsage } from '@reverse-craft/smart-fs';

// 读取并处理文件
const result = await smartRead('./dist/app.min.js', {
  charLimit: 300,      // 字符串截断长度
  maxLineChars: 500,   // 每行最大字符数
});
console.log(result.code);

// 搜索代码
const searchResult = await smartSearch('./dist/app.min.js', 'function', {
  contextLines: 2,
  caseSensitive: false,
});
console.log(searchResult.formatted);

// 查找变量用法
const usageResult = await findUsage('./dist/app.min.js', 'myFunction');
console.log(usageResult.formatted);
```

## API

### 便捷函数

#### `smartRead(filePath, options?)`

读取文件并进行美化和截断处理。

```typescript
const result = await smartRead('./app.min.js', {
  startLine: 1,        // 起始行（可选）
  endLine: 100,        // 结束行（可选）
  charLimit: 300,      // 字符串截断长度
  maxLineChars: 500,   // 每行最大字符数
  saveLocal: false,    // 是否保存美化后的文件
});
```

#### `smartSearch(filePath, query, options?)`

在美化后的代码中搜索，返回原始文件位置。

```typescript
const result = await smartSearch('./app.min.js', 'decrypt', {
  isRegex: false,
  caseSensitive: false,
  contextLines: 2,
  maxMatches: 50,
});
```

#### `findUsage(filePath, identifier, options?)`

查找变量/函数的所有定义和引用。

```typescript
const result = await findUsage('./app.min.js', '_0x1234', {
  targetLine: 42,      // 指定行号精确定位
  maxReferences: 10,
});
```

### 模块导出

库导出以下模块，可按需使用：

```typescript
// 语言检测
import { detectLanguage, getLanguageInfo, isFullySupportedLanguage } from '@reverse-craft/smart-fs';

// 代码美化
import { beautifyCode, ensureBeautified } from '@reverse-craft/smart-fs';

// 代码截断
import { truncateCode, truncateCodeFromFile, truncateFallback } from '@reverse-craft/smart-fs';

// 代码搜索
import { searchInCode, formatSearchResult } from '@reverse-craft/smart-fs';

// 变量分析
import { analyzeBindings, formatAnalysisResult } from '@reverse-craft/smart-fs';

// 代码转换
import { applyCustomTransform, loadBabelPlugin } from '@reverse-craft/smart-fs';
```

## 输出示例

### smartRead 输出

```
/path/to/app.min.js (1-20/5000)
Src=原始位置（用于设置断点）
 1 L1:0       var _0x1234 = function() {
 2 L1:25        var data = "SGVsbG8gV29ybGQ=...[TRUNCATED 50000 CHARS]...base64==";
 3 L1:50078    return decode(data);
 4 L1:50100  };
```

### smartSearch 输出

```
/path/to/app.min.js
Query="decrypt" (literal, case-insensitive)
Src=原始位置（用于设置断点）
Matches: 3
--- Line 42 ---
  40 L1:1000    function process(data) {
  41 L1:1020      var key = getKey();
>>42 L1:1050      return decrypt(data, key);
  43 L1:1080    }
```

### findUsage 输出

```
/path/to/app.min.js
Identifier="_0x1234"
Src=原始位置（用于设置断点）
Bindings: 1 (Targeted at line 10)
--- Targeted Scope (const) ---
📍 Definition:
      5 L1:100      const _0x1234 = function() {
🔎 References (3):
     10 L1:200      return _0x1234(); ◀── hit
     15 L1:300      _0x1234.call(this);
     20 L1:400      console.log(_0x1234);
```

## 相关包

- **[@reverse-craft/smart-fs-mcp](https://github.com/reverse-craft/smart-fs-mcp)** - MCP 服务器，将 smart-fs 功能暴露为 MCP 工具
- **[@reverse-craft/ai-tools](https://github.com/reverse-craft/ai-tools)** - AI 辅助工具，如 JSVMP 分发器检测

## 工作原理

1. **美化**: 使用 esbuild 格式化压缩代码并生成 Source Map
2. **截断**: 使用 meriyah 解析 AST，截断长字符串同时保留换行符
3. **映射**: 使用 source-map-js 将美化后的行映射回原始位置

## 使用场景

- 逆向分析混淆/压缩的 JavaScript
- 理解第三方压缩库
- 在美化代码中设置断点调试原始代码

## License

MIT
