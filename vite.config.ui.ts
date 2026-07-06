import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, renameSync } from 'fs';
import { resolve } from 'path';

// UI build: bundles the React app and inlines every asset (JS + CSS) into one
// self-contained HTML file. Figma requires the UI to be a single HTML string,
// so we rename the emitted index.html to the ui.html referenced by manifest.json.
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'rename-index-to-ui',
      closeBundle() {
        const from = resolve(__dirname, 'dist/index.html');
        const to = resolve(__dirname, 'dist/ui.html');
        if (existsSync(from)) renameSync(from, to);
      },
    },
  ],
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
