import { describe, expect, it } from 'vitest';

import { createCard } from './card';
import { buildStandardDeck } from './deck';
import {
  assignNumberCards,
  createNumberCardsFromDeck,
  generateNumberCardDeal,
  markNumberCardUsed,
  replaceUnsolvableNumberCard,
  validateNumberCardDeal,
  type NumberCard,
  type NumberCardId,
  type UnassignedNumberCard,
} from './number-card-generator';

function createFixedRng(values: number[]) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;
    return value ?? 0;
  };
}

function sumPointValues(cards: Array<{ pointValue: number }>): number {
  return cards.reduce((total, card) => total + card.pointValue, 0);
}

const spadeAce = createCard('spades', 'A');
const spadeTwo = createCard('spades', '2');
const spadeThree = createCard('spades', '3');
const spadeFour = createCard('spades', '4');
const spadeFive = createCard('spades', '5');

function ids(cards: Array<{ id: string }>) {
  return cards.map((card) => card.id);
}

function createUnassignedNumberCard(
  id: NumberCardId,
  value: number,
): UnassignedNumberCard {
  return {
    id,
    value,
    proofHand: [],
    status: 'available',
  };
}

function createNumberCard(
  id: NumberCardId,
  owner: NumberCard['owner'],
  value: number,
): NumberCard {
  return {
    id,
    owner,
    value,
    proofHand: [],
    status: 'available',
  };
}

describe('cards/number-card-generator', () => {
  it('creates ten number cards and two burn cards from a complete source deck', () => {
    const sourceDeck = buildStandardDeck();
    const result = createNumberCardsFromDeck(sourceDeck);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(ids(result.burnCards)).toStrictEqual(['S-A', 'S-2']);
    expect(result.numberCards).toHaveLength(10);
    expect(ids(result.numberCards)).toStrictEqual([
      'N-01',
      'N-02',
      'N-03',
      'N-04',
      'N-05',
      'N-06',
      'N-07',
      'N-08',
      'N-09',
      'N-10',
    ]);
    expect(result.numberCards[0]).toMatchObject({
      id: 'N-01',
      value: 25,
      status: 'available',
    });
    expect(ids(result.numberCards[0]!.proofHand)).toStrictEqual([
      'S-3',
      'S-4',
      'S-5',
      'S-6',
      'S-7',
    ]);

    const proofCards = result.numberCards.flatMap((numberCard) => numberCard.proofHand);
    expect(proofCards).toHaveLength(50);
    expect(new Set(ids([...result.burnCards, ...proofCards]))).toHaveLength(52);
  });

  it('rejects invalid source decks instead of throwing', () => {
    const sourceDeck = buildStandardDeck();
    const duplicateDeck = [...sourceDeck.slice(0, 51), sourceDeck[0]!];

    expect(createNumberCardsFromDeck(sourceDeck.slice(0, 51))).toMatchObject({
      ok: false,
      code: 'invalid-source-deck',
    });
    expect(createNumberCardsFromDeck(duplicateDeck)).toMatchObject({
      ok: false,
      code: 'invalid-source-deck',
    });
  });

  it('assigns five number cards per side using the smallest difference and stable tiebreaker', () => {
    const equalCards = Array.from({ length: 10 }, (_, index) =>
      createUnassignedNumberCard(`N-${String(index + 1).padStart(2, '0')}`, 10),
    );

    const equalResult = assignNumberCards(equalCards, 30);

    expect(equalResult.ok).toBe(true);
    if (!equalResult.ok) {
      return;
    }

    expect(equalResult.difference).toBe(0);
    expect(ids(equalResult.playerCards)).toStrictEqual([
      'N-01',
      'N-02',
      'N-03',
      'N-04',
      'N-05',
    ]);
    expect(equalResult.playerCards.every((card) => card.owner === 'player')).toBe(true);
    expect(equalResult.aiCards.every((card) => card.owner === 'ai')).toBe(true);

    const imbalancedCards = [1, 1, 1, 1, 1, 100, 100, 100, 100, 100].map((value, index) =>
      createUnassignedNumberCard(`N-${String(index + 1).padStart(2, '0')}`, value),
    );

    expect(assignNumberCards(imbalancedCards, 30)).toMatchObject({
      ok: false,
      code: 'balance-threshold-exceeded',
      bestDifference: 99,
    });
  });

  it('generates a complete valid deal with reproducible output and solvability checks', () => {
    const rngValues = [0.13, 0.87, 0.42, 0.01, 0.66, 0.25, 0.75];
    const first = generateNumberCardDeal({
      rng: createFixedRng(rngValues),
      seed: 'deal-seed-001',
      isSolvable: (value, availableCards) =>
        availableCards.some((card) => card.pointValue <= value),
    });
    const second = generateNumberCardDeal({
      rng: createFixedRng(rngValues),
      seed: 'deal-seed-001',
      isSolvable: (value, availableCards) =>
        availableCards.some((card) => card.pointValue <= value),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.deal.seed).toBe('deal-seed-001');
    expect(first.deal.attempts).toBe(1);
    expect(first.deal.playerCards).toHaveLength(5);
    expect(first.deal.aiCards).toHaveLength(5);
    expect(first.deal.burnCards).toHaveLength(2);
    expect(first.deal.sourceDeck).toHaveLength(52);
    expect(ids(first.deal.allNumberCards)).toStrictEqual(ids(second.deal.allNumberCards));
    expect(validateNumberCardDeal(first.deal)).toStrictEqual({ ok: true });

    const playerTotal = first.deal.playerCards.reduce(
      (total, card) => total + card.value,
      0,
    );
    const aiTotal = first.deal.aiCards.reduce((total, card) => total + card.value, 0);
    expect(Math.abs(playerTotal - aiTotal)).toBeLessThanOrEqual(30);
    expect(playerTotal + aiTotal + sumPointValues(first.deal.burnCards)).toBe(364);
  });

  it('returns a diagnostic failure when generation attempts are exhausted', () => {
    const result = generateNumberCardDeal({
      rng: createFixedRng([0.2, 0.4, 0.6, 0.8]),
      seed: 'unsolvable-seed',
      maxAttempts: 2,
      isSolvable: () => false,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'number-card-generation-failed',
      attempts: 2,
    });
  });

  it('validates deal invariants and reports proof hand mismatches', () => {
    const result = generateNumberCardDeal({
      rng: createFixedRng([0.13, 0.87, 0.42, 0.01, 0.66]),
      seed: 'validation-seed',
      isSolvable: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const brokenDeal = {
      ...result.deal,
      playerCards: [
        { ...result.deal.playerCards[0]!, value: result.deal.playerCards[0]!.value + 1 },
        ...result.deal.playerCards.slice(1),
      ],
    };

    expect(validateNumberCardDeal(brokenDeal)).toMatchObject({
      ok: false,
      reason: 'number-card-value-mismatch',
    });
  });

  it('marks number cards used immutably and returns structured failures', () => {
    const cards = [
      createNumberCard('N-01', 'player', 25),
      createNumberCard('N-02', 'player', 30),
    ];

    const used = markNumberCardUsed(cards, 'N-01');

    expect(used.ok).toBe(true);
    if (!used.ok) {
      return;
    }

    expect(used.cards[0]).toMatchObject({ id: 'N-01', status: 'used' });
    expect(cards[0]).toMatchObject({ id: 'N-01', status: 'available' });
    expect(markNumberCardUsed(used.cards, 'N-01')).toMatchObject({
      ok: false,
      code: 'number-card-already-used',
    });
    expect(markNumberCardUsed(cards, 'N-99')).toMatchObject({
      ok: false,
      code: 'number-card-not-found',
    });
  });

  it('replaces the first available unsolvable number card from the current draw pile', () => {
    // drawPile contains S-A..S-5 (point values 1,2,3,4,5 = sum 15) plus two extras.
    const drawPile = [spadeAce, spadeTwo, spadeThree, spadeFour, spadeFive];
    // N-01 (value 15) is unsolvable per isSolvable (returns false for 15 on the
    // first check), but a 5-card combo summing to 15 exists in the drawPile, so it
    // can be replaced with proofHand S-A..S-5 and new value 15. isSolvable is
    // stateful: the first call (picking the target) returns false, subsequent calls
    // (re-validating the replaced value) return true.
    let solvableCallCount = 0;
    const cards = [
      createNumberCard('N-01', 'player', 15),
      createNumberCard('N-02', 'player', 999),
    ];

    const result = replaceUnsolvableNumberCard({
      owner: 'player',
      cards,
      drawPile,
      rng: createFixedRng([0.5]),
      isSolvable: () => {
        solvableCallCount += 1;
        return solvableCallCount > 1;
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.replacement).toMatchObject({
      id: 'N-01',
      owner: 'player',
      value: 15,
      status: 'replaced',
    });
    expect(ids(result.replacement.proofHand)).toStrictEqual([
      'S-A',
      'S-2',
      'S-3',
      'S-4',
      'S-5',
    ]);
    expect(ids(result.cards)).toStrictEqual(['N-01', 'N-02']);
    expect(result.cards[0]).toStrictEqual(result.replacement);
  });

  it('returns no-unsolvable-number-card when there is nothing to replace', () => {
    const cards = [createNumberCard('N-01', 'ai', 15)];

    expect(
      replaceUnsolvableNumberCard({
        owner: 'ai',
        cards,
        drawPile: [spadeAce, spadeTwo, spadeThree, spadeFour, spadeFive],
        rng: createFixedRng([0.5]),
        isSolvable: () => true,
      }),
    ).toMatchObject({
      ok: false,
      code: 'no-unsolvable-number-card',
    });
  });

  it('returns replacement failure reasons without throwing', () => {
    const cards = [createNumberCard('N-01', 'ai', 999)];

    expect(
      replaceUnsolvableNumberCard({
        owner: 'ai',
        cards,
        drawPile: buildStandardDeck().slice(0, 4),
        rng: createFixedRng([0.5]),
        isSolvable: () => false,
      }),
    ).toMatchObject({
      ok: false,
      code: 'not-enough-cards',
    });

    // targetValue 999 cannot be formed by any 5-card combo of the draw pile,
    // so HandSolver returns 0 hands -> no-legal-replacement-hand.
    expect(
      replaceUnsolvableNumberCard({
        owner: 'ai',
        cards,
        drawPile: buildStandardDeck().slice(0, 5),
        rng: createFixedRng([0.5]),
        isSolvable: () => false,
      }),
    ).toMatchObject({
      ok: false,
      code: 'no-legal-replacement-hand',
    });

    // A combo summing to targetValue (15) exists, but isSolvable rejects the
    // replaced value 15 -> replacement-still-unsolvable.
    expect(
      replaceUnsolvableNumberCard({
        owner: 'ai',
        cards: [createNumberCard('N-01', 'ai', 15)],
        drawPile: [spadeAce, spadeTwo, spadeThree, spadeFour, spadeFive],
        rng: createFixedRng([0.5]),
        isSolvable: () => false,
      }),
    ).toMatchObject({
      ok: false,
      code: 'replacement-still-unsolvable',
    });
  });
});
