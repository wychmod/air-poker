import assert from 'node:assert/strict';
import test from 'node:test';
import { card } from '../game/cards.js';
import { rankHand, compareHands, settleBets } from '../game/rules.js';

const hand = (values, suits = [0, 1, 2, 3, 0]) =>
  values.map((value, index) => card(value, suits[index]));

test('wheel is five-high; broadway is ace-high; only AKQJ10 is royal', () => {
  const wheel = hand([1, 2, 3, 4, 5], [0, 0, 0, 0, 0]);
  const royal = hand([1, 10, 11, 12, 13], [1, 1, 1, 1, 1]);
  assert.equal(rankHand(wheel).key, 'straightFlush');
  assert.deepEqual(rankHand(wheel).tie, [5]);
  assert.equal(rankHand(royal).key, 'royalFlush');
  assert.ok(compareHands(royal, wheel) > 0);
  assert.ok(compareHands(hand([1, 10, 11, 12, 13]), hand([9, 10, 11, 12, 13])) > 0);
});

test('aces compare high in pairs and kickers, with all kickers compared', () => {
  assert.ok(compareHands(hand([1, 1, 2, 3, 4]), hand([13, 13, 10, 9, 8])) > 0);
  assert.ok(compareHands(hand([8, 8, 1, 4, 3]), hand([8, 8, 13, 12, 11])) > 0);
  assert.ok(compareHands(hand([8, 8, 13, 5, 4]), hand([8, 8, 13, 5, 3])) > 0);
  assert.equal(compareHands(hand([8, 8, 13, 5, 4]), hand([8, 8, 13, 5, 4], [1, 2, 3, 0, 1])), 0);
});

test('standard hand categories are ordered correctly', () => {
  const hands = [
    hand([2, 4, 7, 9, 11]),
    hand([2, 2, 7, 9, 11]),
    hand([2, 2, 7, 7, 11]),
    hand([2, 2, 2, 9, 11]),
    hand([2, 3, 4, 5, 6]),
    hand([2, 4, 7, 9, 11], [0, 0, 0, 0, 0]),
    hand([2, 2, 2, 9, 9]),
    hand([2, 2, 2, 2, 11]),
    hand([2, 3, 4, 5, 6], [0, 0, 0, 0, 0]),
  ];
  hands.forEach((cards, index) => {
    assert.equal(rankHand(cards).category, index);
    if (index) assert.ok(compareHands(cards, hands[index - 1]) > 0);
  });
});

test('only five distinct physical cards receive a poker rank', () => {
  const cards = hand([1, 2, 3, 4, 5], [0, 0, 0, 0, 0]);
  assert.equal(rankHand(cards).key, 'straightFlush');
  assert.equal(rankHand(cards.slice(0, 4)).key, 'noHand');
  assert.equal(rankHand([...cards.slice(0, 4), cards[0]]).key, 'noHand');
  assert.deepEqual(rankHand([]), { key: 'noHand', category: -1, tie: [], score: -100 });
  assert.ok(compareHands(cards, cards.slice(0, 4)) > 0);
});

test('settlement conserves air except for the losing stake burned by calamity', () => {
  const bets = { playerAir: 20, aiAir: 20, playerBet: 5, aiBet: 5 };
  assert.deepEqual(settleBets({ ...bets, winner: 'player', calamity: false }), {
    playerAir: 30,
    aiAir: 20,
    burned: 0,
  });
  assert.deepEqual(settleBets({ ...bets, winner: 'ai', calamity: true }), {
    playerAir: 15,
    aiAir: 30,
    burned: 5,
  });
  assert.deepEqual(settleBets({ ...bets, winner: 'tie', calamity: true }), {
    playerAir: 25,
    aiAir: 25,
    burned: 0,
  });
  assert.equal(settleBets({ ...bets, playerAir: 2, winner: 'ai', calamity: true }).playerAir, 0);
});
