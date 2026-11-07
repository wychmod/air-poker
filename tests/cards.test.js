import assert from 'node:assert/strict';
import test from 'node:test';
import { card, createDeck, makeCandidates, makeRecommendations } from '../game/cards.js';
import { compareHands, rankHand } from '../game/rules.js';

function assertLegal(hand, target, discard = []) {
  assert.equal(hand.length, 5);
  assert.equal(new Set(hand.map((next) => next.id)).size, 5);
  assert.equal(
    hand.reduce((sum, next) => sum + next.value, 0),
    target,
  );
  assert.ok(hand.every((next) => !discard.some((used) => used.id === next.id)));
}

test('all 59 possible target sums produce distinct physical five-card recommendations', () => {
  assert.equal(new Set(createDeck().map((next) => next.id)).size, 52);
  for (let target = 6; target <= 64; target++) {
    const candidates = makeCandidates(target);
    assert.ok(candidates.length >= 1 && candidates.length <= 3);
    for (const { hand } of candidates) assertLegal(hand, target);
    assert.equal(
      new Set(
        candidates.map(({ hand }) =>
          hand
            .map((next) => next.id)
            .sort()
            .join(','),
        ),
      ).size,
      candidates.length,
    );
    for (let i = 1; i < candidates.length; i++)
      assert.ok(compareHands(candidates[i - 1].hand, candidates[i].hand) >= 0);
    const discard = candidates[0].hand;
    for (const { hand } of makeCandidates(target, discard)) assertLegal(hand, target, discard);
  }
  assert.equal(makeCandidates(47)[0].rank.key, 'royalFlush');
  assert.equal(makeCandidates(6)[0].rank.key, 'fourKind');
  assert.equal(makeCandidates(64)[0].rank.key, 'fourKind');
});

test('player recommendations offer distinct types with the original strongest hand first', () => {
  for (let target = 6; target <= 64; target++) {
    const recommendations = makeRecommendations(target);
    assert.ok(recommendations.length >= 1 && recommendations.length <= 3);
    assert.equal(
      new Set(recommendations.map((candidate) => candidate.rank.key)).size,
      recommendations.length,
    );
    assert.deepEqual(recommendations[0], makeCandidates(target, [], 1)[0]);
    for (const { hand } of recommendations) assertLegal(hand, target);
    for (let index = 1; index < recommendations.length; index++)
      assert.ok(compareHands(recommendations[index - 1].hand, recommendations[index].hand) > 0);
  }
  for (const [target, count] of [
    [6, 1],
    [7, 2],
    [63, 2],
    [64, 1],
  ])
    assert.equal(
      makeRecommendations(target).length,
      count,
      'suit variants do not fill empty slots',
    );
  assert.deepEqual(makeRecommendations(6, [card(1, 0)]), []);
  assert.deepEqual(makeRecommendations(35, createDeck()), []);
});

test('discarded extremes are unavailable, never partial or fabricated hands', () => {
  assert.deepEqual(makeCandidates(6, [card(1, 0)]), []);
  assert.deepEqual(makeCandidates(64, [card(13, 3)]), []);
  assert.deepEqual(makeCandidates(35, createDeck()), []);
  for (const args of [
    [0, 0],
    [14, 0],
    [1, 4],
    [1.5, 0],
  ])
    assert.throws(() => card(...args));
  for (const target of [5, 65, 24.5, NaN, '24']) assert.throws(() => makeCandidates(target));
});

test('best recommendation agrees with exhaustive physical hands on restricted decks', () => {
  const fixtures = [
    [
      card(1, 0),
      card(1, 1),
      card(1, 2),
      card(1, 3),
      card(2, 0),
      card(2, 1),
      card(3, 2),
      card(4, 3),
      card(5, 1),
      card(10, 0),
      card(13, 2),
    ],
    [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13].map((value) => card(value, 2)),
    [
      card(8, 0),
      card(8, 1),
      card(8, 2),
      card(9, 0),
      card(9, 3),
      card(10, 1),
      card(11, 2),
      card(12, 0),
      card(13, 1),
      card(1, 3),
    ],
  ];
  for (const available of fixtures) {
    const best = new Map();
    const types = new Map();
    function enumerate(hand, start) {
      if (hand.length === 5) {
        const sum = hand.reduce((total, next) => total + next.value, 0);
        if (!best.has(sum) || compareHands(hand, best.get(sum)) > 0) best.set(sum, hand);
        if (!types.has(sum)) types.set(sum, new Map());
        const key = rankHand(hand).key;
        const previous = types.get(sum).get(key);
        if (!previous || compareHands(hand, previous) > 0) types.get(sum).set(key, hand);
        return;
      }
      for (let i = start; i < available.length; i++) enumerate([...hand, available[i]], i + 1);
    }
    enumerate([], 0);
    const discard = createDeck().filter((next) => !available.some((other) => other.id === next.id));
    for (let target = 6; target <= 64; target++) {
      const recommended = makeCandidates(target, discard);
      if (!best.has(target)) assert.deepEqual(recommended, []);
      else {
        assertLegal(recommended[0].hand, target, discard);
        assert.equal(compareHands(recommended[0].hand, best.get(target)), 0);
      }
      const diverse = makeRecommendations(target, discard);
      const expected = [...(types.get(target)?.values() ?? [])]
        .sort((first, second) => compareHands(second, first))
        .slice(0, 3);
      assert.equal(diverse.length, expected.length);
      for (const [index, candidate] of diverse.entries()) {
        assertLegal(candidate.hand, target, discard);
        assert.equal(candidate.rank.key, rankHand(expected[index]).key);
        assert.equal(compareHands(candidate.hand, expected[index]), 0);
      }
    }
  }
});
