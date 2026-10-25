import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCpuPlay, chooseCpuBet } from '../game/ai.js';
import { estimateShowdown, betValue } from '../game/ai-betting.js';
import { createDeck, makeCandidates, judgeHand } from '../game/cards.js';
import { getBetOptions, applyBetAction } from '../game/betting.js';
import { chooseCpuPlay as legacyPlay } from '../scripts/strategy/legacy.js';

test('planning preserves a later solvable target instead of consuming the only useful cards', () => {
  const ids = new Set([
    '2-1',
    '13-0',
    '1-3',
    '13-2',
    '8-0',
    '1-0',
    '8-1',
    '11-0',
    '3-0',
    '2-3',
    '4-2',
    '10-2',
    '10-3',
  ]);
  const discard = createDeck().filter((card) => !ids.has(card.id));
  const targets = [37, 25];
  const before = structuredClone({ targets, discard });
  const greedy = legacyPlay(targets, [], discard, () => 0);
  assert.equal(makeCandidates(targets[1 - greedy.index], [...discard, ...greedy.hand]).length, 0);
  const planned = chooseCpuPlay(targets, [], discard, () => 0);
  assert.equal(judgeHand(planned.hand, planned.target, discard).valid, true);
  assert.ok(makeCandidates(targets[1 - planned.index], [...discard, ...planned.hand]).length > 0);
  assert.deepEqual({ targets, discard }, before);
});

test('extra strategy candidates remain legal and UI recommendation budget remains three', () => {
  const recommended = makeCandidates(35);
  const expanded = makeCandidates(35, [], 12);
  assert.equal(recommended.length, 3);
  assert.equal(expanded.length, 12);
  assert.deepEqual(expanded.slice(0, 3), recommended);
  for (const candidate of expanded) assert.equal(judgeHand(candidate.hand, 35).valid, true);
  for (const limit of [0, -1, 25, 1.5, NaN]) assert.throws(() => makeCandidates(35, [], limit));
});

test('calamity changes the value of an otherwise profitable call and costs use remaining reserve', () => {
  const options = { toCall: 1, potAfterCall: 6, reserve: 20 };
  const model = { win: 0.25, tie: 0, overlapLoss: 0 };
  assert.ok(betValue(model, options) > 0);
  assert.ok(betValue({ ...model, overlapLoss: 0.75 }, options) < 0);
  assert.ok(betValue(model, { ...options, toCall: 3 }) < 0);
  assert.equal(betValue({ win: 0, tie: 0, overlapLoss: 1 }, { ...options, reserve: 1 }), -1);
});

test('public candidate model is normalized, includes overlap loss, and reads only public information', () => {
  const hand = makeCandidates(24)[0].hand;
  const quiet = estimateShowdown(hand, 25, [], []);
  const pressure = estimateShowdown(hand, 25, [], [{ actor: 'player', raised: 3 }]);
  assert.ok(Math.abs(quiet.win + quiet.tie + quiet.lose - 1) < 1e-9);
  assert.ok(quiet.overlapLoss > 0 && quiet.overlapLoss <= quiet.lose);
  assert.ok(pressure.lose >= quiet.lose);
  assert.ok(quiet.samples <= 12);
  const base = {
    phase: 'bet',
    playerAir: 20,
    aiAir: 20,
    playerBet: 3,
    aiBet: 1,
    pot: 4,
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  };
  const input = {
    hand,
    opponentTarget: 25,
    discard: [],
    history: [],
    options: getBetOptions(base, 'ai'),
  };
  for (const secret of ['playerHand', 'playerTargets', 'candidates', 'playerFailed'])
    Object.defineProperty(input, secret, {
      get() {
        throw new Error('Hidden data read');
      },
    });
  const before = structuredClone(input);
  const decision = chooseCpuBet(input, () => 0);
  assert.ok(applyBetAction(base, 'ai', decision.action, decision.amount));
  assert.deepEqual(input, before);
});
