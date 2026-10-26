import { test, expect, completeMatch, readArchive } from './helpers.js';
import { completedMatch } from '../tests/fixtures/completed-match.js';
import { isCompletedRecord } from '../game/records.js';

const languageButton = (page, lang) => page.locator('#siteHeader [data-lang="' + lang + '"]');

test('语言偏好在中英文入口刷新后保持，入口只提供默认语言', async ({ page }) => {
  for (const [entry, initial] of [
    ['./en.html', 'en'],
    ['./index.html', 'zh'],
  ]) {
    await page.goto('./');
    await page.evaluate(() => localStorage.removeItem('air-poker-lang'));
    await page.goto(entry);
    await expect(languageButton(page, initial)).toHaveAttribute('aria-pressed', 'true');
    for (const lang of initial === 'en' ? ['zh', 'en'] : ['en', 'zh']) {
      await languageButton(page, lang).click();
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
      await page.reload();
      await expect(languageButton(page, lang)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('air-poker-lang'))).toBe(lang);
    }
    await page.evaluate(() => localStorage.setItem('air-poker-lang', 'invalid'));
    await page.reload();
    await expect(languageButton(page, initial)).toHaveAttribute('aria-pressed', 'true');
  }
});

test('语言存储不可用时使用入口默认语言，当次仍可切换', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem'])
      Storage.prototype[name] = () => {
        throw new DOMException('Denied', 'SecurityError');
      };
  });
  await page.goto('./en.html');
  await expect(languageButton(page, 'en')).toHaveAttribute('aria-pressed', 'true');
  await languageButton(page, 'zh').click();
  await expect(languageButton(page, 'zh')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./index.html');
  await expect(languageButton(page, 'zh')).toHaveAttribute('aria-pressed', 'true');
});

for (const missing of ['randomUUID', 'crypto']) {
  test('缺少 ' + missing + ' 时仍能开局、完成归档并重新开始', async ({ page }) => {
    await page.addInitScript((name) => {
      Object.defineProperty(name === 'crypto' ? window : window.crypto, name, {
        configurable: true,
        value: undefined,
      });
    }, missing);
    await page.goto('./');
    await page.locator('[data-action="enter-match"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-scene', /intro|game/);
    const skip = page.locator('[data-action="skip-intro"]');
    if (await skip.isVisible()) await skip.click();
    await completeMatch(page);
    const record = await readArchive(page);
    expect(isCompletedRecord(record)).toBe(true);
    expect(record.matchId).toMatch(/^r-/);
    await page.locator('[data-action="enter-match"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-scene', /intro|game/);
    expect(await readArchive(page)).toEqual(record);
  });
}

test('教学示例选中反馈跟随草稿，手动编辑和清空会取消选中', async ({ page }) => {
  await page.goto('./');
  await page.locator('#pageContent [data-action="open-tutorial"]').click();
  await page.locator('[data-action="tutorial-target"][data-value="24"]').click();
  const examples = page.locator('[data-action="tutorial-select"]');
  for (const index of [0, 1]) {
    await examples.nth(index).click();
    await expect(page.locator('[data-hand-draft] [data-card-id]')).toHaveCount(5);
    await expect(examples.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(examples.nth(index)).toHaveClass(/is-selected/);
    await expect(examples.nth(1 - index)).toHaveAttribute('aria-pressed', 'false');
  }
  await page.locator('[data-action="tutorial-filter-hand-suit"][data-suit="0"]').click();
  await expect(examples.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await languageButton(page, 'en').click();
  await expect(examples.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#hand-draft-8-0').click();
  await expect(page.locator('[data-action="tutorial-select"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('.lesson-candidate.is-selected')).toHaveCount(0);
  await examples.first().click();
  await page.locator('[data-action="tutorial-clear-hand"]').click();
  await expect(page.locator('[data-action="tutorial-select"][aria-pressed="true"]')).toHaveCount(0);
});

async function openShare(page) {
  await page.addInitScript(
    (record) => localStorage.setItem('air-poker-last-record-v1', JSON.stringify(record)),
    completedMatch('player'),
  );
  await page.goto('./');
  await page.locator('#pageContent [data-action="previous-record"]').click();
  await page.locator('#shareRecord').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  await expect(page.locator('#sharePreview')).toHaveJSProperty('complete', true);
}

async function holdPngCompletion(page) {
  await page.evaluate(() => {
    window.reviewPngJobs = [];
    window.reviewOriginalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      window.reviewOriginalToBlob.call(
        this,
        (blob) => window.reviewPngJobs.push(() => callback(blob)),
        ...args,
      );
    };
    window.reviewHiddenFrames = 0;
    const preview = document.getElementById('sharePreview');
    window.reviewObserver = new MutationObserver(() => {
      if (preview.hidden || !preview.getAttribute('src')) window.reviewHiddenFrames++;
    });
    window.reviewObserver.observe(preview, {
      attributes: true,
      attributeFilter: ['hidden', 'src'],
    });
  });
}

test('分享切语言保持旧预览，乱序完成不会覆盖新图，关闭后不会复活', async ({ page }, testInfo) => {
  await openShare(page);
  const preview = page.locator('#sharePreview');
  const original = await preview.getAttribute('src');
  await holdPngCompletion(page);
  await page.locator('#shareDialog [data-lang="en"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewPngJobs.length)).toBe(1);
  await expect(preview).toHaveAttribute('src', original);
  await expect(preview).toHaveJSProperty('hidden', false);
  await expect(page.locator('#saveShareImage')).toBeDisabled();
  await expect(page.locator('#nativeShareImage')).toBeDisabled();
  await preview.screenshot({ path: testInfo.outputPath('preview-during-language-change.png') });
  await page.locator('#shareDialog [data-lang="zh"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewPngJobs.length)).toBe(2);
  await page.evaluate(() => window.reviewPngJobs.splice(1, 1)[0]());
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  await expect(preview).not.toHaveAttribute('src', original);
  const newest = await preview.getAttribute('src');
  await page.evaluate(async () => {
    window.reviewPngJobs.shift()();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(preview).toHaveAttribute('src', newest);
  expect(await page.evaluate(() => window.reviewHiddenFrames)).toBe(0);
  const pendingDownload = page.waitForEvent('download');
  await page.locator('#saveShareImage').click();
  expect((await pendingDownload).suggestedFilename()).toMatch(/-zh\.png$/);
  await page.locator('#shareDialog [data-lang="en"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewPngJobs.length)).toBe(1);
  await page.locator('[data-action="close-share"]').click();
  await expect(preview).not.toHaveAttribute('src');
  await page.evaluate(async () => {
    window.reviewPngJobs.shift()();
    HTMLCanvasElement.prototype.toBlob = window.reviewOriginalToBlob;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(preview).not.toHaveAttribute('src');
  await expect(page.locator('#saveShareImage')).toBeDisabled();
  await page.locator('#shareRecord').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  await expect(preview).toHaveJSProperty('naturalWidth', 1080);
});

test('分享更新失败保留旧预览并说明状态，不允许保存过时语言', async ({ page }) => {
  await openShare(page);
  const preview = page.locator('#sharePreview');
  const original = await preview.getAttribute('src');
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
  });
  await page.locator('#shareDialog [data-lang="en"]').click();
  await expect(page.locator('#shareStatus')).toContainText('previous language');
  await expect(preview).toHaveAttribute('src', original);
  await expect(preview).toHaveJSProperty('hidden', false);
  await expect(page.locator('#saveShareImage')).toBeDisabled();
  await expect(page.locator('#nativeShareImage')).toBeDisabled();
  await expect(page.locator('#shareLink')).toHaveValue(
    'https://wychmod.github.io/air-poker/en.html',
  );
  await expect(page.locator('#copyShareLink')).toBeEnabled();
});
