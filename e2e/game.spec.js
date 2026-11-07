import { readFile } from 'node:fs/promises';
import {
  test,
  expect,
  startHand,
  fillRecommendation,
  completeMatch,
  readArchive,
} from './helpers.js';
import { isCompletedRecord } from '../game/records.js';

test('手选、替换、推荐和切语言保留草稿与构造时限', async ({ page }) => {
  await page.clock.install();
  await startHand(page);
  await page.locator('[data-action="filter-hand-suit"][data-suit="0"]').click();
  for (const id of ['1-0', '2-0', '3-0']) await page.locator('#hand-card-' + id).click();
  await page.locator('#hand-draft-2-0').click();
  await page.locator('#hand-card-4-0').click();
  const ids = await page
    .locator('[data-hand-draft] [data-card-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.cardId));
  expect(ids).toEqual(['1-0', '3-0', '4-0']);
  await page.clock.fastForward(5000);
  const before = Number(await page.locator('#turnTimer').textContent());
  await page.locator('#siteHeader [data-lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    await page
      .locator('[data-hand-draft] [data-card-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.cardId)),
  ).toEqual(ids);
  expect(Number(await page.locator('#turnTimer').textContent())).toBeLessThanOrEqual(before);
  await page.locator('[data-action="open-rules"]').click();
  await page.clock.fastForward(5000);
  await page.locator('[data-action="close-rules"]').click();
  expect(Number(await page.locator('#turnTimer').textContent())).toBeLessThanOrEqual(before - 5);
  await fillRecommendation(page);
  await expect(page.locator('[data-hand-status]')).toContainText('Ready to lock');
  await page.locator('[data-action="submit-hand"]').click();
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', 'bet');
  await expect(page.locator('[data-pot]')).toHaveText('2');
});

test('合法加注、切语言与对手响应保持真实账户', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-26T00:00:01Z'));
  await startHand(page);
  await fillRecommendation(page);
  await page.locator('[data-action="submit-hand"]').click();
  const raise = page.locator('[data-action="bet"][data-move="raise"]');
  if (!(await raise.isEnabled())) await page.clock.runFor(650);
  await expect(raise).toBeEnabled();
  const reserve = Number(
    (await page.locator('[data-air="player"]').textContent()).replace('AIR', '').trim(),
  );
  const pot = Number(await page.locator('[data-pot]').textContent());
  await page.locator('#raiseAmount').fill('1');
  const paid = Number(await page.locator('[data-preview-payment]').textContent());
  await page.locator('#siteHeader [data-lang="en"]').click();
  await expect(page.locator('#raiseAmount')).toHaveValue('1');
  await raise.click();
  expect(
    Number((await page.locator('[data-air="player"]').textContent()).replace('AIR', '').trim()),
  ).toBe(reserve - paid);
  await expect(page.locator('[data-pot]')).toHaveText(String(pot + paid));
  await page.locator('[data-action="open-record"]').click();
  const pending = page.waitForEvent('download');
  await page.locator('#exportRecord').click();
  const download = await pending;
  const record = JSON.parse(await readFile(await download.path(), 'utf8'));
  const action = record.rounds.at(-1).actions.at(-1);
  expect(action).toMatchObject({ actor: 'player', action: 'raise', paid });
  expect(record.rounds.at(-1).attempts.at(-1).ai).toBeNull();
  await page.locator('[data-action="close-record"]').click();
  await page.clock.runFor(650);
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', /bet|showdown/);
});

test('五轮、终局复盘、刷新归档和重新开局不覆盖完成记录', async ({ page }) => {
  await startHand(page);
  await completeMatch(page);
  const record = await readArchive(page);
  expect(isCompletedRecord(record)).toBe(true);
  expect(record.result.completedRounds).toBe(5);
  expect(Object.values(record.accounts).reduce((a, b) => a + b, 0)).toBe(50);
  await page.locator('[data-action="open-record"]').click();
  await expect(page.locator('#recordDialog')).toBeVisible();
  await page.locator('[data-action="close-record"]').click();
  await page.reload();
  await page.locator('#pageContent [data-action="previous-record"]').click();
  await expect(page.locator('#recordContent')).toContainText('5 / 5');
  expect(await readArchive(page)).toEqual(record);
  await page.locator('[data-action="close-record"]').click();
  await page.locator('[data-action="enter-match"]').click();
  expect(await readArchive(page)).toEqual(record);
});

test('手动填满五张后切语言及滚动牌库，手机操作栏始终可见', async ({ page }, testInfo) => {
  await startHand(page);
  const ids = await page
    .locator('[data-action="select-candidate"]')
    .first()
    .locator('[data-card-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
  expect(ids).toHaveLength(5);
  for (const id of ids) {
    const card = page.locator('#hand-card-' + id);
    if (testInfo.project.name.startsWith('phone')) await card.tap();
    else await card.click();
  }
  await expect(page.locator('[data-action="submit-hand"]')).toBeEnabled();
  await expect(page.locator('[data-hand-status]')).toContainText('符合目标');
  for (const lang of ['zh', 'en']) {
    await page.locator('#siteHeader [data-lang="' + lang + '"]').click();
    await page.locator('#hand-card-13-3').scrollIntoViewIfNeeded();
    if (testInfo.project.name.startsWith('phone')) {
      const geometry = await page.locator('.hand-controls').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: innerHeight };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
      await expect(page.locator('#turnTimer')).toBeInViewport();
      await expect(page.locator('[data-action="submit-hand"]')).toBeInViewport();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  }
  await page.locator('[data-action="submit-hand"]').click();
  await expect(page.locator('.battle')).toHaveAttribute('data-phase', 'bet');
});

test('教学实际练习错误点数、已用牌与替换，不创建正式归档', async ({ page }) => {
  await page.goto('./');
  await page.locator('#pageContent [data-action="open-tutorial"]').click();
  await page.locator('[data-action="tutorial-target"][data-value="24"]').click();
  for (const id of ['4-0', '4-1', '4-2', '5-3', '8-0'])
    await page.locator('#hand-card-' + id).click();
  await expect(page.locator('[data-hand-status]')).toContainText('相差 1');
  await expect(page.locator('[data-action="tutorial-lock"]')).toBeDisabled();
  await page.locator('#hand-draft-8-0').click();
  await page.locator('#hand-card-7-1').click();
  await expect(page.locator('[data-hand-status]')).toContainText('已用实体牌');
  await expect(page.locator('[data-action="tutorial-lock"]')).toBeDisabled();
  await page.locator('#hand-draft-7-1').click();
  await page.locator('#hand-card-7-0').click();
  await expect(page.locator('[data-action="tutorial-lock"]')).toBeEnabled();
  await page.locator('[data-action="tutorial-lock"]').click();
  await expect(page.locator('.lesson-feedback')).toContainText('已锁定合法成手');
  expect(await readArchive(page)).toBeNull();
  await page.locator('[data-action="tutorial-next"]').click();
  await expect(page.locator('.tutorial-heading')).toContainText('02 / 04');
});

test('教学示例填入后可直接完成，提示与完成按钮状态一致', async ({ page }, testInfo) => {
  for (const lang of ['zh', 'en']) {
    for (const target of [24, 30]) {
      for (const index of [0, 1]) {
        await page.goto('./');
        await page.locator('#siteHeader [data-lang="' + lang + '"]').click();
        await page.locator('#pageContent [data-action="open-tutorial"]').click();
        await page.locator('[data-action="tutorial-target"][data-value="' + target + '"]').click();
        await page.locator('[data-action="tutorial-select"]').nth(index).click();
        const lock = page.locator('[data-action="tutorial-lock"]');
        const hint = page.locator('#tutorialLockHint');
        const status = page.locator('[data-hand-status]');
        await expect(status).toContainText(lang === 'zh' ? '可锁定' : 'Ready to lock');
        await expect(hint).toContainText(lang === 'zh' ? '条件已满足' : 'Ready to finish');
        await expect(lock).toBeEnabled();
        await expect(page.locator('.tutorial-exercise')).not.toContainText(
          lang === 'zh' ? '请先手动编辑' : 'Edit a card first',
        );
        await expect(lock).toHaveAttribute('aria-describedby', 'handDraftStatus tutorialLockHint');
        await expect(page.locator('.hand-library-help')).toContainText(
          lang === 'zh' ? '教学预设：7♥' : 'Practice setup: 7♥',
        );
        await lock.scrollIntoViewIfNeeded();
        await expect(hint).toBeInViewport();
        await expect(lock).toBeInViewport();
        if (target === 24 && index === 1)
          await page.screenshot({
            path: testInfo.outputPath('tutorial-example-ready-' + lang + '.png'),
          });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await lock.click();
        await expect(page.locator('.lesson-feedback')).toContainText(
          lang === 'zh' ? '点数和 ' + target : 'totaling ' + target,
        );
        expect(await readArchive(page)).toBeNull();
        await page.locator('[data-action="tutorial-next"]').click();
        await expect(page.locator('.tutorial-heading')).toContainText('02 / 04');
      }
    }
  }
});

test('教学目标30支持示例、切换目标和手动纠错后进入下一课', async ({ page }) => {
  for (const lang of ['zh', 'en']) {
    await page.goto('./');
    await page.locator('#siteHeader [data-lang="' + lang + '"]').click();
    await page.locator('#pageContent [data-action="open-tutorial"]').click();
    const target = (value) =>
      page.locator('[data-action="tutorial-target"][data-value="' + value + '"]');
    const examples = page.locator('[data-action="tutorial-select"]');
    const lock = page.locator('[data-action="tutorial-lock"]');
    await target(24).click();
    await examples.first().click();
    await target(30).click();
    await expect(target(30)).toHaveAttribute('aria-pressed', 'true');
    await expect(target(30)).toHaveClass(/is-selected/);
    await expect(target(24)).not.toHaveClass(/is-selected/);
    await expect(page.locator('[data-hand-draft] [data-card-id]')).toHaveCount(0);
    await expect(page.locator('.tutorial-practice-actions')).toContainText('0 / 30');
    for (const index of [0, 1]) {
      await examples.nth(index).click();
      await expect(page.locator('.tutorial-practice-actions')).toContainText('30 / 30');
      await expect(examples.nth(index)).toHaveAttribute('aria-pressed', 'true');
      await expect(lock).toBeEnabled();
    }
    await target(24).click();
    await expect(page.locator('[data-hand-draft] [data-card-id]')).toHaveCount(0);
    await target(30).click();
    for (const id of ['6-0', '6-1', '6-2', '5-3', '8-0'])
      await page.locator('#hand-card-' + id).click();
    await expect(page.locator('[data-hand-status]')).toContainText(
      lang === 'zh' ? '相差 1' : 'by 1',
    );
    await expect(lock).toBeDisabled();
    await page.locator('#hand-draft-8-0').click();
    await page.locator('#hand-card-7-1').click();
    await expect(page.locator('[data-hand-status]')).toContainText(
      lang === 'zh' ? '已用实体牌' : 'used physical',
    );
    await expect(lock).toBeDisabled();
    await page.locator('#hand-draft-7-1').click();
    await page.locator('#hand-card-7-0').click();
    await expect(page.locator('.tutorial-practice-actions')).toContainText('30 / 30');
    await expect(lock).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await lock.click();
    await expect(page.locator('.lesson-feedback')).toContainText(
      lang === 'zh' ? '点数和 30' : 'totaling 30',
    );
    expect(await readArchive(page)).toBeNull();
    await page.locator('[data-action="tutorial-next"]').click();
    await expect(page.locator('.tutorial-heading')).toContainText('02 / 04');
  }
});

test('介绍图示点击后仍能悬停重播，并保留键盘、触屏与静态模式', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await page.locator('#siteHeader [data-action="open-playbook"]').click();
  const risk = page.locator('#concept-risk-panel');
  await risk.click();
  await risk.hover();
  expect(
    await risk.evaluate((node) => {
      const animations = node.getAnimations({ subtree: true });
      animations.forEach((animation) => animation.finish());
      return animations.length;
    }),
  ).toBeGreaterThan(0);
  await page.mouse.move(1, 1);
  await expect(risk).toBeFocused();
  expect(await risk.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await risk.hover();
  expect(
    await risk.evaluate((node) =>
      node.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'),
    ),
  ).toBe(true);

  if (isMobile) {
    await risk.tap();
    const firstStart = await risk.evaluate(async (node) => {
      const animations = node.getAnimations({ subtree: true });
      await Promise.all(animations.map((animation) => animation.ready));
      const start = animations[0].startTime;
      animations.forEach((animation) => animation.finish());
      return start;
    });
    await risk.tap();
    expect(
      await risk.evaluate(async (node) => {
        const animations = node.getAnimations({ subtree: true });
        await Promise.all(animations.map((animation) => animation.ready));
        return animations[0].startTime;
      }),
    ).toBeGreaterThan(firstStart);
  }

  await page.mouse.move(1, 1);
  await page.locator('.source-video').focus();
  await expect(risk).not.toHaveAttribute('data-preview-active', '');
  for (const concept of ['hand', 'bet', 'risk']) {
    await page.keyboard.press('Tab');
    const panel = page.locator('#concept-' + concept + '-panel');
    await expect(panel).toBeFocused();
    expect(
      await panel.evaluate((node) => node.getAnimations({ subtree: true }).length),
    ).toBeGreaterThan(0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await risk.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
});
