import { createAppError } from '../errors';
import { type Card, RANKS, SUITS, createCard } from './card';

export type Rng = () => number;

export function buildStandardDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => createCard(suit, rank)));
}

export function uniqueCards(cards: Card[]): boolean {
  return new Set(cards.map((card) => card.id)).size === cards.length;
}

export function shuffleDeck(cards: Card[], rng: Rng): Card[] {
  if (!uniqueCards(cards)) {
    throw createAppError('duplicate-card-in-deck', 'Deck contains duplicate cards');
  }

  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const value = rng();

    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw createAppError('invalid-rng-value', 'RNG must return a number in [0, 1)', {
        details: { value },
      });
    }

    const swapIndex = Math.floor(value * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function drawCards(
  cards: Card[],
  count: number,
): { drawn: Card[]; remaining: Card[] } {
  if (!Number.isInteger(count) || count < 0 || count > cards.length) {
    throw createAppError('invalid-draw-count', 'Draw count is outside the deck bounds', {
      details: { count, available: cards.length },
    });
  }

  return {
    drawn: cards.slice(0, count),
    remaining: cards.slice(count),
  };
}
