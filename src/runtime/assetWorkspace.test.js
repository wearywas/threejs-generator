import { describe, it, expect, vi } from 'vitest'
import { createAssetWorkspace, ownAsset } from './assetWorkspace'

const candidate = (name) => ({ document: { name }, asset: { root: {}, dispose: vi.fn() } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

describe('asset workspace ownership', () => {
  it('aborts pending execution without cancelling the committed asset lifetime', async () => {
    const workspace = createAssetWorkspace()
    let committedSignal, pendingSignal
    await workspace.run('generate', (_, __, signal) => { committedSignal = signal; return candidate('first') })
    const work = deferred()
    const pending = workspace.run('edit', (_, __, signal) => { pendingSignal = signal; return work.promise })
    workspace.cancel()
    expect(pendingSignal.aborted).toBe(true)
    expect(committedSignal.aborted).toBe(false)
    work.resolve(candidate('cancelled'))
    await pending
    expect(workspace.getSnapshot().current.document.name).toBe('first')
    workspace.deactivate()
  })
  it('keeps drafts tied to a source revision, not every parameter or texture update', async () => {
    const workspace = createAssetWorkspace()
    const build = code => ({ ...candidate(code), document: { code } })
    await workspace.run('generate', () => build('source-a'))
    const firstSource = workspace.getSnapshot().current.sourceRevision
    expect(firstSource).toBeTypeOf('number')
    await workspace.run('parameters', () => build('source-a'))
    expect(workspace.getSnapshot().current.sourceRevision).toBe(firstSource)
    await workspace.run('edit', () => build('source-b'))
    const editedSource = workspace.getSnapshot().current.sourceRevision
    expect(editedSource).not.toBe(firstSource)
    await workspace.run('load', () => build('source-b'))
    expect(workspace.getSnapshot().current.sourceRevision).not.toBe(editedSource)
    workspace.deactivate()
  })
  it('keeps the committed document and runtime on failed replacement', async () => {
    const workspace = createAssetWorkspace()
    const first = candidate('first')
    await workspace.run('generate', () => first)
    const committed = workspace.getSnapshot().current
    await workspace.run('edit', () => { throw new Error('bad result') })
    expect(workspace.getSnapshot()).toMatchObject({ current: committed, pending: null, error: 'bad result' })
    expect(first.asset.dispose).not.toHaveBeenCalled()
  })

  it('allows only the newest request to commit and disposes stale successes', async () => {
    const workspace = createAssetWorkspace()
    const oldWork = deferred()
    const oldCandidate = candidate('old')
    const slow = workspace.run('load', () => oldWork.promise)
    await workspace.run('generate', () => candidate('new'))
    oldWork.resolve(oldCandidate)
    expect(await slow).toBe(false)
    expect(workspace.getSnapshot().current.document.name).toBe('new')
    expect(oldCandidate.asset.dispose).toHaveBeenCalledTimes(1)
  })

  it('ignores cancelled errors and stale callbacks bound to another document', async () => {
    const workspace = createAssetWorkspace()
    const work = deferred()
    const pending = workspace.run('edit', () => work.promise)
    workspace.cancel()
    work.reject(new Error('late'))
    await pending
    expect(workspace.getSnapshot()).toMatchObject({ pending: null, error: null })
    const initial = workspace.getSnapshot().current
    await workspace.run('generate', () => candidate('new'))
    const producer = vi.fn()
    expect(await workspace.run('texture', producer, initial)).toBe(false)
    expect(producer).not.toHaveBeenCalled()
  })

  it('does not let a delayed texture upload supersede newer pending work', async () => {
    const workspace = createAssetWorkspace()
    await workspace.run('generate', () => candidate('original'))
    const original = workspace.getSnapshot().current
    const edit = deferred()
    const pending = workspace.run('edit', () => edit.promise)
    const upload = vi.fn(() => candidate('upload'))
    expect(await workspace.run('texture', upload, original)).toBe(false)
    expect(upload).not.toHaveBeenCalled()
    expect(workspace.getSnapshot().pending).toBe('edit')
    edit.resolve(candidate('edited'))
    expect(await pending).toBe(true)
    workspace.deactivate()
  })

  it('holds resources until the preview and exporter release their leases', () => {
    const raw = candidate('asset').asset
    const owned = ownAsset(raw)
    const previewRelease = owned.retain()
    const exportRelease = owned.retain()
    owned.dispose()
    owned.dispose()
    previewRelease()
    previewRelease()
    expect(raw.dispose).not.toHaveBeenCalled()
    exportRelease()
    expect(raw.dispose).toHaveBeenCalledTimes(1)
    expect(() => owned.retain()).toThrow(/disposed/i)
  })

  it('releases previous ownership on replacement and rejects work after unmount', async () => {
    const workspace = createAssetWorkspace()
    const first = candidate('first')
    await workspace.run('generate', () => first)
    const release = workspace.getSnapshot().current.asset.retain()
    const work = deferred()
    const pending = workspace.run('edit', () => work.promise)
    workspace.deactivate()
    release()
    expect(first.asset.dispose).toHaveBeenCalledTimes(1)
    const stale = candidate('stale')
    work.resolve(stale)
    await pending
    expect(stale.asset.dispose).toHaveBeenCalledTimes(1)
    workspace.activate()
    expect(await workspace.run('generate', () => candidate('strict-mode-remount'))).toBe(true)
  })
})
