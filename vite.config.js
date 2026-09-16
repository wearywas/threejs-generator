import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.js'
import { assetWorkerPlugin } from './server/workerBundle.js'

function localApiPlugin(mode) {
  const install = server => {
    // Configuration stays in the Node service, never in the browser bundle.
    const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
    server.middlewares.use(createApi({ env }))
  }
  return { name: 'local-model-api', configureServer: install, configurePreviewServer: install }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localApiPlugin(mode), assetWorkerPlugin()],
  resolve: {
    alias: [{
      // Monaco also vendors DOMPurify: npm overrides alone do not patch it.
      // This import is used by its HTML/markdown sanitizers in dev and builds.
      find: './dompurify/dompurify.js',
      replacement: fileURLToPath(new URL('./node_modules/dompurify/dist/purify.es.mjs', import.meta.url))
    }]
  },
  // Old VITE_ANTHROPIC_API_KEY values must never enter client bundles.
  envPrefix: [],
  server: { host: '127.0.0.1', port: 5173, open: true },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    outDir: 'dist', sourcemap: true,
    license: { fileName: 'third-party-licenses.txt' },
    // Monaco is optional; the isolated worker contains its own Three runtime.
    // Smaller role-specific budgets are enforced by server/releaseBuild.test.js.
    chunkSizeWarningLimit: 3000,
    rolldownOptions: {
      output: {
        postBanner: '/*! Dependency licenses: ../third-party-licenses.txt and ../THIRD_PARTY_NOTICES.txt */',
        codeSplitting: {
          groups: [
            { name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react-vendor', test: /node_modules[\\/](?:react|react-dom)[\\/]/ }
          ]
        }
      }
    }
  }
}))
