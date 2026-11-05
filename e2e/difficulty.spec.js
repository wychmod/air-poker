import { readFile } from 'node:fs/promises';
import { test, expect, startHand, completeMatch, readArchive } from './helpers.js';
import { completedMatch } from '../tests/fixtures/completed-match.js';

test('难度选择、自带目标、语言切换与旧偏好迁移', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('air-poker-opponent', 'abyss');
    localStorage.setItem('air-poker-contract', 'no-fold');
  });
  await page.goto('./');

  const choices = page.locator('[data-action="choose-difficulty"]');
  await expect(choices).toHaveCount(3);
  await expect(page.locator('[data-difficulty="medium"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('air-poker-difficulty'))).toBe('medium');
  await expect(page.locator('[data-action="toggle-challenges"]')).toHaveCount(0);
  await expect(page.locator('[data-action="choose-contract"]')).toHaveCount(0);
  await expect(page.locator('[data-difficulty="beginner"]')).toContainText('标准对局');
  await expect(page.locator('[data-difficulty="medium"]')).toContainText('逆风翻盘');
  await expect(page.locator('[data-difficulty="hard"]')).toContainText('全胜压制');

  await page.locator('[data-action="choose-difficulty"][data-difficulty="hard"]').click();
  await page.locator('#siteHeader [data-lang="en"]').click();
  await expect(page.locator('[data-difficulty="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-difficulty="hard"]')).toContainText('Clean sweep goal');
  await page.reload();
  await expect(page.locator('[data-difficulty="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-difficulty="hard"]')).toContainText('Clean sweep goal');
});

test('each difficulty starts and completes a recorded match with the same selected mode', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('desktop'),
    'Full match sweep runs in desktop project',
  );

  for (const difficulty of ['beginner', 'medium', 'hard']) {
    await page.goto('./');
    await page
      .locator(`[data-action="choose-difficulty"][data-difficulty="${difficulty}"]`)
      .click();
    await startHand(page);
    await completeMatch(page);

    await expect(page.locator('[data-result-mode]')).toHaveText(
      { beginner: '新手', medium: '中等', hard: '困难' }[difficulty],
    );
    const record = await readArchive(page);
    const goal = { beginner: 'none', medium: 'comeback', hard: 'perfect' }[difficulty];
    expect(record.mode).toMatchObject({ opponent: difficulty, contract: goal });

    await page.locator('[data-action="open-record"]').click();
    await expect(page.locator('#recordContent')).toContainText(difficulty.toUpperCase());
    const jsonDownload = page.waitForEvent('download');
    await page.locator('#exportRecord').click();
    const downloadedJson = await jsonDownload;
    const parsed = JSON.parse(await readFile(await downloadedJson.path(), 'utf8'));
    expect(parsed.mode).toMatchObject({ opponent: difficulty, contract: goal });
    await page.locator('[data-action="close-record"]').click();

    await page.locator('[data-action="share-result"]').click();
    await expect(page.locator('#sharePreview')).toHaveJSProperty('naturalWidth', 1080);
    const pngDownload = page.waitForEvent('download');
    await page.locator('#saveShareImage').click();
    const downloadedPng = await pngDownload;
    const png = await readFile(await downloadedPng.path());
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1440);
    await page.locator('[data-action="close-share"]').click();
  }
});

test('a prior persona archive keeps its old identity after selecting a new difficulty', async ({
  page,
}) => {
  const record = completedMatch('player');
  record.mode = { opponent: 'abyss', contract: 'no-fold' };
  await page.addInitScript((data) => {
    localStorage.setItem('air-poker-last-record-v1', JSON.stringify(data));
    localStorage.setItem('air-poker-difficulty', 'hard');
  }, record);
  await page.goto('./');
  await page.locator('#pageContent [data-action="previous-record"]').click();
  await expect(page.locator('#recordContent')).toContainText('THE ABYSS');
  await expect(page.locator('#recordContent')).not.toContainText('HARD');

  const jsonDownload = page.waitForEvent('download');
  await page.locator('#exportRecord').click();
  const downloadedJson = await jsonDownload;
  const parsed = JSON.parse(await readFile(await downloadedJson.path(), 'utf8'));
  expect(parsed.mode).toEqual({ opponent: 'abyss', contract: 'no-fold' });
});
