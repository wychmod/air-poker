import { readFile } from 'node:fs/promises';
import { test, expect, startHand, completeMatch } from './helpers.js';
import { completedMatch } from '../tests/fixtures/completed-match.js';

async function openArchiveShare(page, record) {
  await page.addInitScript(
    (data) => localStorage.setItem('air-poker-last-record-v1', JSON.stringify(data)),
    record,
  );
  await page.goto('./');
  await page.locator('#pageContent [data-action="previous-record"]').click();
  await page.locator('#shareRecord').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
}

async function expectQrPixels(page, lang) {
  const result = await page.locator('#sharePreview').evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
    return {
      quietZone: pixel(816, 1177),
      finder: pixel(833, 1194),
      url: document.getElementById('shareLink').value,
    };
  });
  expect(result.quietZone).toEqual([255, 254, 248, 255]);
  expect(result.finder).toEqual([21, 26, 23, 255]);
  expect(result.url).toBe(
    'https://wychmod.github.io/air-poker/' + (lang === 'en' ? 'en.html' : ''),
  );
}

async function expectShareTextGeometry(page, record, lang) {
  const result = await page.evaluate(
    async ({ match, language }) => {
      const { shareSummary, shareImageSvg } = await import('./ui/share.js');
      const { modeSummary, contractResultFor, contractResultCopy } = await import('./ui/modes.js');
      const withMode = { ...match, mode: { opponent: 'hard', contract: 'perfect' } };
      const summary = modeSummary(withMode, language);
      const meta = {
        ...summary,
        contractResult: contractResultCopy(contractResultFor(withMode), language, summary.kind),
      };
      const svgText = shareImageSvg(shareSummary(match), language, meta);
      const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
      svg.style.cssText = 'position:fixed;left:-2000px;top:0;width:1080px;height:1440px';
      document.body.append(svg);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const boxes = [...svg.querySelectorAll('text')].map((node) => {
        const style = getComputedStyle(node);
        const anchor = node.getAttribute('text-anchor');
        context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(
          ' ',
        );
        context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
        context.textAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
        const value = node.textContent.trim();
        const metrics = context.measureText(value);
        const x = Number(node.getAttribute('x'));
        const y = Number(node.getAttribute('y'));
        const ink = {
          x: x - metrics.actualBoundingBoxLeft,
          y: y - metrics.actualBoundingBoxAscent,
          right: x + metrics.actualBoundingBoxRight,
          bottom: y + metrics.actualBoundingBoxDescent,
        };
        const matrix = node.getCTM();
        const corners = [
          [ink.x, ink.y],
          [ink.right, ink.y],
          [ink.x, ink.bottom],
          [ink.right, ink.bottom],
        ].map(([pointX, pointY]) => ({
          x: matrix.a * pointX + matrix.c * pointY + matrix.e,
          y: matrix.b * pointX + matrix.d * pointY + matrix.f,
        }));
        return {
          value: node.textContent.trim(),
          x: Math.min(...corners.map((corner) => corner.x)),
          y: Math.min(...corners.map((corner) => corner.y)),
          right: Math.max(...corners.map((corner) => corner.x)),
          bottom: Math.max(...corners.map((corner) => corner.y)),
        };
      });
      const outside = boxes.filter(
        (box) => box.x < 28 || box.y < 28 || box.right > 1052 || box.bottom > 1412,
      );
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (
            Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
          )
            overlaps.push([a.value, b.value]);
        }
      svg.remove();
      return { count: boxes.length, outside, overlaps };
    },
    { match: record, language: lang },
  );
  expect(result.count).toBeGreaterThan(20);
  expect(result.outside).toEqual([]);
  expect(result.overlaps).toEqual([]);
}

test('当前终局和旧归档可生成双语 PNG，快速换语言不会保存旧图', async ({ page }, testInfo) => {
  await startHand(page);
  await completeMatch(page);
  await page.locator('[data-action="share-result"]').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  const preview = page.locator('#sharePreview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1080);
  await expect(preview).toHaveJSProperty('naturalHeight', 1440);
  await page.locator('#shareDialog [data-lang="en"]').click();
  await page.locator('#shareDialog [data-lang="zh"]').click();
  await page.locator('#shareDialog [data-lang="en"]').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  await expect(page.locator('#shareLink')).toHaveValue(
    'https://wychmod.github.io/air-poker/en.html',
  );
  const downloaded = page.waitForEvent('download');
  await page.locator('#saveShareImage').click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/-en\.png$/);
  const output = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(output);
  const bytes = await readFile(output);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1440);
  await testInfo.attach('share-card-en', { path: output, contentType: 'image/png' });
  await page.locator('[data-action="close-share"]').click();
  await page.reload();
  await page.locator('#pageContent [data-action="previous-record"]').click();
  await page.locator('#shareRecord').click();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
});

test('胜利、失败、平局归档的中英战报可预览并下载', async ({ page }, testInfo) => {
  for (const outcome of ['player', 'ai', 'tie']) {
    const record = completedMatch(outcome);
    await page.goto('./');
    await page.evaluate((data) => {
      localStorage.setItem('air-poker-last-record-v1', JSON.stringify(data));
      localStorage.setItem('air-poker-lang', 'zh');
    }, record);
    await page.reload();
    await page.locator('#pageContent [data-action="previous-record"]').click();
    await page.locator('#shareRecord').click();
    for (const lang of ['zh', 'en']) {
      await page.locator('#shareDialog [data-lang="' + lang + '"]').click();
      await expect(page.locator('#saveShareImage')).toBeEnabled();
      await expectQrPixels(page, lang);
      await expectShareTextGeometry(page, record, lang);
      const downloaded = page.waitForEvent('download');
      await page.locator('#saveShareImage').click();
      const download = await downloaded;
      const output = testInfo.outputPath(outcome + '-' + lang + '.png');
      await download.saveAs(output);
      const png = await readFile(output);
      expect(png.readUInt32BE(16)).toBe(1080);
      expect(png.readUInt32BE(20)).toBe(1440);
      const name = { player: 'victory', ai: 'defeat', tie: 'draw' }[outcome];
      expect(download.suggestedFilename()).toBe('air-poker-' + name + '-' + lang + '.png');
      await testInfo.attach(outcome + '-' + lang, { path: output, contentType: 'image/png' });
    }
    await page.locator('[data-action="close-share"]').click();
    await page.locator('[data-action="close-record"]').click();
  }
});

test('分享和剪贴板不受支持或取消时仍可保存图片', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
  });
  await openArchiveShare(page, completedMatch('ai'));
  await expect(page.locator('#nativeShareImage')).toBeHidden();
  await page.locator('#copyShareLink').click();
  await expect(page.locator('#shareStatus')).toContainText('复制已选中的链接');
  await expect(page.locator('#shareLink')).toBeFocused();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
});

test('桌面只保留保存图片，系统分享按钮不出现', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-subpath',
    'Desktop-only expectation; phone projects assert the share button instead.',
  );
  await openArchiveShare(page, completedMatch('player'));
  await expect(page.locator('#nativeShareImage')).toBeHidden();
  await expect(page.locator('#saveShareImage')).toBeEnabled();
  await expect(page.locator('#shareStatus')).toContainText('保存图片即可分享');
});

test('系统分享只在点击后使用已生成 PNG；取消可恢复', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop-subpath',
    'Desktop hides the share button; its fallback is asserted in the desktop test.',
  );
  await page.addInitScript(() => {
    window.shareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.shareCalls.push({
          count: data.files?.length,
          type: data.files?.[0]?.type,
          bytes: data.files?.[0]?.size,
        });
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
  });
  await openArchiveShare(page, completedMatch('player'));
  expect(await page.evaluate(() => window.shareCalls)).toEqual([]);
  await expect(page.locator('#nativeShareImage')).toBeVisible();
  await page.locator('#nativeShareImage').click();
  await expect(page.locator('#shareStatus')).toContainText('已取消分享');
  const calls = await page.evaluate(() => window.shareCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].count).toBe(1);
  expect(calls[0].type).toBe('image/png');
  expect(calls[0].bytes).toBeGreaterThan(10000);
  await expect(page.locator('#saveShareImage')).toBeEnabled();
});

test('未完成局不提供分享，损坏归档不阻止开始', async ({ page }) => {
  await startHand(page);
  await page.locator('[data-action="open-record"]').click();
  await expect(page.locator('#shareRecord')).toBeDisabled();
  await page.evaluate(() => localStorage.setItem('air-poker-last-record-v1', '{broken'));
  await page.reload();
  await expect(page.locator('[data-action="enter-match"]')).toBeVisible();
  await expect(page.locator('#pageContent [data-action="previous-record"]')).toHaveCount(0);
});

test('分享元信息和两张封面在实际发布路径可加载，英文入口无需 JS 也有英文摘要', async ({
  page,
  request,
}) => {
  for (const [entry, lang] of [
    ['./', 'zh'],
    ['./en.html', 'en'],
  ]) {
    const response = await request.get(entry);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('cover-' + lang + '.png');
    expect(html).toContain(lang === 'en' ? 'Build a five-card hand.' : '数字构牌');
    await page.goto(entry);
    const url = 'https://wychmod.github.io/air-poker/' + (lang === 'en' ? 'en.html' : '');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      'content',
      lang === 'en' ? 'en_US' : 'zh_CN',
    );
    const cover = await request.get('./assets/share/cover-' + lang + '.png');
    expect(cover.ok()).toBe(true);
    const png = await cover.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
  await page.goto('./en.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Enter the match', exact: false })).toBeVisible();
});
test('图片生成失败保留链接，系统仅支持链接分享时正常降级', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop-subpath',
    'Link-only share needs the phone share button; desktop keeps the PNG download.',
  );
  await page.addInitScript(() => {
    window.linkShares = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.linkShares.push(data);
      },
    });
  });
  await openArchiveShare(page, completedMatch('player'));
  await page.locator('#nativeShareImage').click();
  await expect.poll(() => page.evaluate(() => window.linkShares.length)).toBe(1);
  const payload = await page.evaluate(() => window.linkShares[0]);
  expect(payload.url).toBe('https://wychmod.github.io/air-poker/');
  expect(payload.files).toBeUndefined();
  await page.locator('[data-action="close-share"]').click();
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
  });
  await page.locator('#shareRecord').click();
  await expect(page.locator('#shareStatus')).toContainText('图片暂时无法生成');
  await expect(page.locator('#saveShareImage')).toBeDisabled();
  await expect(page.locator('#shareLink')).toHaveValue('https://wychmod.github.io/air-poker/');
  await expect(page.locator('#copyShareLink')).toBeEnabled();
});
