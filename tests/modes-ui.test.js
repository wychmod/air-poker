import assert from 'node:assert/strict';
import test from 'node:test';
import { resultMarkup } from '../ui/pages.js';
import { comicRecapMarkup } from '../ui/recap.js';

const state = {
  phase: 'summary',
  winner: 'player',
  completedRounds: 2,
  maxRounds: 5,
  respiration: { elapsedMs: 321000 },
  accounting: { burned: 3 },
};

const settled = (winner = 'player') => ({
  number: 1,
  status: 'settled',
  settlement: { winner },
  actions: [],
  totals: {
    player: { net: winner === 'player' ? 2 : -2 },
    ai: { net: winner === 'player' ? -2 : 2 },
  },
});

const completedRecord = (overrides = {}) => ({
  status: 'completed',
  mode: { opponent: 'abyss', contract: 'no-fold' },
  result: {
    winner: 'player',
    completedRounds: 2,
    finalAir: { player: 12, ai: 0 },
  },
  rounds: [settled(), { ...settled(), number: 2 }],
  ...overrides,
});

test('victory shows the chosen persona and seals a completed contract', () => {
  const html = resultMarkup(state, {
    lang: 'zh',
    setup: { opponent: 'analyst', contract: 'none' },
    matchRecord: completedRecord(),
  });
  assert.match(html, /data-contract-result="no-fold"/);
  assert.match(html, /result-contract is-complete/);
  assert.match(html, /深渊/);
  assert.match(html, /达成/);
  assert.match(html, /comic-recap/);
  assert.match(html, /这一局，留下三格。/);
});

test('defeat reports a missed contract instead of a success stamp', () => {
  const record = completedRecord({
    mode: { opponent: 'mirror', contract: 'perfect' },
    result: { winner: 'ai', completedRounds: 2, finalAir: { player: 0, ai: 9 } },
    rounds: [settled('player'), settled('ai')],
  });
  const html = resultMarkup({ ...state, winner: 'ai' }, { lang: 'zh', matchRecord: record });
  assert.match(html, /data-contract-result="perfect"/);
  assert.match(html, /is-missed/);
  assert.match(html, /未达成/);
  assert.match(html, /镜像/);
  assert.match(html, /is-loss/);
});

test('a legacy record without a mode stays on the default match and claims no contract', () => {
  const html = resultMarkup(state, { lang: 'zh' });
  assert.equal(html.includes('result-contract'), false);
  assert.equal(html.includes('comic-recap'), false);
  assert.match(html, /精密/);
  assert.match(html, /无契约/);
});

test('the comic recap omits panels that have no recorded facts', () => {
  const recap = comicRecapMarkup(completedRecord({ rounds: [settled()] }), 'zh');
  assert.match(recap, /recap-final/);
  assert.equal((recap.match(/class="recap-panel/g) || []).length, 1);
  assert.equal(recap.includes('THE BIGGEST WAGER'), false);
  assert.equal(recap.includes('THE TURNING POINT'), false);
  assert.equal(comicRecapMarkup({ status: 'live' }, 'zh'), '');
});
