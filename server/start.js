import { createServer } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnvFile } from 'node:process'
import { createApi } from './api.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }

/** Serve the built app and its local API without exposing the project directory. */
export function createLocalServer({ root = path.join(projectRoot, 'dist'), env = process.env } = {}) {
  const api = createApi({ env })
  const serveStatic = async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    try {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0])
      if (pathname.split(/[\\/]/).some(part => part.startsWith('.'))) throw new Error('Private path')
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const directory = await realpath(root)
      const file = await realpath(path.resolve(directory, relative))
      if (!file.startsWith(directory + path.sep)) throw new Error('Outside build directory')
      const contents = await readFile(file)
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
      res.end(req.method === 'HEAD' ? undefined : contents)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found. Run npm run build before starting the production server.')
    }
  }
  const server = createServer((req, res) => api(req, res, () => serveStatic(req, res)))
  server.requestTimeout = 30000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { loadEnvFile(path.join(projectRoot, '.env')) }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not load local environment configuration.') }
  const port = Number(process.env.PORT || 4173)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.')
  const server = createLocalServer()
  server.on('error', error => { console.error(`Local server could not start (${error.code}).`); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => console.log(`ThreeJS Generator: http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close() })
}
