import { writeFile } from 'node:fs/promises'
import { test, expect, downloadBytes, glbTriangleCount } from './fixtures.js'

// Synthetic protocol results only: these exercise the production browser/Worker
// pipeline, not account authentication, model quality, or subscription billing.
const source = `function createAsset(THREE, seed, textures, params) {
  const root = new THREE.Group();
  const count = Math.max(1, Math.min(4, Math.round(params?.floorCount ?? 2)));
  const material = new THREE.MeshStandardMaterial({ color: '#c8ab75' });
  for (let i = 0; i < count; i++) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 2), material);
    floor.position.y = 0.4 + i;
    root.add(floor);
  }
  return { root };
}`
const schema = { floorCount: { type: 'integer', label: 'Floor count', min: 1, max: 4, default: 2 } }
const session = {
  csrfToken: 'synthetic-codex-csrf', provider: 'codex', providers: {
    openai: { model: 'gpt-6-astra', modelOverride: '', keySource: null },
    anthropic: { model: 'synthetic-anthropic', modelOverride: '', keySource: null },
    codex: {
      model: 'gpt-6-astra', modelOverride: '', connection: {
        state: 'connected', message: 'ChatGPT authentication detected.',
        models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra',
      },
    },
  },
}
const result = text => ({ provider: 'codex', model: 'gpt-6-astra', requestedModel: 'gpt-6-astra', text })
const exportSource = async page => (await downloadBytes(page, 'Download .js')).bytes.toString('utf8')

test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: session }))
})

test('Codex response uses real isolated controls, exports and saved-copy restoration', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const requests = []
  await page.route('**/api/message', route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(body).not.toHaveProperty('apiKey')
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    expect(['creative', 'convert']).toContain(body.task)
    return route.fulfill({ json: result(body.task === 'creative' ? source : JSON.stringify({ code: source, schema })) })
  })
  await page.goto('/')
  await page.getByLabel('Describe your asset', { exact: true }).fill('A small stacked building')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
  const initialTriangles = glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)
  await expect(page.getByRole('button', { name: 'AI Edit', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  const conversion = page.getByRole('dialog', { name: 'Add editable controls', exact: true })
  await conversion.getByLabel('What would you like to control? (optional)', { exact: true }).fill('Expose floor count from one to four.')
  await conversion.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  await expect(conversion).not.toBeVisible()
  const slider = page.getByRole('slider', { name: 'Floor count', exact: true })
  await expect(slider).toHaveValue('2')
  await expect(page.getByRole('button', { name: 'AI Edit', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toBeEnabled()
  expect(requests.map(body => body.task)).toEqual(['creative', 'convert'])
  expect(requests[1].messages.map(message => message.content).join('\n')).toContain('Expose floor count from one to four.')
  await slider.fill('4')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  const editedGLB = await downloadBytes(page, 'Download GLB')
  expect(glbTriangleCount(editedGLB.bytes)).toBe(initialTriangles * 2)
  await writeFile(testInfo.outputPath('synthetic-codex.glb'), editedGLB.bytes)
  const exported = await exportSource(page)
  const preset = JSON.parse(exported.match(/^export const assetPreset = JSON.parse\(String.raw`([^`]*?)`\);$/m)[1])
  expect(preset.params).toEqual({ floorCount: 4 })
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save to Library', exact: true })
  await save.getByLabel('Name', { exact: false }).fill('Codex synthetic building')
  await save.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await expect(save).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Discard recovery', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Load Codex synthetic building', exact: true }).click()
  await expect(slider).toHaveValue('4')
  expect(await exportSource(page)).toBe(exported)
  expect(glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)).toBe(initialTriangles * 2)
  expect(requests).toHaveLength(2)
})

test('Codex cancellation preserves the current asset and explains allowance use', async ({ page }) => {
  let requests = 0, held
  await page.route('**/api/message', route => {
    if (++requests === 1) return route.fulfill({ json: result(source) })
    held = route
  })
  await page.goto('/')
  const prompt = page.getByLabel('Describe your asset', { exact: true })
  await prompt.fill('A small stacked building')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
  const original = await exportSource(page)
  await prompt.fill('A second building')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => Boolean(held)).toBe(true)
  try {
    await expect(page.getByText(/additional requests.*Codex allowance/i)).toBeVisible()
    await expect(page.getByText(/additional requests can incur API charges/)).not.toBeVisible()
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled()
    expect(await exportSource(page)).toBe(original)
    glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)
    expect(requests).toBe(2)
  } finally { await held.abort().catch(() => {}) }
})

const textureSlots = [{ id: 'facade', label: 'Facade' }]
const textures = {}
const preset = { documentVersion: 1, mode: 'procedural', prompt: 'A small stacked building', seed: 731,
  schema, params: { floorCount: 3 }, textures, textureSlots }
const readPreset = text => JSON.parse(text.match(/^export const assetPreset = JSON.parse\(String.raw`([^`]*?)`\);$/m)[1])

async function loadPreset(page, code = source) {
  await page.goto('/')
  textures.facade = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 2, 2)
    return canvas.toDataURL('image/png')
  })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const saved = '// ThreeJS Generator asset v1\nexport const assetPreset = JSON.parse(String.raw`'
    + JSON.stringify(preset) + '`);\n// @threejs-generator-source\n' + code
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'saved-building.js', mimeType: 'text/javascript', buffer: Buffer.from(saved) })
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
}

async function beginEdit(page) {
  await expect(page.getByRole('button', { name: 'AI Edit', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'AI Edit', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Generative Edit', exact: true })
  await dialog.getByRole('textbox').fill('Make the facade purple. Keep my controls and textures.')
  await dialog.getByRole('button', { name: 'Apply Edit', exact: true }).click()
  return dialog
}

test('animation action remains available for static instances, empty callbacks and existing animation', async ({ page }) => {
  let requests = 0
  await page.route('**/api/message', route => { requests++; return route.abort() })
  const instanced = `function createAsset(THREE) {
    const root = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1);
    mesh.setMatrixAt(0, new THREE.Matrix4()); mesh.instanceMatrix.needsUpdate = true; root.add(mesh);
    return { root };
  }`
  await loadPreset(page, instanced)
  await expect(page.getByText('Static', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Asset code draft', exact: true }).fill(instanced.replace('return { root };', 'return { root, update: () => {} };'))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Re-run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toBeEnabled()
  const animated = source.replace('return { root };', 'return { root, update(t) { root.rotation.y = t; } };')
  // Replace through the normal source editor, still using the isolated execution path.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Asset code draft', exact: true }).fill(animated)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Re-run', exact: true }).click()
  await expect(page.getByText('Animated', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toBeEnabled()
  expect(requests).toBe(0)
})

test('Codex edit and animation preserve saved inputs through isolated execution, Library and exports', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const requests = []
  const edited = source.replace('#c8ab75', '#845fa8')
  const animated = edited.replace('return { root };', `root.name = 'Animated floors';
    return { root, update: (time, delta) => { root.position.y = Math.sin(time * params.speed) * 0.3; } };`)
  const animationSchema = { ...schema, speed: { type: 'number', label: 'Animation speed', min: 0.1, max: 2, default: 1 } }
  await page.route('**/api/message', route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(body).not.toHaveProperty('apiKey')
    expect(['edit', 'animate']).toContain(body.task)
    return route.fulfill({ json: result(JSON.stringify(body.task === 'edit'
      ? { code: edited, schema: null, textureSlots: null, changes: 'Purple facade.' }
      : { code: animated, schema: animationSchema, animationDescription: 'Gentle vertical motion.' })) })
  })
  await loadPreset(page)
  const edit = await beginEdit(page)
  await expect(edit).not.toBeVisible()
  const editedExport = await exportSource(page)
  expect(editedExport).toContain('#845fa8')
  expect(readPreset(editedExport)).toMatchObject(preset)
  await page.getByRole('button', { name: 'Add Animation', exact: true }).click()
  await expect(page.getByText('Animated', { exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Floor count', exact: true })).toHaveValue('3')
  await page.getByRole('slider', { name: 'Animation speed', exact: true }).fill('0.5')
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
  const exported = await exportSource(page)
  expect(readPreset(exported)).toMatchObject({ ...preset, schema: animationSchema, params: { floorCount: 3, speed: 0.5 } })
  expect(exported).toContain(animated)
  expect(requests.map(request => request.task)).toEqual(['edit', 'animate'])
  expect(requests[0].messages.map(message => message.content).join('\n')).toContain('Make the facade purple')
  expect(requests[1].messages.map(message => message.content).join('\n')).toContain(edited)
  const snapshot = async () => {
    const { bytes } = await downloadBytes(page, 'Download GLB')
    expect(glbTriangleCount(bytes)).toBe(36)
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
    expect(gltf.animations).toBeUndefined() // Callback animation is a static snapshot, not baked clips.
    return gltf.nodes.find(node => node.name === 'Animated floors')
  }
  const first = await snapshot()
  expect(first).toBeTruthy()
  await expect.poll(snapshot).not.toEqual(first)
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save to Library', exact: true })
  await save.getByLabel('Name', { exact: false }).fill('Codex edited animation')
  await save.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await expect(save).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Discard recovery', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Load Codex edited animation', exact: true }).click()
  await expect(page.getByText('Animated', { exact: true })).toBeVisible()
  expect(await exportSource(page)).toBe(exported)
  const restored = await snapshot()
  await expect.poll(snapshot).not.toEqual(restored)
  await page.getByLabel('Asset preview', { exact: true }).screenshot({ path: testInfo.outputPath('codex-edited-animation.png') })
  expect(requests).toHaveLength(2)
})

for (const task of ['edit', 'animate']) {
  for (const outcome of ['cancel', 'failure']) {
    test(`Codex ${task} ${outcome} preserves the current asset without a fallback or retry`, async ({ page }) => {
      let held, requests = 0
      await page.route('**/api/message', route => {
        requests++
        expect(route.request().postDataJSON().task).toBe(task)
        held = route
      })
      await loadPreset(page)
      const original = await exportSource(page)
      if (task === 'edit') await beginEdit(page)
      else await page.getByRole('button', { name: 'Add Animation', exact: true }).click()
      await expect.poll(() => Boolean(held)).toBe(true)
      try {
        if (outcome === 'cancel') {
          await page.getByRole('button', { name: task === 'edit' ? 'Cancel edit request' : 'Cancel request', exact: true }).click()
        } else {
          await held.fulfill({ status: 429, json: { code: 'rate_limit', error: 'Synthetic Codex allowance limit.', retryable: false } })
          held = null
          await expect(page.getByRole('alert')).toContainText('Synthetic Codex allowance limit.')
        }
        if (task === 'edit' && outcome === 'failure') await page.getByRole('button', { name: 'Close edit dialog', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
        expect(await exportSource(page)).toBe(original)
        expect(glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)).toBe(36)
        expect(requests).toBe(1)
      } finally { await held?.abort().catch(() => {}) }
    })
  }
}
