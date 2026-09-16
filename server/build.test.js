import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import config from '../vite.config.js'

describe('client environment boundary', () => {
  it('never embeds synthetic provider secrets in client bundles, including legacy VITE keys', async () => {
    const keys = { VITE_ANTHROPIC_API_KEY: 'synthetic-legacy-secret-93720', ANTHROPIC_API_KEY: 'synthetic-server-secret-63831', OPENAI_API_KEY: 'synthetic-openai-secret-91382' }
    const previous = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]))
    Object.assign(process.env, keys)
    try {
      const options = typeof config === 'function' ? config({ mode: 'test', command: 'build' }) : config
      const result = await build({ ...options, configFile: false, envDir: false, logLevel: 'silent', plugins: [{
        name: 'environment-probe',
        resolveId(id) { if (id === 'probe') return '\0probe' },
        load(id) { if (id === '\0probe') return 'globalThis.probe = [import.meta.env, import.meta.env.VITE_ANTHROPIC_API_KEY, import.meta.env.ANTHROPIC_API_KEY, import.meta.env.OPENAI_API_KEY]' }
      }], build: { write: false, minify: false, rolldownOptions: { input: 'probe' } } })
      const code = result.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
      expect(code).toContain('globalThis.probe')
      for (const secret of Object.values(keys)) expect(code).not.toContain(secret)
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})

describe('bundled editor dependencies', () => {
  it('uses the audited sanitizer package instead of Monaco\'s vendored copy', async () => {
    const options = typeof config === 'function' ? config({ mode: 'test', command: 'build' }) : config
    const result = await build({ ...options, configFile: false, envDir: false, logLevel: 'silent', plugins: [{
      name: 'monaco-sanitizer-probe',
      resolveId(id) { if (id === 'sanitizer-probe') return '\0sanitizer-probe' },
      load(id) {
        if (id === '\0sanitizer-probe') return 'import { sanitizeHtml } from "monaco-editor/base/browser/domSanitize.js"; globalThis.sanitize = sanitizeHtml'
      }
    }], build: { write: false, minify: false, rolldownOptions: { input: 'sanitizer-probe' } } })
    // Check the real emitted module graph, not just the installed package version:
    // an npm override cannot replace a library's already-vendored source file.
    const modules = result.output.filter(item => item.type === 'chunk')
      .flatMap(item => Object.keys(item.modules)).map(id => id.replaceAll('\\', '/'))
    expect(modules.some(id => id.endsWith('/node_modules/dompurify/dist/purify.es.mjs'))).toBe(true)
    expect(modules.some(id => id.includes('/base/browser/dompurify/dompurify.js'))).toBe(false)
  })
})
