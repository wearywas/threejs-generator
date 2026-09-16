import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { transform } from 'esbuild'
import { build } from 'vite'
import config from '../vite.config.js'

describe('release build hygiene', () => {
  it('keeps vendored license notices in sync with the installed dependencies', async () => {
    for (const [dependency, notice] of [
      ['monaco-editor/ThirdPartyNotices.txt', 'monaco-third-party.txt'],
      ['dompurify/LICENSE', 'dompurify.txt'],
      ['marked/LICENSE.md', 'marked.txt']
    ]) {
      const upstream = await readFile(new URL(`../node_modules/${dependency}`, import.meta.url), 'utf8')
      const shipped = await readFile(new URL(`../public/licenses/${notice}`, import.meta.url), 'utf8')
      expect(shipped.replaceAll('\r\n', '\n').trim(), notice).toBe(upstream.replaceAll('\r\n', '\n').trim())
    }
    const seedrandom = await readFile(new URL('../public/licenses/seedrandom.txt', import.meta.url), 'utf8')
    expect(seedrandom).toContain('Copyright 2019 David Bau.')
    expect(seedrandom).toContain('Copyright (C) 2010 by Johannes Baagøe')
    expect(seedrandom).toContain('Permission is hereby granted')
    const quickhull = await readFile(new URL('../public/licenses/quickhull3d.txt', import.meta.url), 'utf8')
    expect(quickhull).toContain('Copyright (c) YYYY Mauricio Poppe')
    expect(quickhull).toContain('included in all copies or substantial portions of the Software.')
  })

  it('compiles the instance schema without silently overwritten fields', async () => {
    const source = await readFile(new URL('../src/schemas/instanceSpec.js', import.meta.url), 'utf8')
    const result = await transform(source, { loader: 'js', logLevel: 'silent' })
    expect(result.warnings.filter(warning => warning.id === 'duplicate-object-key')).toEqual([])
  })

  it('keeps the read-only editor optional and enforces separate app, engine and editor budgets', async () => {
    const options = config({ mode: 'test', command: 'build' })
    const result = await build({ ...options, configFile: false, envDir: false, logLevel: 'silent',
      build: { ...options.build, write: false, sourcemap: false } })
    const chunks = result.output.filter(item => item.type === 'chunk')
    const licenses = result.output.find(item => item.fileName === 'third-party-licenses.txt')
    expect(licenses, 'Distributed builds must carry bundled dependency licenses').toBeDefined()
    expect(String(licenses.source)).toContain('three - 0.169.0')
    expect(String(licenses.source)).toContain('MIT License')
    const moduleIds = chunk => Object.keys(chunk.modules).map(id => id.replaceAll('\\', '/'))
    const entries = chunks.filter(chunk => chunk.isEntry)
    expect(entries).toHaveLength(1)
    const initialChunks = new Set()
    const visitStaticImports = chunk => {
      if (initialChunks.has(chunk)) return
      initialChunks.add(chunk)
      for (const name of chunk.imports) {
        const imported = chunks.find(candidate => candidate.fileName === name)
        if (imported) visitStaticImports(imported)
      }
    }
    visitStaticImports(entries[0])
    expect([...initialChunks].flatMap(moduleIds).some(id => id.includes('/monaco-editor/'))).toBe(false)
    // JSON syntax colors are useful here; completion/validation services for an
    // uneditable, already-validated spec are not. They pull in a second editor.
    expect(chunks.flatMap(moduleIds).some(id => id.endsWith('/lspLanguageFeatures.js'))).toBe(false)
    for (const chunk of chunks) {
      const modules = moduleIds(chunk)
      const budget = modules.some(id => id.includes('/monaco-editor/')) ? 3000000
        : modules.some(id => id.includes('virtual:asset-worker-source')) ? 950000
        : chunk.fileName.includes('three-vendor') ? 850000
        : chunk.isEntry ? 450000 : 500000
      expect(Buffer.byteLength(chunk.code), `${chunk.fileName} exceeded its release budget`).toBeLessThan(budget)
    }
  }, 60000)
})
