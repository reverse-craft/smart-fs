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
  packages: 'external'  // 所有 node_modules 依赖都作为外部依赖
});

console.log('Build complete!');
