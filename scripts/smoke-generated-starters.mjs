// Exercise shipped source only inside the app's isolated worker. No paid requests.
// Usage: node scripts/smoke-generated-starters.mjs [url] [--write-previews] [--details]
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
const writePreviews = process.argv.includes('--write-previews')
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = [], paidRequests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/message', route => { paidRequests.push(route.request().url()); return route.abort() })
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173')
  await page.waitForLoadState('networkidle')
  const cases = [
    ['park-apartments', {}],
    ['park-apartments', { floorCount: 1, scale: 0.25, windowOpacity: 0 }],
    ['park-apartments', { floorCount: 10, scale: 3, windowOpacity: 1 }],
    ['woodland-mushrooms', {}],
    ['woodland-mushrooms', { matureCount: 0, youngCount: 0, mossCount: 0, branchEnabled: false, logLength: 1.8, logRadius: 0.25 }],
    ['woodland-mushrooms', { matureCount: 10, youngCount: 8, mossCount: 72, logLength: 5.5, logRadius: 0.85, stemHeight: 1.8, capSize: 1.5 }],
    ['alpine-cottage', {}],
    ['alpine-cottage', { roofCourses: 1, railingCount: 2, chimneyEnabled: false, lanternEnabled: false, widthScale: 0.7, depthScale: 0.7, roofOverhang: 0.15 }],
    ['alpine-cottage', { roofCourses: 24, railingCount: 14, widthScale: 1.5, depthScale: 1.5, roofOverhang: 0.8 }],
  ]
  for (const [id, overrides] of cases) {
    const result = await page.evaluate(async ({ id, overrides, details }) => {
      const { loadGeneratedStarter } = await import('/src/services/generatedStarters.js')
      const { executeCode } = await import('/src/runtime/CodeSandbox.js')
      const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
      const THREE = await import('/node_modules/three/build/three.module.js')
      const record = await loadGeneratedStarter(id)
      const params = { ...record.params, ...overrides }
      const asset = await executeCode(record.code, { seed: record.seed, params, textures: record.textures, prompt: record.prompt, assetFamily: record.family, maxTriangles: 200000 })
      const canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
      try {
        await asset.attachView('starter-test', canvas, { width: 640, height: 480, pixelRatio: 1 })
        const png = await asset.captureThumbnail(512, 384)
        const detailImages = []
        if (details && id === 'park-apartments' && !Object.keys(overrides).length) {
          for (const position of [[4, 11, 14], [-5, 8, 13]]) {
            await asset.setCamera('starter-test', { position, target: [0, 11, 3.5] })
            // Allow a worker frame to reach the bitmap presentation canvas.
            await new Promise(resolve => setTimeout(resolve, 150))
            detailImages.push(canvas.toDataURL('image/png'))
          }
        }
        const glb = await asset.exportGLB()
        const { scene } = await new GLTFLoader().parseAsync(glb, '')
        scene.updateMatrixWorld(true)
        let meshes = 0, triangles = 0, nonFinite = 0
        const boxes = []
        const matrix = new THREE.Matrix4(), world = new THREE.Matrix4()
        scene.traverse(object => {
          if (!object.isMesh) return
          const geometry = object.geometry
          for (const attribute of Object.values(geometry.attributes)) {
            for (const value of attribute.array) if (!Number.isFinite(value)) nonFinite++
          }
          geometry.computeBoundingBox()
          for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
            if (object.isInstancedMesh) { object.getMatrixAt(i, matrix); world.multiplyMatrices(object.matrixWorld, matrix) }
            else world.copy(object.matrixWorld)
            const box = geometry.boundingBox.clone().applyMatrix4(world)
            boxes.push({ min: box.min.toArray(), max: box.max.toArray() })
            meshes++
            triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3
          }
        })
        // Regression for the apartment's repeated floor trim: its exposed face
        // must project beyond the wall face, not share a plane with the header.
        const clearances = []
        if (id === 'park-apartments') {
          const scale = params.scale
          const close = (a, b) => Math.abs(a - b) < 0.0001 * scale
          for (let floor = 0; floor < params.floorCount; floor++) {
            const top = 0.45 + 3 + floor * 2.7
            const trim = boxes.find(b => close((b.max[1] + b.min[1]) / 2, (top - 0.045) * scale)
              && close(b.max[1] - b.min[1], 0.17 * scale) && b.max[0] > 4.8 * scale && b.max[2] > 3.4 * scale)
            const header = boxes.find(b => close(b.max[1], top * scale) && close(b.min[1], (top - 0.35) * scale)
              && close(b.max[2], 3.51 * scale) && close(b.min[2], 3.29 * scale))
            if (!trim || !header) throw new Error(`Missing floor ${floor} trim/header in exported geometry`)
            clearances.push((trim.max[2] - header.max[2]) / scale)
          }
        }
        const bounds = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).toArray()
        const { disposeObject } = await import('/src/runtime/assetDisposal.js')
        disposeObject(scene)
        return { png, detailImages, meshes, triangles, nonFinite, clearances, bounds, bytes: glb.byteLength }
      } finally { asset.dispose(); canvas.remove() }
    }, { id, overrides, details: process.argv.includes('--details') })
    const { png, detailImages, ...metrics } = result
    console.log(JSON.stringify({ id, overrides, ...metrics }))
    if (writePreviews && !Object.keys(overrides).length) {
      await writeFile(new URL(`../public/starters/${id}.png`, import.meta.url), Buffer.from(png.split(',')[1], 'base64'))
    }
    for (const [index, data] of detailImages.entries()) {
      const target = path.join(tmpdir(), `${id}-detail-${index}.png`)
      await writeFile(target, Buffer.from(data.split(',')[1], 'base64'))
      console.log(target)
    }
    expect(result.meshes).toBeGreaterThan(0)
    expect(result.triangles).toBeGreaterThan(0)
    expect(result.nonFinite).toBe(0)
    expect(result.bounds.every(value => Number.isFinite(value) && value > 0)).toBe(true)
    for (const clearance of result.clearances) expect(clearance, 'Floor trim clearance in exported geometry').toBeGreaterThan(0.029)
  }
  expect(errors).toEqual([])
  expect(paidRequests).toEqual([])
} finally { await browser.close() }
