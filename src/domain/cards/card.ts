import { createAppError } from '../errors';

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;
export type Rank = (typeof RANKS)[number];

export type CardId = `${'S' | 'H' | 'D' | 'C'}-${Rank}`;

export type Card = {
  id: CardId;
  suit: Suit;
  rank: Rank;
  pointValue: number;
  pokerValue: number;
};

const SUIT_PREFIX: Record<Suit, 'S' | 'H' | 'D' | 'C'> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

function assertSuit(suit: Suit): asserts suit is Suit {
  if (!SUITS.includes(suit)) {
    throw createAppError('invalid-card-suit', `Invalid card suit: ${String(suit)}`, {
      details: { suit },
    });
  }
}

function assertRank(rank: Rank): asserts rank is Rank {
  if (!RANKS.includes(rank)) {
    throw createAppError('invalid-card-rank', `Invalid card rank: ${String(rank)}`, {
      details: { rank },
    });
  }
}

export function getPointValue(rank: Rank): number {
  assertRank(rank);

  if (rank === 'A') {
    return 1;
  }

  if (rank === 'J') {
    return 11;
  }

  if (rank === 'Q') {
    return 12;
  }

  if (rank === 'K') {
    return 13;
  }

  return Number(rank);
}

export function getPokerValue(rank: Rank): number {
  assertRank(rank);

  if (rank === 'A') {
    return 14;
  }

  if (rank === 'K') {
    return 13;
  }

  if (rank === 'Q') {
    return 12;
  }

  if (rank === 'J') {
    return 11;
  }

  return Number(rank);
}

export function createCardId(suit: Suit, rank: Rank): CardId {
  assertSuit(suit);
  assertRank(rank);

  return `${SUIT_PREFIX[suit]}-${rank}`;
}

export function createCard(suit: Suit, rank: Rank): Card {
  return {
    id: createCardId(suit, rank),
    suit,
    rank,
    pointValue: getPointValue(rank),
    pokerValue: getPokerValue(rank),
  };
}
