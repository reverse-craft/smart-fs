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
  external: []  // 不排除任何依赖，全部打包
});

console.log('Build complete!');
