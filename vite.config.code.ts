import { defineConfig } from 'vite';
import { resolve } from 'path';

// Sandbox build: bundles src/code.ts to a single IIFE (dist/code.js) that runs
// inside Figma's plugin sandbox. No DOM, no code-splitting, no external imports.
export default defineConfig({
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/code.ts'),
      formats: ['iife'],
      name: 'figmaPlugin',
      fileName: () => 'code.js',
    },
    rollupOptions: {
      output: { extend: true },
    },
  },
});
