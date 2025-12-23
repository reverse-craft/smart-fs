import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/server.js',
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node'
  },
  // babel 相关包也作为外部依赖，但需要特殊处理 ESM/CJS 兼容
  packages: 'external',
  // 将 CommonJS 模块的 require 转换为可在 ESM 中使用的形式
  mainFields: ['module', 'main'],
});

console.log('Build complete!');
