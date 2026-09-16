import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAssetWorkspace } from './assetWorkspace'
import { createAssetActions } from './assetActions'

// Hold the worker boundary so tests control build completion, not wall-clock timing.
const builds = vi.hoisted(() => [])
vi.mock('./isolated/client.js', () => ({
  executeIsolated: (code, options) => new Promise((resolve, reject) => {
    builds.push({ code, ...options, resolve, reject })
  }),
}))

const code = 'function createAsset(THREE, seed, textures, params) { return { root: new THREE.Group() } }'
const record = {
  documentVersion: 1, mode: 'procedural', code, seed: 0,
  params: { size: 1, height: 2 }, textures: {},
  schema: { size: { type: 'number', default: 1 }, height: { type: 'number', default: 2 } },
}
const asset = () => ({ isIsolated: true, triangleCount: 12, hasAnimation: false, dispose: vi.fn() })
async function setup() {
  const workspace = createAssetWorkspace()
  const services = {
    editAsset: vi.fn(async (_, __, ___, ____, _____, ______, options) => ({
      code: code + '\n// edited', schema: record.schema, asset: asset(), params: options.params,
    })),
    generateCreativeAsset: vi.fn(async () => ({ code: code + '\n// generated', asset: asset() })),
  }
  const actions = createAssetActions(workspace, { services, getExamples: async () => [], getDefaultTextures: async () => ({}), nextSeed: () => 42 })
  const loaded = actions.load(record)
  const initialAsset = asset()
  builds[0].resolve(initialAsset)
  await loaded
  builds.length = 0
  return { workspace, actions, services, initialAsset, current: () => workspace.getSnapshot().current }
}

beforeEach(() => { builds.length = 0 })

describe('coalesced parameter scheduling', () => {
  it('keeps the active build alive and merges the latest queued values across keys', async () => {
    const { workspace, actions, current } = await setup()
    const first = current()
    const active = actions.changeParams({ size: 3 })
    const queued = actions.changeParams({ height: 4 })
    const latest = actions.changeParams({ size: 5 })
    expect(builds).toHaveLength(1)
    expect(builds[0].signal.aborted).toBe(false)
    expect(current()).toBe(first)
    expect(workspace.getSnapshot()).toMatchObject({ pending: 'parameters', parameterDraft: { size: 5, height: 4 } })

    const busyStates = []
    const unsubscribe = workspace.subscribe(() => busyStates.push(workspace.getSnapshot().pending))
    const firstBuild = asset()
    builds[0].resolve(firstBuild)
    expect(await active).toBe(true)
    expect(builds).toHaveLength(2)
    expect(current().document.params).toEqual({ size: 3, height: 2 })
    expect(current().sourceRevision).toBe(first.sourceRevision)
    expect(workspace.getSnapshot().parameterDraft).toEqual({ size: 5, height: 4 })
    expect(busyStates).not.toContain(null)
    expect(builds[1].params).toEqual({ size: 5, height: 4 })
    builds[1].resolve(asset())
    expect(await queued).toBe(true)
    expect(await latest).toBe(true)
    expect(current().document.params).toEqual({ size: 5, height: 4 })
    expect(workspace.getSnapshot()).toMatchObject({ pending: null, parameterDraft: null, error: null })
    expect(firstBuild.dispose).toHaveBeenCalledTimes(1)
    unsubscribe()
    workspace.deactivate()
  })

  it('commits progress during a continuous drag and eventually builds the final value', async () => {
    const { workspace, actions, current } = await setup()
    let active = actions.changeParams({ size: 3 })
    for (let batch = 0; batch < 3; batch++) {
      let latest
      for (let tick = 0; tick < 30; tick++) latest = actions.changeParams({ height: batch * 30 + tick })
      expect(builds).toHaveLength(batch + 1)
      expect(builds[batch].signal.aborted).toBe(false)
      builds[batch].resolve(asset())
      expect(await active).toBe(true)
      expect(builds).toHaveLength(batch + 2)
      expect(current().document.params.size).toBe(3)
      active = latest
    }
    expect(builds[3].params).toEqual({ size: 3, height: 89 })
    builds[3].resolve(asset())
    expect(await active).toBe(true)
    expect(current().document.params).toEqual({ size: 3, height: 89 })
    workspace.deactivate()
  })

  it('rolls back a failed batch but still applies independently queued changes', async () => {
    const { workspace, actions, current, initialAsset } = await setup()
    const first = current()
    const failed = actions.changeParams({ size: 99 })
    const queued = actions.changeParams({ height: 7 })
    builds[0].reject(new Error('invalid size'))
    expect(await failed).toBe(false)
    expect(current()).toBe(first)
    expect(initialAsset.dispose).not.toHaveBeenCalled()
    expect(builds).toHaveLength(2)
    expect(builds[1].params).toEqual({ size: 1, height: 7 })
    expect(workspace.getSnapshot().parameterDraft).toEqual({ size: 1, height: 7 })
    builds[1].resolve(asset())
    expect(await queued).toBe(true)
    expect(current().document.params).toEqual({ size: 1, height: 7 })
    workspace.deactivate()
  })

  it('reverts a failed final input to the last successful parameter build', async () => {
    const { workspace, actions, current } = await setup()
    const active = actions.changeParams({ size: 3 })
    const failed = actions.changeParams({ size: 99 })
    builds[0].resolve(asset())
    expect(await active).toBe(true)
    const lastGood = current()
    builds[1].reject(new Error('cannot build that size'))
    expect(await failed).toBe(false)
    expect(current()).toBe(lastGood)
    expect(current().document.params).toEqual({ size: 3, height: 2 })
    expect(workspace.getSnapshot()).toMatchObject({ pending: null, parameterDraft: null, error: 'cannot build that size' })
    workspace.deactivate()
  })

  it('drops queued changes on cancel and disposes an abort-ignoring late success', async () => {
    const { workspace, actions, current } = await setup()
    const first = current()
    const active = actions.changeParams({ size: 3 })
    const queued = actions.changeParams({ height: 7 })
    workspace.cancel()
    expect(workspace.getSnapshot()).toMatchObject({ current: first, pending: null, parameterDraft: null, error: null })
    expect(builds[0].signal.aborted).toBe(true)
    expect(await queued).toBe(false)
    expect(await active).toBe(false)
    const late = asset()
    builds[0].resolve(late)
    await vi.waitFor(() => expect(late.dispose).toHaveBeenCalledTimes(1))
    expect(builds).toHaveLength(1)
    expect(current()).toBe(first)
    const fresh = actions.changeParams({ height: 8 })
    expect(builds[1].params).toEqual({ size: 1, height: 8 })
    builds[1].resolve(asset())
    expect(await fresh).toBe(true)
    workspace.deactivate()
  })

  it.each(['load', 'rerun', 'edit', 'generate', 'importCode', 'changeSeed'])('%s drops active and queued parameter intent before using committed inputs', async operation => {
    const { workspace, actions, current, services } = await setup()
    const active = actions.changeParams({ size: 3 })
    const queued = actions.changeParams({ height: 7 })
    const replacements = {
      load: () => actions.load({ ...record, params: { size: 10, height: 20 } }),
      rerun: () => actions.rerun(code + '\n// rerun'),
      edit: () => actions.edit('change style'),
      generate: () => actions.generate('new cube', 'creative'),
      importCode: () => actions.importCode(code),
      changeSeed: () => actions.changeSeed(123),
    }
    const replacement = replacements[operation]()
    expect(workspace.getSnapshot().parameterDraft).toBe(null)
    expect(builds[0].signal.aborted).toBe(true)
    if (builds[1]) builds[1].resolve(asset())
    expect(await replacement).toBe(true)
    const replacementCurrent = current()
    expect(await queued).toBe(false)
    expect(await active).toBe(false)
    if (operation === 'edit') expect(services.editAsset.mock.calls[0][6].params).toEqual({ size: 1, height: 2 })
    if (operation === 'rerun' || operation === 'changeSeed') expect(current().document.params).toEqual({ size: 1, height: 2 })
    const late = asset()
    builds[0].resolve(late)
    await vi.waitFor(() => expect(late.dispose).toHaveBeenCalledTimes(1))
    expect(current()).toBe(replacementCurrent)
    expect(builds).toHaveLength(['edit', 'generate'].includes(operation) ? 1 : 2)
    workspace.deactivate()
  })

  it('ignores late slider callbacks while a non-parameter operation is pending', async () => {
    const { workspace, actions } = await setup()
    const pending = actions.rerun(code)
    const ignored = actions.changeParams({ size: 5 })
    expect(workspace.getSnapshot()).toMatchObject({ pending: 'rerun', parameterDraft: null })
    expect(builds).toHaveLength(1)
    expect(await ignored).toBe(false)
    builds[0].resolve(asset())
    expect(await pending).toBe(true)
    workspace.deactivate()
  })

  it('deactivation clears the queue even after strict-mode reactivation', async () => {
    const { workspace, actions } = await setup()
    const active = actions.changeParams({ size: 3 })
    const queued = actions.changeParams({ height: 7 })
    workspace.deactivate()
    workspace.activate()
    expect(workspace.getSnapshot()).toMatchObject({ current: null, pending: null, parameterDraft: null })
    expect(await active).toBe(false)
    expect(await queued).toBe(false)
    const late = asset()
    builds[0].resolve(late)
    await vi.waitFor(() => expect(late.dispose).toHaveBeenCalledTimes(1))
    expect(builds).toHaveLength(1)
  })
})
