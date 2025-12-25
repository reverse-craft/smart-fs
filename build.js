import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

// Build the library entry point (index.ts)
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  // babel 相关包也作为外部依赖，但需要特殊处理 ESM/CJS 兼容
  packages: 'external',
  // 将 CommonJS 模块的 require 转换为可在 ESM 中使用的形式
  mainFields: ['module', 'main'],
});

// Generate TypeScript declaration files
try {
  execSync('npx tsc --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });
} catch (e) {
  console.warn('Warning: TypeScript declaration generation had issues, but build continues.');
}

console.log('Build complete!');
