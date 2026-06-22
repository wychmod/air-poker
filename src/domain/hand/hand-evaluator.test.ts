import { describe, expect, it } from 'vitest';

import { createCard, type Card, type Rank } from '../cards/card';
import {
  compareEvaluatedHands,
  compareHands,
  evaluateHand,
  getHandCategoryBaseScore,
  rankSolvedHands,
} from './hand-evaluator';
import { type SolvedHand } from './hand-solver';

function spade(rank: Rank): Card {
  return createCard('spades', rank);
}

function heart(rank: Rank): Card {
  return createCard('hearts', rank);
}

function diamond(rank: Rank): Card {
  return createCard('diamonds', rank);
}

function club(rank: Rank): Card {
  return createCard('clubs', rank);
}

function expectErrorCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function solvedHand(effectiveCards: Card[]): SolvedHand {
  return {
    cards: effectiveCards.map((card) => ({ card, usage: 'unused', effective: true })),
    effectiveCards,
    totalValue: effectiveCards.reduce((total, card) => total + card.pointValue, 0),
    usedCardCount: 0,
    allCardsUnused: true,
  };
}

describe('hand/hand-evaluator', () => {
  it('evaluates all ten standard poker categories', () => {
    expect(
      evaluateHand([spade('A'), spade('K'), spade('Q'), spade('J'), spade('10')]),
    ).toMatchObject({
      category: 'RoyalStraightFlush',
      categoryRank: 10,
      tiebreakers: [],
    });
    expect(
      evaluateHand([heart('9'), heart('8'), heart('7'), heart('6'), heart('5')]),
    ).toMatchObject({
      category: 'StraightFlush',
      categoryRank: 9,
      tiebreakers: [9],
    });
    expect(
      evaluateHand([spade('A'), heart('A'), diamond('A'), club('A'), spade('K')]),
    ).toMatchObject({
      category: 'FourOfAKind',
      categoryRank: 8,
      tiebreakers: [14, 13],
    });
    expect(
      evaluateHand([spade('A'), heart('A'), diamond('A'), spade('K'), heart('K')]),
    ).toMatchObject({
      category: 'FullHouse',
      categoryRank: 7,
      tiebreakers: [14, 13],
    });
    expect(
      evaluateHand([spade('A'), spade('K'), spade('8'), spade('4'), spade('2')]),
    ).toMatchObject({
      category: 'Flush',
      categoryRank: 6,
      tiebreakers: [14, 13, 8, 4, 2],
    });
    expect(
      evaluateHand([spade('9'), heart('8'), diamond('7'), club('6'), spade('5')]),
    ).toMatchObject({
      category: 'Straight',
      categoryRank: 5,
      tiebreakers: [9],
    });
    expect(
      evaluateHand([spade('Q'), heart('Q'), diamond('Q'), club('9'), spade('2')]),
    ).toMatchObject({
      category: 'ThreeOfAKind',
      categoryRank: 4,
      tiebreakers: [12, 9, 2],
    });
    expect(
      evaluateHand([spade('Q'), heart('Q'), diamond('9'), club('9'), spade('2')]),
    ).toMatchObject({
      category: 'TwoPair',
      categoryRank: 3,
      tiebreakers: [12, 9, 2],
    });
    expect(
      evaluateHand([spade('J'), heart('J'), diamond('9'), club('5'), spade('2')]),
    ).toMatchObject({
      category: 'OnePair',
      categoryRank: 2,
      tiebreakers: [11, 9, 5, 2],
    });
    expect(
      evaluateHand([spade('A'), heart('K'), diamond('8'), club('5'), spade('2')]),
    ).toMatchObject({
      category: 'HighCard',
      categoryRank: 1,
      tiebreakers: [14, 13, 8, 5, 2],
    });
  });

  it('uses Texas straight rules with ace high and low but no wraparound', () => {
    expect(
      evaluateHand([spade('A'), heart('2'), diamond('3'), club('4'), spade('5')]),
    ).toMatchObject({
      category: 'Straight',
      tiebreakers: [5],
    });
    expect(
      evaluateHand([spade('2'), heart('3'), diamond('4'), club('5'), spade('6')]),
    ).toMatchObject({
      category: 'Straight',
      tiebreakers: [6],
    });
    expect(
      evaluateHand([spade('K'), heart('A'), diamond('2'), club('3'), spade('4')])
        .category,
    ).not.toBe('Straight');
    expect(
      evaluateHand([spade('Q'), heart('K'), diamond('A'), club('2'), spade('3')])
        .category,
    ).not.toBe('Straight');
  });

  it('keeps royal and straight-flush detection mutually exclusive', () => {
    const royal = evaluateHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const straightFlush = evaluateHand([
      spade('9'),
      spade('8'),
      spade('7'),
      spade('6'),
      spade('5'),
    ]);

    expect(royal.category).toBe('RoyalStraightFlush');
    expect(straightFlush.category).toBe('StraightFlush');
    expect(compareEvaluatedHands(royal, straightFlush)).toBe(1);
  });

  it('compares same-category hands by effective count and tiebreakers', () => {
    expect(
      compareHands(
        [spade('A'), heart('K'), diamond('8'), club('5'), spade('2')],
        [heart('A'), diamond('K'), club('8'), spade('5')],
      ),
    ).toBe(1);
    expect(
      compareHands(
        [spade('A'), spade('K'), spade('8'), spade('5'), spade('3')],
        [heart('A'), heart('K'), heart('8'), heart('5'), heart('4')],
      ),
    ).toBe(-1);
    expect(
      compareHands(
        [spade('A'), heart('2'), diamond('3'), club('4'), spade('5')],
        [spade('2'), heart('3'), diamond('4'), club('5'), spade('6')],
      ),
    ).toBe(-1);
    expect(
      compareHands(
        [spade('J'), heart('J'), diamond('9'), club('5'), spade('2')],
        [club('J'), diamond('J'), heart('9'), spade('5'), club('2')],
      ),
    ).toBe(0);
  });

  it('evaluates degraded hands by effective card count', () => {
    expect(evaluateHand([spade('A'), heart('A'), diamond('A'), club('A')])).toMatchObject(
      {
        category: 'FourOfAKind',
        effectiveCardCount: 4,
        tiebreakers: [14],
      },
    );
    expect(evaluateHand([spade('A'), heart('A'), diamond('K'), club('K')])).toMatchObject(
      {
        category: 'TwoPair',
        effectiveCardCount: 4,
        tiebreakers: [14, 13],
      },
    );
    expect(evaluateHand([spade('A'), heart('K'), diamond('Q'), club('J')])).toMatchObject(
      {
        category: 'HighCard',
        effectiveCardCount: 4,
        tiebreakers: [14, 13, 12, 11],
      },
    );
    expect(evaluateHand([spade('A'), heart('A'), diamond('A')])).toMatchObject({
      category: 'ThreeOfAKind',
      effectiveCardCount: 3,
      tiebreakers: [14],
    });
    expect(evaluateHand([spade('A'), heart('A')])).toMatchObject({
      category: 'OnePair',
      effectiveCardCount: 2,
      tiebreakers: [14],
    });
    expect(evaluateHand([spade('A')])).toMatchObject({
      category: 'HighCard',
      effectiveCardCount: 1,
      tiebreakers: [14],
    });
    expect(evaluateHand([])).toMatchObject({
      category: 'NoEffectiveCards',
      categoryRank: 0,
      effectiveCardCount: 0,
      tiebreakers: [],
    });
  });

  it('does not allow short hands to become full houses, flushes, or straights', () => {
    expect(evaluateHand([spade('A'), spade('K'), spade('Q'), spade('J')]).category).toBe(
      'HighCard',
    );
    expect(evaluateHand([spade('A'), heart('2'), diamond('3'), club('4')]).category).toBe(
      'HighCard',
    );
    expect(evaluateHand([spade('A'), heart('A'), diamond('K'), club('K')]).category).toBe(
      'TwoPair',
    );
    expect(evaluateHand([spade('A'), heart('A'), diamond('K')]).category).toBe('OnePair');
  });

  it('rejects too many cards and duplicate entity cards', () => {
    expectErrorCode(
      () =>
        evaluateHand([
          spade('A'),
          heart('K'),
          diamond('Q'),
          club('J'),
          spade('10'),
          heart('9'),
        ]),
      'too-many-effective-cards',
    );
    expectErrorCode(
      () => evaluateHand([spade('A'), spade('A')]),
      'duplicate-card-in-hand',
    );
  });

  it('ranks solved hands strongly first while keeping equal hands stable', () => {
    const highCard = solvedHand([spade('A'), heart('K'), diamond('8'), club('5')]);
    const pair = solvedHand([spade('A'), heart('A')]);
    const tiedPairA = solvedHand([spade('K'), heart('K')]);
    const tiedPairB = solvedHand([diamond('K'), club('K')]);

    const ranked = rankSolvedHands([highCard, tiedPairA, pair, tiedPairB]);

    expect(ranked.map((item) => item.rank)).toStrictEqual([1, 2, 2, 3]);
    expect(ranked.map((item) => item.evaluation.category)).toStrictEqual([
      'OnePair',
      'OnePair',
      'OnePair',
      'HighCard',
    ]);
    expect(ranked.map((item) => item.solvedHand)).toStrictEqual([
      pair,
      tiedPairA,
      tiedPairB,
      highCard,
    ]);
  });

  it('provides AI base scores for every category', () => {
    expect(getHandCategoryBaseScore('NoEffectiveCards')).toBe(0);
    expect(getHandCategoryBaseScore('HighCard')).toBe(100);
    expect(getHandCategoryBaseScore('OnePair')).toBe(200);
    expect(getHandCategoryBaseScore('TwoPair')).toBe(300);
    expect(getHandCategoryBaseScore('ThreeOfAKind')).toBe(400);
    expect(getHandCategoryBaseScore('Straight')).toBe(500);
    expect(getHandCategoryBaseScore('Flush')).toBe(600);
    expect(getHandCategoryBaseScore('FullHouse')).toBe(700);
    expect(getHandCategoryBaseScore('FourOfAKind')).toBe(800);
    expect(getHandCategoryBaseScore('StraightFlush')).toBe(900);
    expect(getHandCategoryBaseScore('RoyalStraightFlush')).toBe(1000);
  });
});
