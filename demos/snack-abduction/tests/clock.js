import { expect } from '@playwright/test';

export async function loadWithClock(page) {
  await page.clock.install({ time: new Date('2026-09-16T12:00:00Z') });
  // Freeze before navigation: loading, locators and input must not spend game time.
  await page.clock.pauseAt(new Date('2026-09-16T13:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Let’s snack' })).toBeEnabled();
  // Establish the real frame loop's previous timestamp while still on the title screen.
  await advanceFrames(page, 16);
}

export async function advanceFrames(page, milliseconds) {
  // Each public clock step runs the real game frame, including WebGL rendering.
  // Stay below the game's 250 ms catch-up cap; one large jump skips simulation.
  for (let remaining = milliseconds; remaining > 0; remaining -= 200) {
    await page.clock.fastForward(Math.min(remaining, 200));
  }
}
