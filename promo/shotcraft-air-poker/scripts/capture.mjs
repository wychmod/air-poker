import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = resolve(project, '..', '..');
const captures = resolve(project, 'public', 'captures');
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { makeFacts } = await import(pathToFileURL(resolve(repo, 'scripts/promo/prepare.js')).href);
await mkdir(captures, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const errors = [];
const elements = {};
const saved = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  let seed = 73;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});

const saveScreen = async (name, { fullPage = false } = {}) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  const file = `${name}.jpg`;
  const pageCssHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({
    path: resolve(captures, file),
    type: 'jpeg',
    quality: 94,
    fullPage,
    animations: 'disabled',
  });
  const bytes = await readFile(resolve(captures, file));
  saved.push({
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    dpr: 2,
    cssViewport: { width: 1920, height: 1080 },
    pageCssHeight,
    fullPage,
    scrollY: await page.evaluate(() => window.scrollY),
    pixelSize: { width: 3840, height: fullPage ? Math.ceil(pageCssHeight * 2) : 2160 },
  });
};

const saveElement = async (name, selector) => {
  const locator = page.locator(selector).first();
  if (!(await locator.count()) || !(await locator.isVisible())) return false;
  const box = await locator.boundingBox();
  const file = `${name}.png`;
  await locator.screenshot({ path: resolve(captures, file), animations: 'disabled' });
  const bytes = await readFile(resolve(captures, file));
  elements[name] = {
    selector,
    file,
    box,
    scrollY: await page.evaluate(() => window.scrollY),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
  return true;
};

const visible = async (selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const clickEnabled = async (selector) => {
  const node = page.locator(`${selector}:not([disabled])`).first();
  if (!(await node.count())) return false;
  await node.click({ timeout: 4000 });
  return true;
};
const waitForOne = async (selectors, max = 80) => {
  for (let i = 0; i < max; i++) {
    for (const selector of selectors) if (await visible(selector)) return selector;
    await page.waitForTimeout(100);
  }
  return null;
};

try {
  await page.goto('http://127.0.0.1:4180/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await saveScreen('home');
  await saveElement('home-hero', '.home-hero');
  await saveElement('home-wordmark', '.home-hero h1');

  const playbook = page.locator('[data-action="open-playbook"]').first();
  if (await playbook.count()) {
    await playbook.click();
    await page.waitForTimeout(120);
    await saveScreen('introduction');
  }
  const goHome = page.locator('[data-action="go-home"]').first();
  if (await goHome.count()) await goHome.click().catch(() => {});

  const enter = page.locator('[data-action="enter-match"]').first();
  if (!(await enter.count())) throw new Error('Home match entry button is missing');
  await enter.click();
  if (await visible('[data-action="skip-intro"]'))
    await page.locator('[data-action="skip-intro"]').click();

  let capturedTarget = false;
  let capturedHand = false;
  let capturedBet = false;
  let capturedShowdown = false;
  let capturedResult = false;
  let capturedReview = false;
  let terminal = false;

  for (let step = 0; step < 420; step++) {
    if (await visible('[data-action="choose-target"]')) {
      if (!capturedTarget) {
        await saveScreen('target');
        capturedTarget = true;
      }
      if (!(await clickEnabled('[data-action="choose-target"]'))) {
        await page.locator('[data-action="fail-hand"]').first().click();
        continue;
      }
      await clickEnabled('[data-action="confirm-target"]');
      continue;
    }

    if (await visible('[data-action="submit-hand"]')) {
      const candidates = page.locator('[data-action="select-candidate"]');
      if ((await candidates.count()) > 0) {
        await candidates.first().click();
        if (!capturedHand) {
          await saveScreen('hand');
          await saveElement('air-resources', '.battle-resources');
          await saveElement('hand-workbench', '.hand-workbench');
          await saveElement('five-card-hand', '[data-hand-draft]');
          await saveElement('target-pair', '.battle-targets');
          const handCards = page.locator('.hand-draft-card .battle-card');
          const count = await handCards.count();
          if (count !== 5) throw new Error(`Expected 5 real selected card cutouts, found ${count}`);
          for (let i = 0; i < count; i++) {
            const file = `hand-card-0${i + 1}.png`;
            const card = handCards.nth(i);
            const box = await card.boundingBox();
            await card.screenshot({ path: resolve(captures, file), animations: 'disabled' });
            const bytes = await readFile(resolve(captures, file));
            elements[`hand-card-0${i + 1}`] = {
              selector: '.hand-draft-card .battle-card',
              file,
              box,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              bytes: bytes.length,
            };
          }
          capturedHand = true;
        }
        await clickEnabled('[data-action="submit-hand"]');
      } else {
        await clickEnabled('[data-action="fail-hand"]');
      }
      continue;
    }

    if (await visible('[data-action="advance-round"]')) {
      if (!capturedShowdown) {
        await saveScreen('showdown');
        await saveElement('showdown-hands', '.battle-reveal');
        capturedShowdown = true;
      }
      await page.locator('[data-action="advance-round"]').click();
      continue;
    }

    if (await visible('[data-action="fast-forward"]')) {
      await page.locator('[data-action="fast-forward"]').click();
      continue;
    }

    if (await visible('.result-page')) {
      if (!capturedResult) {
        await saveScreen('result');
        await saveElement('result-heading', '.result-page h1');
        capturedResult = true;
      }
      const openRecord = page.locator('[data-action="open-record"]').first();
      if (await openRecord.count()) {
        await openRecord.click();
        await page.waitForTimeout(120);
        await saveScreen('review');
        await saveElement('review-ledger', '.record-page');
        await saveElement('review-totals', '.review-totals');
        capturedReview = true;
      }
      terminal = true;
      break;
    }

    if (await visible('[data-action="bet"]')) {
      const move = await waitForOne(
        [
          '[data-action="bet"][data-move="call"]:not([disabled])',
          '[data-action="bet"][data-move="check"]:not([disabled])',
          '[data-action="bet"][data-move="raise"]:not([disabled])',
        ],
        30,
      );
      if (!move) continue;
      if (!capturedBet) {
        await saveScreen('bet');
        await saveElement('bet-resources', '.battle-resources');
        await saveElement('bet-hands', '.battle-duel');
        await saveElement('hidden-opponent-hand', '.battle-hidden-hand');
        capturedBet = true;
      }
      if (move.includes('call')) await page.locator(move).first().click();
      else if (move.includes('check')) await page.locator(move).first().click();
      else await page.locator(move).first().click();
      continue;
    }

    await page.waitForTimeout(100);
  }

  if (!terminal) throw new Error('Did not reach and capture the match result');
  if (!capturedHand || !capturedBet || !capturedShowdown || !capturedReview)
    throw new Error(
      `Missing required states: hand=${capturedHand}, bet=${capturedBet}, showdown=${capturedShowdown}, review=${capturedReview}`,
    );
  if (errors.length) throw new Error(errors.join('\n'));

  const facts = makeFacts();
  await writeFile(resolve(captures, 'rule-facts.json'), JSON.stringify(facts, null, 2));
  await writeFile(
    resolve(captures, 'capture-manifest.json'),
    JSON.stringify(
      {
        captured: saved,
        elements,
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 2, pageCamPageHeightCss: 1080 },
        browser: browser.version(),
        seed: 73,
        matchMethod:
          'Fresh local match played through real data-action buttons; no injected engine state or local archive loaded.',
        provenance:
          'Illustrative local demo match; no visitor/customer/personal/live data. Rule illustration separately derived by game rule functions.',
        rulesProof: facts.source,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Captured ${saved.length} page states and ${Object.keys(elements).length} element crops.`,
  );
} finally {
  await browser.close();
}
