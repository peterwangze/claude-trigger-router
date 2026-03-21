/**
 * Build Script
 *
 * 使用 esbuild 构建
 */

const esbuild = require('esbuild');
const path = require('path');

async function build() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/cli.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, '../dist/cli.js'),
      banner: { js: '#!/usr/bin/env node' },
      external: [
        '@anthropic-ai/sdk',
        '@fastify/static',
        '@musistudio/llms',
        'dotenv',
        'fastify',
        'js-yaml',
        'json5',
        'lru-cache',
        'openurl',
        'rotating-file-stream',
        'tiktoken',
        'uuid',
      ],
      minify: false,
      sourcemap: true,
    });

    console.log('✅ Build successful');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
