import { afterEach, describe, it, expect, vi } from 'vitest'
vi.mock('./isolated/client.js', () => import('../test/isolatedRuntime.js'))
import { createAssetWorkspace } from './assetWorkspace'
import { createAssetActions } from './assetActions'
import { executeCode } from './CodeSandbox'
import { serializeAssetSource } from '../services/assetSource'
import { createAssetDocument } from '../services/assetDocument'

const code = `function createAsset(THREE, seed, textures, params) {
  const root = new THREE.Group()
  root.userData.inputs = { seed, textures, params }
  root.add(new THREE.Mesh(new THREE.BoxGeometry(params.size || 1, 1, 1), new THREE.MeshStandardMaterial()))
  return { root }
}`
const setup = (options = {}) => {
  const workspace = createAssetWorkspace()
  const actions = createAssetActions(workspace, { getExamples: async () => [], getDefaultTextures: async () => ({}), nextSeed: () => 0, ...options })
  return { workspace, actions, current: () => workspace.getSnapshot().current }
}
afterEach(() => vi.unstubAllGlobals())

describe('asset actions', () => {
  it.each([undefined, ' \nMake width and lid height editable. '])('forwards conversion guidance %j separately from execution inputs', async guidance => {
    const services = {
      convertToProceduralAsset: vi.fn(async (_, __, ___, options) => ({
        code, schema: { size: { type: 'number', default: 1 } },
        params: options.params, asset: await executeCode(code, options),
      })),
    }
    const { actions, current, workspace } = setup({ services, getExecutionOptions: () => ({ maxTriangles: 1000 }) })
    try {
      await actions.load({ documentVersion: 1, mode: 'creative', prompt: 'a box', code, seed: 0, params: { size: 3 }, textures: { wall: 'saved' } })
      expect(await actions.convert(guidance)).toBe(true)
      expect(services.convertToProceduralAsset).toHaveBeenCalledExactlyOnceWith(code, 'a box', 3, {
        maxTriangles: 1000, seed: 0, params: { size: 3 }, textures: { wall: 'saved' },
        prompt: 'a box', assetFamily: current().document.family, signal: expect.any(AbortSignal),
      }, { guidance: guidance ?? '' })
      expect(current().asset.root.userData.inputs).toEqual({ seed: 0, params: { size: 3 }, textures: { wall: 'saved' } })
    } finally {
      workspace.deactivate()
    }
  })

  it.each([
    ['a tree with a lantern', 'treePlant'],
    ['a cottage with a door, windows and chimney', 'smallBuilding'],
    ['an arcade cabinet', 'general'],
    ['an arcade cabinet with a side panel depicting a tree', 'general'],
  ])('carries the family for "%s" through generation and saving', async (prompt, assetFamily) => {
    const requests = []
    const floatingCode = code.replace('return { root }', 'root.position.y = 2; return { root }')
    vi.stubGlobal('fetch', async (url, options) => {
      if (url === '/api/session') return Response.json({ csrfToken: 'test-csrf' })
      requests.push(JSON.parse(options.body))
      return Response.json({ text: floatingCode, provider: 'test', model: 'test', stopReason: 'completed' })
    })
    const getExamples = vi.fn(async () => [])
    const { actions, current, workspace } = setup({ getExamples })
    try {
      expect(await actions.generate(prompt)).toBe(true)
      expect(getExamples).toHaveBeenCalledWith(prompt, 'creative', { limit: 3, assetFamily })
      expect(requests).toHaveLength(1)
      if (assetFamily === 'general') expect(requests[0].system).not.toContain('## Family-Specific Guidance')
      else expect(requests[0].system).toContain(`Asset family: ${assetFamily}`)
      expect(current().document.family).toBe(assetFamily)
      // Family-aware critic notes prove execution saw the same classification;
      // even a visibly floating supported asset still commits without retries.
      const reasons = current().asset.criticEvaluation.reasons.join(' ')
      if (assetFamily === 'general') expect(reasons).not.toMatch(/float above/)
      else expect(reasons).toMatch(/float above/)
    } finally {
      workspace.deactivate()
    }
  })

  it('uses code generation for prompts even after loading a built-in template', async () => {
    const services = {
      generateCreativeAsset: async (_, __, ___, options) => ({ code, asset: await executeCode(code, options) }),
      generateAssetSpec: () => { throw new Error('Prompts must not be fitted to templates') },
    }
    const { actions, current, workspace } = setup({ services })
    await actions.load({ mode: 'curated', spec: { generator: 'rockCluster', seed: 10, params: { count: 2 } } })
    expect(await actions.generate('an arcade cabinet')).toBe(true)
    expect(current().document.mode).toBe('creative')
    expect(current().document.code).toBe(code)
    workspace.deactivate()
  })
  it('imports downloaded JavaScript with its saved controls and inputs, not a new seed', async () => {
    const { actions, current, workspace } = setup({ nextSeed: () => 42 })
    const doc = createAssetDocument({ mode: 'procedural', code, seed: 0, params: { size: 3 }, schema: { size: { type: 'number', default: 1 } }, textures: { wall: 'saved' } })
    expect(await actions.importCode(serializeAssetSource(doc), 'download.js')).toBe(true)
    expect(current().document).toEqual(doc)
    expect(current().asset.root.userData.inputs).toEqual({ seed: 0, params: { size: 3 }, textures: { wall: 'saved' } })
    await actions.changeParams({ size: 4 })
    expect(current().asset.root.userData.inputs.params.size).toBe(4)
    const previous = current()
    expect(await actions.importCode(serializeAssetSource(doc).replace('"seed": 0', '"seed": "bad"'))).toBe(false)
    expect(current()).toBe(previous)
    expect(workspace.getSnapshot().error).toMatch(/seed/i)
    workspace.deactivate()
  })
  it('replays mutable factory inputs without allowing the factory to mutate the document', async () => {
    const { actions, current, workspace } = setup()
    const mutableCode = code.replace('const root = new THREE.Group()', 'params.size = (params.size || 1) + 1; textures.wall = "changed in factory"; const root = new THREE.Group()')
    const record = { documentVersion: 1, mode: 'creative', code: mutableCode, seed: 0, params: { size: 2 }, textures: { wall: 'original' } }
    expect(await actions.load(record)).toBe(true)
    expect(current().document).toMatchObject({ params: { size: 2 }, textures: { wall: 'original' } })
    expect(current().asset.root.userData.inputs).toMatchObject({ params: { size: 3 }, textures: { wall: 'changed in factory' } })
    expect(await actions.rerun(mutableCode)).toBe(true)
    expect(current().asset.root.userData.inputs.params.size).toBe(3)
    workspace.deactivate()
  })
  it('merges a curated slider change without resetting the other controls', async () => {
    const { actions, current, workspace } = setup()
    await actions.load({ mode: 'curated', spec: { generator: 'rockCluster', seed: 10, params: { count: 2, color: '#123456' } } })
    const before = current().document.params
    await actions.changeParams({ count: 3 })
    expect(current().document.params).toEqual({ ...before, count: 3 })
    workspace.deactivate()
  })
  it('loads saved inputs without reading unrelated global textures', async () => {
    const defaults = vi.fn()
    const { actions, current, workspace } = setup({ getDefaultTextures: defaults })
    await actions.load({ documentVersion: 1, mode: 'procedural', code, seed: 0, params: { size: 3 }, schema: { size: { type: 'number', default: 1 } }, textures: { wall: 'saved' } })
    expect(current().asset.root.userData.inputs).toEqual({ seed: 0, params: { size: 3 }, textures: { wall: 'saved' } })
    expect(defaults).not.toHaveBeenCalled()
    await actions.changeParams({ size: 4 })
    await actions.changeTexture('wall', 'updated', current())
    expect(current().asset.root.userData.inputs).toEqual({ seed: 0, params: { size: 4 }, textures: { wall: 'updated' } })
    workspace.deactivate()
  })

  it('does not commit invalid code or erase the previous document', async () => {
    const { actions, current, workspace } = setup()
    await actions.importCode(code, 'my-cube.js')
    const original = current()
    expect(await actions.rerun('not valid code')).toBe(false)
    expect(current()).toBe(original)
    expect(original.document.prompt).toBe('my cube')
    workspace.deactivate()
  })

  it('chooses the seed before generation and keeps it through conversion and animation', async () => {
    const services = {
      generateCreativeAsset: vi.fn(async (_, __, ___, options) => ({ code, asset: await executeCode(code, options) })),
      convertToProceduralAsset: vi.fn(async (_, __, ___, options) => ({ code, schema: { size: { type: 'number', default: 2 } }, params: { size: 2 }, asset: await executeCode(code, { ...options, params: { size: 2 } }) })),
      addAnimationToAsset: vi.fn(async (_, __, schema, ___, options) => ({ code, schema, params: options.params, asset: await executeCode(code, options) })),
    }
    const { actions, current, workspace } = setup({ services })
    await actions.generate('a cube', 'creative')
    expect(services.generateCreativeAsset.mock.calls[0][3].seed).toBe(0)
    await actions.convert()
    await actions.changeParams({ size: 5 })
    await actions.animate()
    expect(current().document).toMatchObject({ mode: 'procedural', seed: 0, params: { size: 5 } })
    expect(current().asset.root.userData.inputs.params).toEqual({ size: 5 })
    workspace.deactivate()
  })

  it('cancels before a slow examples lookup can start a paid request', async () => {
    let finish
    const services = { generateCreativeAsset: vi.fn() }
    const { workspace, actions } = setup({ services, getExamples: () => new Promise(resolve => { finish = resolve }) })
    const pending = actions.generate('a cube', 'creative')
    workspace.cancel()
    finish([])
    await pending
    expect(services.generateCreativeAsset).not.toHaveBeenCalled()
  })
})
