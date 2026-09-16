import { test, expect } from '@playwright/test';

async function loadWithClock(page) {
  await page.clock.install({ time: new Date('2026-09-16T12:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Let’s snack' })).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-09-16T13:00:00Z'));
}

test('real keyboard input lifts, delivers, pauses, and starts a fresh round', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await loadWithClock(page);
  await expect(page.getByRole('button', { name: 'Let’s snack' })).toBeEnabled();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s snack' }).click();
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.down('Space');
  await page.clock.runFor(350);
  await expect(page.locator('#hint-text')).toContainText('Bring it to your mug');
  await page.keyboard.down('KeyW');
  // Slow frames also keep input deterministic on software-rendered CI browsers.
  for (let i = 0; i < 7; i++) await page.clock.fastForward(200);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  await page.clock.runFor(50);
  await expect(page.locator('#score')).toHaveText('100');
  await expect(page.locator('#saved')).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  const time = await page.locator('#time').textContent();
  await page.clock.runFor(1100);
  await expect(page.locator('#time')).toHaveText(time);
  await page.getByRole('button', { name: 'Back to the snacks', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh round' }).click();
  await page.clock.runFor(16);
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#saved')).toHaveText('0');
  await expect(page.locator('#time')).toHaveText('1:30');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  expect(errors).toEqual([]);
});

test('a complete round ends and replay resets; focus stays inside the result dialog', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 640, height: 480 });
  await loadWithClock(page);
  await page.getByRole('button', { name: 'Let’s snack' }).click();
  // Exercise real frames at a simulated 5 fps: no game-state injection or test hooks.
  for (let i = 0; i < 455; i++) await page.clock.fastForward(200);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ended');
  await expect(page.locator('#result-overlay')).toBeVisible();
  await expect(page.locator('#time')).toHaveText('0:00');
  await expect(page.locator('#replay-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#home-button')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#replay-button')).toBeFocused();
  await page.getByRole('button', { name: 'One more bite' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await page.clock.runFor(32);
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#saved')).toHaveText('0');
});

test('small-screen layout has reachable controls and touch beam picks up a snack', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s snack' }).click();
  const beam = page.locator('#touch-beam');
  await expect(beam).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fly up', exact: true })).toBeVisible();
  const bounds = await beam.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(page.locator('#hint-text')).toContainText('Bring it to your mug');
  await page.mouse.up();
  await expect(page.locator('#hint-text')).toContainText('Snack dropped');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-playing.png' });
});
