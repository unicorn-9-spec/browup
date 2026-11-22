import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

// Dev server port chosen to stay clear of the sibling SmartSpectra projects
// (Upbeat uses 5182).
const DEV_PORT = 5184;

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('electron/main.ts') } },
    },
  },
  preload: {
    // The window runs with sandbox: true, so the preload must be one
    // self-contained CommonJS file (the SmartSpectra preload is bundled in).
    build: {
      externalizeDeps: false,
      rollupOptions: { input: { index: resolve('electron/preload.ts') } },
    },
  },
  renderer: {
    root: resolve('src'),
    publicDir: resolve('static'),
    server: { port: DEV_PORT, strictPort: true },
    plugins: [vue()],
    resolve: { alias: { $config: resolve('config') } },
    build: {
      rollupOptions: { input: { index: resolve('src/index.html') } },
    },
  },
});
