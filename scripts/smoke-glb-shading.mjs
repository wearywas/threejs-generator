// Real isolated runtime + GLB download, with no paid requests or user-library writes.
// Optional third CLI argument: a saved .js asset whose materials are all flat-shaded.
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const url = process.argv[2] || 'http://127.0.0.1:5173'
const sourcePath = process.argv[3]
const code = `function createAsset(THREE) {
  const root = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const flat = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({flatShading:true}), 2);
  flat.name = 'Flat';
  flat.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0));
  const smooth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  smooth.name = 'Smooth'; smooth.position.x = -3;
  root.add(flat, smooth);
  return { root };
}`

function inspectNormals(geometry) {
  const { position, normal } = geometry.attributes
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
  let triangles = 0, nonFlat = 0
  for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
    const ids = [0, 1, 2].map(offset => geometry.index ? geometry.index.getX(i + offset) : i + offset)
    a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2])
    c.sub(b).cross(a.sub(b))
    if (c.lengthSq() < 1e-12) continue
    c.normalize(); triangles++
    if (ids.some(id => n.fromBufferAttribute(normal, id).dot(c) < 0.99999)) nonFlat++
  }
  return { triangles, nonFlat }
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const context = await browser.newContext()
  await context.route('**/api/message', route => route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'shading.js', mimeType: 'text/javascript', buffer: sourcePath ? await readFile(sourcePath) : Buffer.from(code) })
  const button = page.getByRole('button', { name: 'Download GLB', exact: true })
  await expect(button).toBeEnabled()
  const downloading = page.waitForEvent('download')
  await button.click()
  const download = await downloading
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const bytes = Buffer.concat(chunks)
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  let meshes = 0, triangles = 0, nonFlat = 0
  scene.traverse(object => {
    if (!object.isMesh) return
    meshes++
    const normals = inspectNormals(object.geometry)
    triangles += normals.triangles * (object.isInstancedMesh ? object.count : 1)
    nonFlat += normals.nonFlat * (object.isInstancedMesh ? object.count : 1)
    if (sourcePath || object.name === 'Flat') expect(normals.nonFlat).toBe(0)
  })
  if (!sourcePath) {
    expect(meshes).toBe(2)
    expect(scene.getObjectByName('Flat').count).toBe(2)
    expect(inspectNormals(scene.getObjectByName('Smooth').geometry).nonFlat).toBeGreaterThan(0)
  }
  expect(meshes).toBeGreaterThan(0)
  await expect(button).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ test: sourcePath ? 'Imported all-flat asset GLB' : 'Isolated flat/smooth GLB', meshes, triangles, nonFlat, bytes: bytes.length }))
} finally { await browser.close() }
