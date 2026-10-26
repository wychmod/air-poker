import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(response.status() + ' ' + response.url());
    });
    // Repeatable public deal, without replacing the engine or exposing its private state.
    await page.addInitScript(() => {
      let seed = 427;
      Math.random = () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    await use(page);
    expect(failures, 'No script, console or resource errors').toEqual([]);
  },
});
export { expect };

export async function startHand(page) {
  await page.goto('./');
  await page.locator('[data-action="enter-match"]').click();
  const skip = page.locator('[data-action="skip-intro"]');
  if (await skip.isVisible()) await skip.click();
  await page.locator('[data-action="choose-target"]:not(:disabled)').first().click();
  await page.locator('[data-action="confirm-target"]').click();
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', 'upper');
}

export async function fillRecommendation(page) {
  await page.locator('[data-action="select-candidate"]').first().click();
  await expect(page.locator('[data-hand-draft] [data-card-id]')).toHaveCount(5);
}

export async function completeMatch(page) {
  for (let step = 0; step < 70; step++) {
    if (
      ['victory', 'defeat', 'draw'].includes(await page.locator('body').getAttribute('data-scene'))
    )
      return;
    const phase = await page.locator('.battle').getAttribute('data-phase');
    if (phase === 'lower') {
      await page.locator('[data-action="choose-target"]:not(:disabled)').first().click();
      await page.locator('[data-action="confirm-target"]').click();
    } else if (phase === 'upper') {
      if (await page.locator('[data-action="select-candidate"]').count()) {
        await fillRecommendation(page);
        await page.locator('[data-action="submit-hand"]').click();
      } else await page.locator('[data-action="fail-hand"]').click();
    } else if (phase === 'bet') {
      await expect(page.locator('[data-action="bet"][data-move="fold"]')).toBeEnabled();
      await page.locator('[data-action="bet"][data-move="fold"]').click();
    } else if (phase === 'showdown') await page.locator('[data-action="advance-round"]').click();
    else if (phase === 'endurance') await page.locator('[data-action="fast-forward"]').click();
    else throw new Error('Unexpected phase: ' + phase);
  }
  throw new Error('The public UI did not reach a result within 70 steps');
}

export async function readArchive(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('air-poker-last-record-v1')));
}
