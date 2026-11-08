import { test, expect } from './helpers.js';

// The selection accent is a static emphasis; forcing reduced motion keeps the
// transform stable so the assertion never catches a mid-transition value.
async function enterMatch(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('[data-action="enter-match"]').click();
  const skip = page.locator('[data-action="skip-intro"]');
  if (await skip.isVisible()) await skip.click();
}

test('selected number card is enlarged, tinted and readable', async ({ page }) => {
  await enterMatch(page);
  await page.locator('[data-action="choose-target"]:not(:disabled)').first().click();

  const selected = page.locator('.battle-number.is-selected');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveCSS('transform', /matrix\(1\.0[5-9]/);

  const styles = await page.evaluate(() => {
    const read = (node) => {
      const style = getComputedStyle(node);
      return {
        border: style.borderTopColor,
        color: getComputedStyle(node.querySelector('strong')).color,
        size: parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),
      };
    };
    return {
      selected: read(document.querySelector('.battle-number.is-selected')),
      other: read(document.querySelector('.battle-number:not(.is-selected)')),
    };
  });

  expect(styles.selected.size).toBeGreaterThan(styles.other.size);
  expect(styles.selected.color).not.toBe(styles.other.color);
  expect(styles.selected.border).not.toBe(styles.other.border);
});

test('revealed targets keep one accent per side without overlapping', async ({ page }) => {
  await enterMatch(page);
  await page.locator('[data-action="choose-target"]:not(:disabled)').first().click();
  await page.locator('[data-action="confirm-target"]').click();
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', 'upper');

  const plates = page.locator('.battle-target');
  await expect(plates).toHaveCount(2);
  await expect(plates.first()).toHaveAttribute('data-side', 'ai');
  await expect(plates.nth(1)).toHaveAttribute('data-side', 'player');

  const faces = await plates.evaluateAll((nodes) =>
    nodes.map((node) => ({
      color: getComputedStyle(node.querySelector('b')).color,
      border: getComputedStyle(node).borderTopColor,
      size: parseFloat(getComputedStyle(node.querySelector('b')).fontSize),
      box: (() => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom };
      })(),
    })),
  );

  expect(new Set(faces.map((face) => face.color)).size).toBe(2);
  expect(new Set(faces.map((face) => face.border)).size).toBe(2);
  for (const face of faces) expect(face.size).toBeGreaterThan(20);
  expect(faces[0].box.right).toBeLessThanOrEqual(faces[1].box.left);

  const headingTop = await page
    .locator('[data-phase-heading]')
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.max(...faces.map((face) => face.box.bottom))).toBeLessThanOrEqual(headingTop);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
