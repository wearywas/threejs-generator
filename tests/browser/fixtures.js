import { test as base, expect } from '@playwright/test'
import { collectGraphicsDiagnostics } from '../helpers/graphicsDiagnostics.js'

// A browser context isolates storage, but not Chromium's graphics process.
// Windows CI can opt into process isolation without changing app deadlines,
// scene quality, or any test's multi-tab/reload behavior.
const processIsolation = process.env.THREEJS_ISOLATED_BROWSER === '1' ? {
  context: async ({ playwright, browserName, launchOptions, headless, channel, contextOptions, baseURL, viewport, storageState, acceptDownloads }, use, testInfo) => {
    const browser = await playwright[browserName].launch({ ...launchOptions, headless, channel })
    try {
      await collectGraphicsDiagnostics(browser, testInfo)
      const context = await browser.newContext({ ...contextOptions, baseURL, viewport, storageState, acceptDownloads })
      await use(context)
    } finally { await browser.close() }
  },
} : {}

export const test = base.extend({
  ...processIsolation,
  localOnly: [async ({ context, baseURL }, use) => {
    const external = [], errors = []
    const origin = new URL(baseURL).origin
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
    // Playwright's serviceWorkers:'block' init script throws in our opaque-origin
    // sandbox. Fresh contexts have no workers; assert the app registers none.
    context.on('serviceworker', worker => errors.push(`Unexpected service worker: ${worker.url()}`))
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push(route.request().url())
        return route.abort()
      }
      return route.fallback()
    })
    await use()
    expect(external, 'The built app must work without external browser resources').toEqual([])
    expect(errors, 'Unhandled browser errors').toEqual([])
  }, { auto: true }],
})
export { expect }

export async function downloadBytes(page, name) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const download = await event
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) }
}

// Count triangles actually placed in the exported scene, including instances.
// This deliberately reads glTF data without executing the generated factory.
export function glbTriangleCount(bytes, nodes) {
  expect(bytes.subarray(0, 4).toString()).toBe('glTF')
  expect(bytes.readUInt32LE(8)).toBe(bytes.length)
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  const countNode = index => {
    const node = gltf.nodes[index]
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes
    const instances = attributes ? gltf.accessors[Object.values(attributes)[0]].count : 1
    const triangles = node.mesh === undefined ? 0 : gltf.meshes[node.mesh].primitives
      .filter(primitive => primitive.mode === undefined || primitive.mode === 4)
      .reduce((sum, primitive) => sum + gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0)
    return triangles * instances + (node.children || []).reduce((sum, child) => sum + countNode(child), 0)
  }
  const count = (nodes || gltf.scenes[gltf.scene ?? 0].nodes).reduce((sum, node) => sum + countNode(node), 0)
  expect(count).toBeGreaterThan(0)
  return count
}
