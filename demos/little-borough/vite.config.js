import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  envPrefix: [],
  css: { postcss: { plugins: [] } },
  build: { license: { fileName: 'third-party-licenses.txt' } },
});
