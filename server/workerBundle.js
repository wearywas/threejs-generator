import { build } from 'esbuild'
import { resolve } from 'node:path'

/** Bundle locally installed runtime code; never load model source or environment. */
export function assetWorkerPlugin() {
  const id = 'virtual:asset-worker-source'
  let devServer
  const watched = new Set()
  return {
    name: 'isolated-asset-worker',
    configureServer(server) {
      devServer = server
      server.watcher.on('change', path => {
        if (!watched.has(resolve(path))) return
        const module = server.moduleGraph.getModuleById('\0' + id)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      })
    },
    resolveId(source) { if (source === id) return '\0' + id },
    async load(source) {
      if (source !== '\0' + id) return
      const result = await build({ entryPoints: [resolve('src/runtime/isolated/worker.js')], bundle: true, write: false,
        format: 'iife', platform: 'browser', target: 'es2022', minify: true, metafile: true, legalComments: 'inline' })
      for (const path of Object.keys(result.metafile.inputs)) {
        // esbuild includes virtual browser-disabled Node builtins (seedrandom's
        // crypto fallback) in the graph; they are not files Vite can watch.
        if (path.startsWith('(disabled):')) continue
        const absolute = resolve(path)
        if (devServer) {
          // Vite turns virtual-module addWatchFile entries into browser imports.
          // Never import the worker entry/factory into the host to watch changes.
          watched.add(absolute)
          devServer.watcher.add(absolute)
        } else this.addWatchFile(absolute)
      }
      return `export default ${JSON.stringify(result.outputFiles[0].text)}`
    },
  }
}
