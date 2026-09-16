import { describe, expect, it, vi } from 'vitest'
vi.mock('./isolated/client.js', () => import('../test/isolatedRuntime.js'))

import { executeCode, normalizeCreativeCode } from './CodeSandbox'

const CUBE_FN = `function createAsset(THREE, seed, textures, params, addons) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8899aa }))
  group.add(mesh)
  return { root: group }
}`

describe('normalizeCreativeCode', () => {
  it('returns already-clean code unchanged', () => {
    expect(normalizeCreativeCode(CUBE_FN)).toBe(CUBE_FN)
  })

  it('strips the Export Code header banner', () => {
    const exported = `// ThreeJS Generator - Creative Mode Asset\n// Required addon imports:\n\n${CUBE_FN}`
    expect(normalizeCreativeCode(exported)).toBe(CUBE_FN)
  })

  it('strips markdown code fences', () => {
    expect(normalizeCreativeCode('```javascript\n' + CUBE_FN + '\n```')).toBe(CUBE_FN)
  })

  it('returns null when no createAsset function is present', () => {
    expect(normalizeCreativeCode('{ "records": [] }')).toBe(null)
    expect(normalizeCreativeCode('')).toBe(null)
    expect(normalizeCreativeCode(null)).toBe(null)
  })
})

describe('executeCode', () => {
  it('executes a normalized exported file end-to-end', async () => {
    const exported = `// ThreeJS Generator - Creative Mode Asset\n// Required addon imports:\n\n${CUBE_FN}`
    const asset = await executeCode(normalizeCreativeCode(exported), { seed: 7 })

    expect(asset.root?.isObject3D).toBe(true)
    expect(asset.triangleCount).toBeGreaterThan(0)
    expect(typeof asset.dispose).toBe('function')
    asset.dispose()
  })

  it('rejects code without a createAsset entry point', async () => {
    await expect(executeCode('function makeThing() { return {} }')).rejects.toThrow(/createAsset/)
  })
})
