import { describe, expect, it } from 'vitest';

import { createCard, type Card } from '../cards/card';
import { buildStandardDeck } from '../cards/deck';
import {
  createSelectableCards,
  isNumberCardSolvable,
  solveHands,
  summarizeSolvedHands,
  type SelectableCard,
} from './hand-solver';

function ids(cards: Array<{ id: string }>) {
  return cards.map((card) => card.id);
}

function solvedIds(cards: SelectableCard[]) {
  return cards.map((item) => item.card.id);
}

function spade(rank: Parameters<typeof createCard>[1]): Card {
  return createCard('spades', rank);
}

function heart(rank: Parameters<typeof createCard>[1]): Card {
  return createCard('hearts', rank);
}

function diamond(rank: Parameters<typeof createCard>[1]): Card {
  return createCard('diamonds', rank);
}

function club(rank: Parameters<typeof createCard>[1]): Card {
  return createCard('clubs', rank);
}

function selectable(cards: Card[], usage: SelectableCard['usage']): SelectableCard[] {
  return cards.map((card) => ({ card, usage }));
}

function expectErrorCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('hand/hand-solver', () => {
  it('enumerates lower-availability hands using only unused cards', () => {
    const unusedCards = [
      spade('A'),
      spade('2'),
      spade('3'),
      spade('4'),
      spade('5'),
      heart('K'),
    ];
    const usedCards = [heart('A'), heart('2'), heart('3'), heart('4'), heart('5')];
    const result = solveHands({
      targetValue: 15,
      selectableCards: [
        ...selectable(unusedCards, 'unused'),
        ...selectable(usedCards, 'used'),
      ],
      mode: 'lowerAvailability',
    });

    expect(result.targetValue).toBe(15);
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.hands).toHaveLength(1);
    expect(result.hands[0]).toMatchObject({
      totalValue: 15,
      usedCardCount: 0,
      allCardsUnused: true,
    });
    expect(ids(result.hands[0]!.effectiveCards)).toStrictEqual([
      'S-A',
      'S-2',
      'S-3',
      'S-4',
      'S-5',
    ]);
  });

  it('upper-selection keeps used cards selectable but marks them ineffective', () => {
    const usedCards = [spade('A'), spade('2'), spade('3'), spade('4')];
    const unusedCards = [spade('5')];
    const result = solveHands({
      targetValue: 15,
      selectableCards: [
        ...selectable(usedCards, 'used'),
        ...selectable(unusedCards, 'unused'),
      ],
      mode: 'upperSelection',
    });

    expect(result.count).toBe(1);
    const hand = result.hands[0]!;
    expect(hand.totalValue).toBe(15);
    expect(hand.usedCardCount).toBe(4);
    expect(hand.allCardsUnused).toBe(false);
    expect(ids(hand.effectiveCards)).toStrictEqual(['S-5']);
    expect(
      hand.cards.map((item) => ({
        id: item.card.id,
        usage: item.usage,
        effective: item.effective,
      })),
    ).toStrictEqual([
      { id: 'S-A', usage: 'used', effective: false },
      { id: 'S-2', usage: 'used', effective: false },
      { id: 'S-3', usage: 'used', effective: false },
      { id: 'S-4', usage: 'used', effective: false },
      { id: 'S-5', usage: 'unused', effective: true },
    ]);
  });

  it('supports five used cards with totalValue preserved and zero effective cards', () => {
    const result = solveHands({
      targetValue: 15,
      selectableCards: selectable(
        [spade('A'), spade('2'), spade('3'), spade('4'), spade('5')],
        'used',
      ),
      mode: 'upperSelection',
    });

    expect(result.count).toBe(1);
    expect(result.hands[0]).toMatchObject({
      totalValue: 15,
      usedCardCount: 5,
      allCardsUnused: false,
      effectiveCards: [],
    });
  });

  it('returns empty results for unsolved or undersized inputs', () => {
    const unsolved = solveHands({
      targetValue: 99,
      selectableCards: selectable(
        [spade('A'), spade('2'), spade('3'), spade('4'), spade('5')],
        'unused',
      ),
      mode: 'lowerAvailability',
    });
    const undersized = solveHands({
      targetValue: 10,
      selectableCards: selectable(
        [spade('A'), spade('2'), spade('3'), spade('4')],
        'unused',
      ),
      mode: 'upperSelection',
    });

    expect(unsolved).toMatchObject({
      count: 0,
      hands: [],
      truncated: false,
    });
    expect(undersized).toMatchObject({
      count: 0,
      hands: [],
      truncated: false,
    });
  });

  it('sorts solved hands by stable card-id key and keeps count when limited', () => {
    const cards = [
      heart('5'),
      spade('A'),
      spade('2'),
      spade('3'),
      spade('4'),
      diamond('5'),
      club('5'),
    ];
    const result = solveHands({
      targetValue: 15,
      selectableCards: selectable(cards, 'unused'),
      mode: 'upperSelection',
      limit: 2,
    });
    const repeat = solveHands({
      targetValue: 15,
      selectableCards: selectable(cards, 'unused'),
      mode: 'upperSelection',
      limit: 2,
    });

    expect(result.count).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.hands).toHaveLength(2);
    expect(
      result.hands.map((hand) => ids(hand.cards.map((item) => item.card))),
    ).toStrictEqual([
      ['H-5', 'S-A', 'S-2', 'S-3', 'S-4'],
      ['S-A', 'S-2', 'S-3', 'S-4', 'C-5'],
    ]);
    expect(result).toStrictEqual(repeat);
  });

  it('rejects invalid targets and duplicate selectable cards with structured errors', () => {
    expectErrorCode(
      () =>
        solveHands({
          targetValue: 1.5,
          selectableCards: [],
          mode: 'lowerAvailability',
        }),
      'invalid-target-value',
    );
    expectErrorCode(
      () =>
        solveHands({
          targetValue: 15,
          selectableCards: selectable([spade('A'), spade('A')], 'unused'),
          mode: 'upperSelection',
        }),
      'duplicate-selectable-card',
    );
  });

  it('checks number-card solvability with lower-availability semantics', () => {
    const drawPile = [spade('A'), spade('2'), spade('3'), spade('4'), spade('5')];

    expect(isNumberCardSolvable(15, drawPile)).toBe(true);
    expect(isNumberCardSolvable(16, drawPile)).toBe(false);
    expect(isNumberCardSolvable(10, drawPile.slice(0, 4))).toBe(false);
  });

  it('creates selectable cards from draw and discard piles without burn cards', () => {
    const burnCard = spade('K');
    const drawPile = [spade('5'), spade('A'), spade('3')];
    const discardPile = [heart('2'), heart('A')];

    const result = createSelectableCards(drawPile, discardPile);

    expect(solvedIds(result)).toStrictEqual(['S-A', 'S-3', 'S-5', 'H-A', 'H-2']);
    expect(result.map((item) => item.usage)).toStrictEqual([
      'unused',
      'unused',
      'unused',
      'used',
      'used',
    ]);
    expect(result.some((item) => item.card.id === burnCard.id)).toBe(false);
    expectErrorCode(
      () => createSelectableCards([spade('A'), spade('A')], []),
      'card-in-both-piles',
    );
    expectErrorCode(
      () => createSelectableCards([spade('A')], [spade('A')]),
      'card-in-both-piles',
    );
  });

  it('summarizes solved hands for UI and AI consumers', () => {
    const hands = solveHands({
      targetValue: 15,
      selectableCards: [
        ...selectable([spade('A'), spade('2'), spade('3'), spade('4')], 'used'),
        ...selectable([spade('5'), heart('5'), diamond('5')], 'unused'),
      ],
      mode: 'upperSelection',
    }).hands;

    expect(summarizeSolvedHands(hands)).toStrictEqual({
      totalCount: 3,
      allUnusedCount: 0,
      containsUsedCount: 3,
      minUsedCardCount: 4,
      maxUsedCardCount: 4,
    });
    expect(summarizeSolvedHands([])).toStrictEqual({
      totalCount: 0,
      allUnusedCount: 0,
      containsUsedCount: 0,
      minUsedCardCount: 0,
      maxUsedCardCount: 0,
    });
  });

  it('can solve against a full standard deck without mutating input', () => {
    const deck = buildStandardDeck();
    const before = ids(deck);
    const result = solveHands({
      targetValue: 15,
      selectableCards: selectable(deck, 'unused'),
      mode: 'lowerAvailability',
      limit: 1,
    });

    expect(result.count).toBeGreaterThan(1);
    expect(result.hands).toHaveLength(1);
    expect(ids(deck)).toStrictEqual(before);
  });
});
