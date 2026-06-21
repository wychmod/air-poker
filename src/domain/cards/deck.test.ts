import { describe, expect, it } from 'vitest';

import { createCard } from './card';
import { buildStandardDeck, drawCards, shuffleDeck, uniqueCards } from './deck';
import {
  createInitialDeckState,
  getSelectableCards,
  isCardUsed,
  moveEffectiveCardsToDiscard,
} from './deck-state';

function ids(cards: Array<{ id: string }>) {
  return cards.map((card) => card.id);
}

function createFixedRng(values: number[]) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;
    return value ?? 0;
  };
}

function expectErrorCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('cards/deck', () => {
  it('builds a stable 52-card deck with unique IDs', () => {
    const deck = buildStandardDeck();

    expect(deck).toHaveLength(52);
    expect(uniqueCards(deck)).toBe(true);
    expect(ids(deck.slice(0, 14))).toStrictEqual([
      'S-A',
      'S-2',
      'S-3',
      'S-4',
      'S-5',
      'S-6',
      'S-7',
      'S-8',
      'S-9',
      'S-10',
      'S-J',
      'S-Q',
      'S-K',
      'H-A',
    ]);
    expect(deck.at(-1)?.id).toBe('C-K');
  });

  it('shuffles deterministically without mutating the input deck', () => {
    const deck = buildStandardDeck();
    const rngValues = [0.13, 0.87, 0.42, 0.01, 0.66];
    const shuffledA = shuffleDeck(deck, createFixedRng(rngValues));
    const shuffledB = shuffleDeck(deck, createFixedRng(rngValues));

    expect(ids(shuffledA)).toStrictEqual(ids(shuffledB));
    expect(ids(shuffledA)).not.toStrictEqual(ids(deck));
    expect(ids(deck.slice(0, 3))).toStrictEqual(['S-A', 'S-2', 'S-3']);
    expect(new Set(ids(shuffledA))).toStrictEqual(new Set(ids(deck)));
  });

  it('rejects invalid RNG output during shuffle', () => {
    const deck = buildStandardDeck();

    expectErrorCode(() => shuffleDeck(deck, () => Number.NaN), 'invalid-rng-value');
    expectErrorCode(
      () => shuffleDeck(deck, () => Number.POSITIVE_INFINITY),
      'invalid-rng-value',
    );
    expectErrorCode(() => shuffleDeck(deck, () => -0.01), 'invalid-rng-value');
    expectErrorCode(() => shuffleDeck(deck, () => 1), 'invalid-rng-value');
  });

  it('draws cards from the top without mutating the input deck', () => {
    const deck = buildStandardDeck();
    const result = drawCards(deck, 2);

    expect(ids(result.drawn)).toStrictEqual(['S-A', 'S-2']);
    expect(result.remaining).toHaveLength(50);
    expect(deck).toHaveLength(52);
  });

  it('rejects invalid draw counts', () => {
    const deck = buildStandardDeck();

    expectErrorCode(() => drawCards(deck, -1), 'invalid-draw-count');
    expectErrorCode(() => drawCards(deck, 1.5), 'invalid-draw-count');
    expectErrorCode(() => drawCards(deck, 53), 'invalid-draw-count');
  });

  it('creates deck state and exposes selectable cards with usage markers', () => {
    const { deckState } = createInitialDeckState(createFixedRng([0.25, 0.5, 0.75]));
    const first = deckState.drawPile[0]!;
    const second = deckState.drawPile[1]!;
    const next = moveEffectiveCardsToDiscard(deckState, [first, second, first]);

    expect(isCardUsed(next, first.id)).toBe(true);
    expect(isCardUsed(next, second.id)).toBe(true);
    expect(next.discardPile).toHaveLength(2);
    expect(next.drawPile.some((card) => card.id === first.id)).toBe(false);

    const selectable = getSelectableCards(next);
    expect(selectable.filter((item) => item.usage === 'used')).toHaveLength(2);
    expect(selectable.find((item) => item.card.id === first.id)).toMatchObject({
      usage: 'used',
    });
  });

  it('rejects unknown effective cards when moving to discard', () => {
    const { deckState } = createInitialDeckState(createFixedRng([0.25, 0.5, 0.75]));
    const unknown = createCard('spades', 'A');
    const withoutSpadeAce = {
      ...deckState,
      drawPile: deckState.drawPile.filter((card) => card.id !== unknown.id),
      discardPile: deckState.discardPile.filter((card) => card.id !== unknown.id),
    };

    expectErrorCode(
      () => moveEffectiveCardsToDiscard(withoutSpadeAce, [unknown]),
      'unknown-card-id',
    );
  });
});
