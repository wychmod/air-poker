import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBetAction, getBetOptions } from '../game/betting.js';
import { card, makeCandidates, createDeck } from '../game/cards.js';
import { dealTargets } from '../game/deal.js';
import { chooseCpuPlay, chooseCpuBet } from '../game/ai.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test('independent number cards have ten disjoint proof hands, with two cards left over', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { player, ai, leftovers } = dealTargets(seeded(seed));
    assert.equal(player.length, 5);
    assert.equal(ai.length, 5);
    for (const group of [...player, ...ai]) {
      assert.equal(group.proof.length, 5);
      assert.equal(
        group.target,
        group.proof.reduce((sum, next) => sum + next.value, 0),
      );
    }
    const all = [...player, ...ai].flatMap((group) => group.proof).concat(leftovers);
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map((next) => next.id)).size, 52);
  }
  assert.notDeepEqual(dealTargets(seeded(1)), dealTargets(seeded(2)));
  for (const bad of [() => 1, () => -1, () => NaN]) assert.throws(() => dealTargets(bad));
});

test('CPU chooses only its unused solvable positions, and reports no legal hand explicitly', () => {
  const targets = [6, 47, 64, 35, 25];
  const play = chooseCpuPlay(targets, [1], [], () => 0);
  assert.notEqual(play.index, 1);
  assert.equal(play.target, targets[play.index]);
  assert.equal(play.hand.length, 5);
  assert.equal(
    chooseCpuPlay(targets, [0, 1, 2, 3, 4], [], () => 0),
    null,
  );
  assert.equal(
    chooseCpuPlay(targets, [], createDeck(), () => 0),
    null,
  );
});

test('CPU responds with legal check, call, raise, fold and all-in using only allowed information', () => {
  const strong = makeCandidates(6)[0].hand;
  const weak = [2, 3, 7, 10, 13].map((rank, index) => card(rank, index % 4));
  const base = {
    phase: 'bet',
    playerAir: 24,
    aiAir: 24,
    playerBet: 1,
    aiBet: 1,
    pot: 2,
    betting: { turn: 'ai', turnId: 1, checks: 0, history: [] },
  };
  const cases = [
    { state: base, hand: strong, target: 64, roll: 0.99, expected: 'check' },
    { state: base, hand: strong, target: 64, roll: 0, expected: 'raise' },
    {
      state: { ...base, playerAir: 23, playerBet: 2, pot: 3 },
      hand: strong,
      target: 64,
      roll: 0.99,
      expected: 'call',
    },
    {
      state: { ...base, playerAir: 23, playerBet: 2, pot: 3 },
      hand: weak,
      target: 6,
      roll: 0.99,
      expected: 'fold',
    },
    { state: { ...base, aiAir: 1 }, hand: strong, target: 64, roll: 0, expected: 'all-in' },
  ];
  for (const { state, hand, target, roll, expected } of cases) {
    const information = {
      hand,
      opponentTarget: target,
      discard: [],
      options: getBetOptions(state, 'ai'),
      history: [],
    };
    for (const secret of ['playerHand', 'playerTargets', 'candidates'])
      Object.defineProperty(information, secret, {
        get() {
          throw Error('CPU accessed hidden ' + secret);
        },
      });
    const decision = chooseCpuBet(information, () => roll);
    assert.equal(decision.action, expected);
    assert.ok(applyBetAction(state, 'ai', decision.action, decision.amount));
  }
});
