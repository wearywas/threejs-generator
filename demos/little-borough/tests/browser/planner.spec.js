import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { PLOTS } from '../../src/model.js';

const key = 'little-borough.city.v1';
const readCity = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

// Project the known ground grid through the documented initial view, then use real mouse input.
async function plotPoint(page, index) {
  const bounds = await page.locator('canvas').boundingBox();
  const aspect = bounds.width / bounds.height, hh = Math.max(49, 53 / aspect);
  const camera = new THREE.OrthographicCamera(-hh * aspect, hh * aspect, hh, -hh, .1, 400);
  camera.position.set(78,74,92); camera.lookAt(0,1,0); camera.updateMatrixWorld();
  const point = new THREE.Vector3(PLOTS[index].x, .17, PLOTS[index].z).project(camera);
  return { x: bounds.x + (point.x + 1) * bounds.width / 2, y: bounds.y + (1 - point.y) * bounds.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
});

test('real clicks grow and remove floors, preserve palette, undo, and survive reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const point = await plotPoint(page, 11);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#floor-count')).toHaveText('1');
  const first = (await readCity(page)).buildings['plot-11'];
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#floor-count')).toHaveText('2');
  expect((await readCity(page)).buildings['plot-11']).toEqual({ ...first, floors: 2 });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('#floor-count')).toHaveText('1');
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('#building-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#floor-count')).toHaveText('1');
  expect((await readCity(page)).buildings['plot-11']).toEqual(first);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#floor-count')).toHaveText('1');
  expect((await readCity(page)).buildings['plot-11']).toEqual(first);
  expect(errors).toEqual([]);
});

test('orbit, return-to-origin drag, Shift-pan, and right-drag never edit a plot', async ({ page }) => {
  for (const kind of ['orbit', 'pan', 'right']) {
    const point = await plotPoint(page, 11);
    if (kind === 'pan') await page.keyboard.down('Shift');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: kind === 'right' ? 'right' : 'left' });
    await page.mouse.move(point.x + 60, point.y - 20, { steps: 4 });
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.mouse.up({ button: kind === 'right' ? 'right' : 'left' });
    if (kind === 'pan') await page.keyboard.up('Shift');
    await expect(page.locator('#floor-count')).toHaveText('0');
    await page.getByRole('button', { name: 'Reset view' }).click();
  }
  // No settling delay: Reset view must restore picking before the next frame.
  const point = await plotPoint(page, 11);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#floor-count')).toHaveText('1');
});

test('keyboard controls respect the floor cap and undo rapid edits', async ({ page }) => {
  await page.getByLabel('Choose a plot').selectOption('plot-3');
  const add = page.getByRole('button', { name: 'Add floor to selected plot' });
  await add.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('Enter');
  await expect(page.locator('#floor-count')).toHaveText('10');
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: 'Remove floor from selected plot' }).click();
  await expect(page.locator('#floor-count')).toHaveText('9');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#floor-count')).toHaveText('10');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('mobile touch tools and reduced motion remain usable without overflow', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const point = await plotPoint(page, 11);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#floor-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Remove', exact: true }).tap();
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#floor-count')).toHaveText('0');
  await page.getByRole('button', { name: 'How to play' }).tap();
  await expect(page.locator('#help-panel')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const rail = await page.locator('.tool-rail').boundingBox();
  expect(rail.x).toBeGreaterThanOrEqual(0); expect(rail.x + rail.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: 'How to play' }).tap();
  for (const id of ['add-floor','subtract-floor','build-tool','remove-tool','undo','reset-view']) {
    const rect = await page.locator(`#${id}`).boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  }
  const title = await page.locator('.masthead').boundingBox(), actions = await page.locator('.top-actions').boundingBox();
  expect(title.y + title.height).toBeLessThanOrEqual(actions.y);
  await page.getByRole('button', { name: 'Reset view' }).tap();
  await context.close();
});
