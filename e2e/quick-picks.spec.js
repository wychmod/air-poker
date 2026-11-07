import { expect, test } from '@playwright/test';
import { startHand } from './helpers.js';

test('快速推荐展示三种不同牌型，每项均能填入、编辑并锁定', async ({ page }, testInfo) => {
  await startHand(page);
  const recommendations = page.locator('[data-action="select-candidate"]');
  await expect(recommendations).toHaveCount(3);
  for (const lang of ['zh', 'en']) {
    await page.locator('#siteHeader [data-lang="' + lang + '"]').click();
    const labels = await recommendations.locator('.battle-candidate-head strong').allTextContents();
    expect(new Set(labels).size).toBe(3);
    await expect(page.locator('.hand-recommendations-heading')).toContainText(
      lang === 'zh' ? '三种不同牌型' : 'three different hand types',
    );
    for (let index = 0; index < 3; index++) {
      const recommendation = recommendations.nth(index);
      const ids = await recommendation
        .locator('[data-card-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      await recommendation.click();
      await expect(recommendation).toHaveAttribute('aria-pressed', 'true');
      const draft = page.locator('[data-hand-draft] [data-card-id]');
      expect(await draft.evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId))).toEqual(
        ids,
      );
      await expect(page.locator('[data-action="submit-hand"]')).toBeEnabled();
      await page.locator('#hand-draft-' + ids[4]).click();
      await expect(draft).toHaveCount(4);
      await expect(page.locator('[data-action="submit-hand"]')).toBeDisabled();
      await page.locator('#hand-card-' + ids[4]).click();
      await expect(draft).toHaveCount(5);
      await expect(page.locator('[data-action="submit-hand"]')).toBeEnabled();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.locator('.hand-recommendations').screenshot({
      path: testInfo.outputPath('quick-picks-' + lang + '.png'),
    });
  }
  await page.locator('[data-action="submit-hand"]').click();
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', 'bet');
});
