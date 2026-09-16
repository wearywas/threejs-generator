import { describe, expect, it, vi } from 'vitest'
import { ownAsset } from '../runtime/assetWorkspace'
import { captureSaveSnapshot, exportAssetGLB } from './assetCapture'

describe('save capture', () => {
  it('keeps the original document and runtime alive across an async capture', async () => {
    let finish
    const disposed = vi.fn()
    const asset = ownAsset({
      isIsolated: true,
      captureThumbnail: () => new Promise(resolve => { finish = resolve }),
      dispose: disposed,
    })
    let current = { document: Object.freeze({ code: 'original', seed: 12 }), asset }
    const capture = captureSaveSnapshot(current, null)
    asset.dispose()
    current = { document: { code: 'replacement', seed: 45 }, asset: null }
    expect(disposed).not.toHaveBeenCalled()
    finish('data:image/png;base64,original')
    expect(await capture).toEqual({ document: { code: 'original', seed: 12 }, thumbnail: 'data:image/png;base64,original' })
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('allows source saving when the runtime or thumbnail has failed', async () => {
    const asset = ownAsset({ isIsolated: true, captureThumbnail: async () => { throw new Error('Worker dead') } })
    const snapshot = await captureSaveSnapshot({ document: { code: 'recoverable source' }, asset }, null)
    expect(snapshot).toEqual({ document: { code: 'recoverable source' }, thumbnail: null })
  })

  it('passes the expected curated asset to the local preview capture', async () => {
    const asset = ownAsset({ root: {} })
    const preview = { captureThumbnail: vi.fn(async () => null) }
    await captureSaveSnapshot({ document: { mode: 'curated' }, asset }, preview)
    expect(preview.captureThumbnail).toHaveBeenCalledWith(256, 256, asset)
  })
})

describe('GLB export', () => {
  it('downloads isolated bytes as a GLB blob and retains until the download completes', async () => {
    const data = new ArrayBuffer(12)
    let finish
    const disposed = vi.fn()
    const asset = ownAsset({ isIsolated: true, exportGLB: () => new Promise(resolve => { finish = resolve }), dispose: disposed })
    const downloads = []
    const exported = exportAssetGLB(asset, 'tree', {
      download: async (blob, filename) => { downloads.push({ blob, filename }); expect(disposed).not.toHaveBeenCalled() },
      exportLocal: () => { throw new Error('Isolated exports must not use a root') },
    })
    asset.dispose()
    finish(data)
    await exported
    expect(downloads[0].filename).toBe('tree.glb')
    expect(downloads[0].blob.type).toBe('model/gltf-binary')
    expect(await downloads[0].blob.arrayBuffer()).toEqual(data)
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('releases a failed export and forwards curated roots to the existing exporter', async () => {
    const disposed = vi.fn()
    const asset = ownAsset({ isIsolated: true, exportGLB: async () => { throw new Error('Export failed') }, dispose: disposed })
    const exported = exportAssetGLB(asset, 'failed')
    asset.dispose()
    await expect(exported).rejects.toThrow('Export failed')
    expect(disposed).toHaveBeenCalledTimes(1)
    const root = {}
    const local = vi.fn(async () => {})
    await exportAssetGLB(ownAsset({ root }), 'curated', { exportLocal: local })
    expect(local).toHaveBeenCalledWith(root, 'curated')
  })
})
