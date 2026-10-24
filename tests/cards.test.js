import assert from 'node:assert/strict';
import test from 'node:test';
import { card, makeHand, makeCandidates } from '../game/cards.js';
import { TARGET_SETS } from '../game/data.js';
import { compareHands, effectiveHand } from '../game/rules.js';

test('every target and candidate has five unique physical cards with the correct sum', () => {
  for (const target of TARGET_SETS.flat()) {
    for (const seed of [0, 1, 2]) {
      const hand = makeHand(target, seed);
      assert.equal(hand.length, 5);
      assert.equal(new Set(hand.map((card) => card.id)).size, 5, `${target}/${seed}`);
      assert.equal(
        hand.reduce((sum, card) => sum + card.value, 0),
        target,
      );
    }
  }
});

test('invalid target, rank, suit and seed are rejected instead of fabricated', () => {
  for (const args of [
    [0, 0],
    [14, 0],
    [1, 4],
    [1.5, 0],
  ])
    assert.throws(() => card(...args));
  assert.throws(() => makeHand(999));
  assert.throws(() => makeHand(24, -1));
});

test('recommendation orders candidates using effective cards after discards', () => {
  const discard = makeHand(24, 0);
  const candidates = makeCandidates(24, discard);
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(
      compareHands(
        effectiveHand(candidates[i - 1].hand, discard),
        effectiveHand(candidates[i].hand, discard),
      ) >= 0,
    );
  }
  assert.equal(candidates.at(-1).rank.key, 'noHand');
});
