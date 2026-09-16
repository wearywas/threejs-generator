import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  envPrefix: [],
  // This standalone demo does not use the parent workbench's Tailwind setup.
  css: { postcss: { plugins: [] } },
  build: {
    license: { fileName: 'third-party-licenses.txt' },
  },
});
