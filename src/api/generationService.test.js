import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const execution = vi.hoisted(() => ({ wait: null }))
vi.mock('../runtime/isolated/client.js', async () => {
  const runtime = await import('../test/isolatedRuntime.js')
  return { executeIsolated: async (...args) => {
    if (execution.wait) await execution.wait
    return runtime.executeIsolated(...args)
  } }
})
import * as service from './claudeService.js'
import { generationProgress } from './generationProgress.js'

const calls = []
beforeEach(() => {
  calls.length = 0
  execution.wait = null
  vi.stubGlobal('fetch', async (url, options) => {
    if (url === '/api/session') return Response.json({ csrfToken: 'test-csrf', provider: 'openai' })
    calls.push(JSON.parse(options.body))
    return Response.json({ code: 'incomplete_output', error: 'Output was truncated.', retryable: false }, { status: 502 })
  })
})

describe('generation operation progress', () => {
  const code = `function createAsset(THREE) {
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    return { root }
  }`
  const run = (task, options = {}) => ({
    creative: () => service.generateCreativeAsset('a cube', [], 3, options),
    convert: () => service.convertToProceduralAsset(code, 'a cube', 3, options),
    animate: () => service.addAnimationToAsset(code, 'a cube', null, 3, options),
    edit: () => service.editAsset(code, 'a cube', 'make it blue', null, null, 3, options),
    spec: () => service.generateAssetSpec('a rock', 3, [], options),
  }[task])()
  const response = (task, source = code) => Response.json({
    text: task === 'spec' ? JSON.stringify({ generator: 'rockCluster', params: { count: 1 }, seed: 0 })
      : task === 'creative' ? source : JSON.stringify({ code: source, schema: {} }),
    provider: 'test', model: 'test', stopReason: 'completed',
  })
  let snapshots, unsubscribe
  beforeEach(() => {
    snapshots = []
    unsubscribe = generationProgress.subscribe(() => snapshots.push(generationProgress.getSnapshot()))
  })
  afterEach(() => {
    unsubscribe()
    vi.restoreAllMocks()
  })

  it.each(['creative', 'convert', 'animate', 'edit', 'spec'])('%s reports real boundaries and clears on success', async task => {
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' }) : response(task))
    const result = await run(task)
    result.asset?.dispose()
    expect(snapshots.filter(Boolean).map(state => state.stage)).toEqual(
      task === 'spec' ? ['preparing', 'model', 'validation'] : ['preparing', 'model', 'validation', 'execution'])
    expect(snapshots.filter(Boolean).every(state => state.task === task)).toBe(true)
    expect(snapshots.at(-1)).toBeNull()
    expect(generationProgress.getSnapshot()).toBeNull()
  })

  it.each(['creative', 'convert', 'animate', 'edit'])('%s remains active after the model returns until execution validates', async task => {
    let release
    execution.wait = new Promise(resolve => { release = resolve })
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' }) : response(task))
    const pending = run(task)
    try {
      await vi.waitFor(() => expect(generationProgress.getSnapshot()?.stage).toBe('execution'))
      expect(snapshots).not.toContain(null)
    } finally {
      release()
      const result = await pending
      result.asset.dispose()
    }
    expect(generationProgress.getSnapshot()).toBeNull()
  })

  it.each(['creative', 'convert', 'animate', 'edit'])('%s exposes actual repair numbers and keeps the same operation identity', async task => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let count = 0
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' })
      : response(task, ++count < 3 ? 'function createAsset() { throw new Error("broken fixture") }' : code))
    const result = await run(task)
    result.asset.dispose()
    const states = snapshots.filter(Boolean)
    expect(states.filter(state => state.stage === 'repair').map(state => [state.attempt, state.repairAttempt])).toEqual([[2, 1], [3, 2]])
    expect(states.filter(state => state.stage === 'repair').map(state => state.retryReason)).toEqual([
      'Execution failed: broken fixture', 'Execution failed: broken fixture',
    ])
    expect(new Set(states.map(state => state.id)).size).toBe(1)
    expect(states.at(-1)).toMatchObject({ stage: 'execution', attempt: 3, repairAttempt: 2, maxAttempts: 3 })
    expect(snapshots.at(-1)).toBeNull()
  })

  it.each(['creative', 'convert', 'animate', 'edit', 'spec'])('%s clears progress on a non-retryable provider failure', async task => {
    await expect(run(task)).rejects.toMatchObject({ retryable: false })
    expect(snapshots.filter(Boolean).map(state => state.stage)).toEqual(['preparing', 'model'])
    expect(snapshots.at(-1)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('distinguishes a fresh model retry from a code repair', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let count = 0
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' })
      : response('creative', ++count === 1 ? 'not a createAsset function' : code))
    const result = await run('creative')
    result.asset.dispose()
    expect(snapshots.filter(state => state?.stage === 'model').map(state => [state.attempt, state.repairAttempt])).toEqual([[1, 0], [2, 0]])
    expect(snapshots.some(state => state?.stage === 'repair')).toBe(false)
    expect(snapshots.find(state => state?.stage === 'model' && state.attempt === 2)?.retryReason).toContain('Code must start with')
  })

  it('clears after failed execution without publishing a success state', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' })
      : response('creative', 'function createAsset() { throw new Error("broken fixture") }'))
    await expect(run('creative')).rejects.toThrow('Failed to generate working code after 3 attempts')
    expect(snapshots.filter(Boolean).at(-1)).toMatchObject({ stage: 'execution', attempt: 3, repairAttempt: 2 })
    expect(snapshots.some(state => state?.stage === 'success')).toBe(false)
    expect(snapshots.at(-1)).toBeNull()
  })

  it('clears immediately on cancellation and ignores the old operation after a new one starts', async () => {
    let release
    const controller = new AbortController()
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' })
      : new Promise(resolve => { release = () => resolve(response('creative')) }))
    const pending = run('creative', { signal: controller.signal })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(generationProgress.getSnapshot()).toMatchObject({ stage: 'model' })
    controller.abort()
    expect(generationProgress.getSnapshot()).toBeNull()
    const current = generationProgress.start('edit')
    const snapshot = generationProgress.getSnapshot()
    try {
      release()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      expect(generationProgress.getSnapshot()).toBe(snapshot)
    } finally { current.finish() }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('generation task provider routing', () => {
  it.each([
    ['creative', () => service.generateCreativeAsset('an apartment building')],
    ['convert', () => service.convertToProceduralAsset('function createAsset() {}', 'an apartment building')],
    ['animate', () => service.addAnimationToAsset('function createAsset() {}', 'an apartment building')],
    ['edit', () => service.editAsset('function createAsset() {}', 'an apartment building', 'repair the trim')],
  ])('%s receives portable surface-construction guidance', async (task, run) => {
    await expect(run()).rejects.toMatchObject({ retryable: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].task).toBe(task)
    const system = calls[0].system
    expect(system).toContain('Intersecting solid volumes are fine')
    expect(system).toContain('coplanar visible faces cause z-fighting')
    expect(system).toContain('one owner for each exposed surface')
    expect(system).toContain('scale-relative physical clearance')
    expect(system).toContain('shared module boundaries')
    expect(system).toContain('across the full parameter range')
    expect(system).toContain('Do not use polygonOffset, renderOrder, or disabled depth testing')
  })

  it.each([false, true])('sends trimmed conversion guidance in the real provider payload (repair: %s)', async repair => {
    const code = `function createAsset(THREE, seed, textures, params) {
      const root = new THREE.Group()
      root.userData.inputs = { seed, textures, params }
      root.add(new THREE.Mesh(new THREE.BoxGeometry(params.width, 1, 1), new THREE.MeshStandardMaterial()))
      return { root }
    }`
    vi.stubGlobal('fetch', async (url, request) => {
      if (url === '/api/session') return Response.json({ csrfToken: 'test-csrf' })
      calls.push(JSON.parse(request.body))
      const text = JSON.stringify(repair && calls.length === 1 ? { code } : { code, schema: { width: { type: 'number', default: 1 } } })
      return Response.json({ text, provider: 'test', model: 'test', stopReason: 'completed' })
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const execOptions = { seed: 0, textures: { wall: 'saved' }, params: { width: 3 } }
    let result
    try {
      result = await service.convertToProceduralAsset(code, 'a box with a lid', 3, execOptions, { guidance: ' \nWidth and lid height\nKeep the lid attached.\t ' })
      expect(calls).toHaveLength(repair ? 2 : 1)
      for (const request of calls) {
        expect(request.task).toBe('convert')
        expect(request.messages).toHaveLength(1)
        expect(request.messages[0].role).toBe('user')
        expect(request.messages[0].content).toContain('\n\n## Requested Controls (optional)\nWidth and lid height\nKeep the lid attached.\n\n')
        expect(request.messages[0].content).toContain('Original prompt: "a box with a lid"')
        expect(request.messages[0].content).toContain(code)
      }
      if (repair) {
        expect(calls[1].messages[0].content).toContain(calls[0].messages[0].content)
        expect(calls[1].messages[0].content).toContain('Previous attempt failed with error: Response missing "schema" field')
      }
      expect(result.asset.root.userData.inputs).toEqual({ seed: 0, textures: { wall: 'saved' }, params: { width: 3 } })
      expect(execOptions).toEqual({ seed: 0, textures: { wall: 'saved' }, params: { width: 3 } })
    } finally {
      result?.asset.dispose()
      warning.mockRestore()
    }
  })

  it.each([undefined, {}, { guidance: '' }, { guidance: ' \t\n ' }])('keeps the automatic outgoing conversion message with options %j', async options => {
    await expect(service.convertToProceduralAsset('function createAsset() {}', 'a cube', 3, { guidance: 'not a runtime option' }, options)).rejects.toMatchObject({ retryable: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'Convert this ThreeJS code to accept dynamic parameters.\n\nOriginal prompt: "a cube"\n\nCode to convert:\n```javascript\nfunction createAsset() {}\n```\n\nRemember: Output ONLY the JSON with "code" and "schema" fields. No markdown, no explanation.' }])
  })

  it('sends conversion instructions for meaningful requested controls and connected geometry', async () => {
    await expect(service.convertToProceduralAsset('function createAsset() {}', 'a house', 1, {}, { guidance: 'floors and rooms' })).rejects.toMatchObject({ retryable: false })
    const system = calls[0].system
    expect(system).toMatch(/prioritize[^\n]*requested controls/i)
    expect(system).toMatch(/absent[^\n]*automatically[^\n]*useful controls/i)
    expect(system).toMatch(/default[^\n]*appearance/i)
    expect(system).toMatch(/seed[^\n]*textures[^\n]*animation/i)
    expect(system).toMatch(/every schema[^\n]*visible effect/i)
    expect(system).toMatch(/overall scal[^\n]*floors[^\n]*rooms/i)
    expect(system).toMatch(/recompute[^\n]*connected[^\n]*attached/i)
    expect(system).toMatch(/safe min\/max[^\n]*combinations/i)
    expect(system).toMatch(/do not promise arbitrary room support/i)
  })

  it.each([
    [{}, {}, 'treePlant'],
    [{ assetFamily: 'tower' }, {}, 'tower'],
    [{ assetFamily: 'tower' }, { assetFamily: 'smallBuilding' }, 'smallBuilding'],
    [{ assetFamily: 'treePlant' }, { assetFamily: 'general' }, 'general'],
  ])('uses one family for prompting and execution with execution %j and prompt %j options', async (execOptions, options, family) => {
    const code = `function createAsset(THREE) {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.position.y = 2;
      root.add(mesh);
      return { root };
    }`
    vi.stubGlobal('fetch', async (url, request) => {
      if (url === '/api/session') return Response.json({ csrfToken: 'test-csrf' })
      calls.push(JSON.parse(request.body))
      return Response.json({ text: code, provider: 'test', model: 'test', stopReason: 'completed' })
    })
    const result = await service.generateCreativeAsset('a tree with a lantern', [], 3, execOptions, options)
    try {
      expect(calls).toHaveLength(1)
      if (family === 'general') expect(calls[0].system).not.toContain('## Family-Specific Guidance')
      else expect(calls[0].system).toContain(`Asset family: ${family}`)
      expect(result.asset.criticEvaluation.accepted).toBe(family === 'general')
      expect(result.diagnostics.attempts).toHaveLength(1)
      expect(result.diagnostics.attempts[0].outcome).toBe('succeeded')
    } finally {
      result.asset.dispose()
    }
  })

  it.each(['convert', 'animate', 'edit'])('%s executes reconciled parameters with the original seed and textures', async task => {
    const code = `function createAsset(THREE, seed, textures, params) {
      const root = new THREE.Group()
      root.userData.inputs = { seed, textures, params }
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
      return { root }
    }`
    vi.stubGlobal('fetch', async url => url === '/api/session'
      ? Response.json({ csrfToken: 'test-csrf' })
      : Response.json({ text: JSON.stringify({ code, schema: { size: { type: 'number', default: 1 }, fresh: { type: 'number', default: 4 } } }) }))
    const options = { seed: 0, params: { size: 3 }, textures: { wall: 'saved-texture' } }
    const result = await ({
      convert: () => service.convertToProceduralAsset(code, 'cube', 1, options),
      animate: () => service.addAnimationToAsset(code, 'cube', null, 1, options),
      edit: () => service.editAsset(code, 'cube', 'change it', null, null, 1, options),
    }[task])()
    expect(result.params).toEqual({ size: 3, fresh: 4 })
    expect(result.asset.root.userData.inputs).toEqual({ ...options, params: result.params })
    result.asset.dispose()
  })

  it.each([
    ['spec', () => service.generateAssetSpec('a tree')],
    ['creative', () => service.generateCreativeAsset('an arcade cabinet')],
    ['convert', () => service.convertToProceduralAsset('function createAsset() {}', 'a rock')],
    ['animate', () => service.addAnimationToAsset('function createAsset() {}', 'a rock')],
    ['edit', () => service.editAsset('function createAsset() {}', 'a rock', 'make it blue')]
  ])('%s stops immediately on a provider error instead of spending repair attempts', async (task, run) => {
    await expect(run()).rejects.toMatchObject({ code: 'incomplete_output', retryable: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].task).toBe(task)
    expect(calls[0].model).toBeUndefined()
  })

  it.each(['spec', 'creative', 'convert', 'animate', 'edit'])('%s accepts completed provider-neutral text and builds a real asset', async task => {
    const code = `function createAsset(THREE, seed, textures, params, addons) {
      const root = new THREE.Group()
      root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()))
      return { root }
    }`
    let requestCount = 0
    vi.stubGlobal('fetch', async (url, options) => {
      if (url === '/api/session') return Response.json({ csrfToken: 'test-csrf' })
      requestCount++
      expect(JSON.parse(options.body).task).toBe(task)
      const text = task === 'spec' ? JSON.stringify({ generator: 'rockCluster', params: { count: 1 }, seed: 0 })
        : task === 'creative' ? code : JSON.stringify({ code, schema: {} })
      return Response.json({ text, provider: 'openai', model: 'gpt-6-astra', requestedModel: 'gpt-6-astra', usage: { input_tokens: 10, output_tokens: 100 }, stopReason: 'completed' })
    })
    const run = {
      spec: () => service.generateAssetSpec('a rock'),
      creative: () => service.generateCreativeAsset('a cube'),
      convert: () => service.convertToProceduralAsset(code, 'a cube'),
      animate: () => service.addAnimationToAsset(code, 'a cube'),
      edit: () => service.editAsset(code, 'a cube', 'make it gray')
    }[task]
    const result = await run()
    if (task === 'spec') expect(result).toMatchObject({ generator: 'rockCluster', params: { count: 1 }, seed: 0 })
    else {
      expect(result.asset.root.isObject3D).toBe(true)
      expect(result.asset.triangleCount).toBe(12)
      result.asset.dispose()
    }
    expect(requestCount).toBe(1)
  })
})
