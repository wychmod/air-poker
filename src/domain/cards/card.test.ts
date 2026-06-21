import { describe, expect, it } from 'vitest';

import { createAppError } from '../errors';
import { createCard, createCardId, getPointValue, getPokerValue } from './card';

function expectErrorCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('cards/card', () => {
  it('creates stable entity cards with point and poker values', () => {
    expect(createCard('spades', 'A')).toStrictEqual({
      id: 'S-A',
      suit: 'spades',
      rank: 'A',
      pointValue: 1,
      pokerValue: 14,
    });

    expect(createCard('hearts', '10')).toStrictEqual({
      id: 'H-10',
      suit: 'hearts',
      rank: '10',
      pointValue: 10,
      pokerValue: 10,
    });
  });

  it('maps ranks differently for point sums and poker comparison', () => {
    expect(getPointValue('A')).toBe(1);
    expect(getPointValue('J')).toBe(11);
    expect(getPointValue('Q')).toBe(12);
    expect(getPointValue('K')).toBe(13);

    expect(getPokerValue('A')).toBe(14);
    expect(getPokerValue('K')).toBe(13);
    expect(getPokerValue('2')).toBe(2);
  });

  it('creates ASCII card IDs from suit and rank', () => {
    expect(createCardId('spades', 'A')).toBe('S-A');
    expect(createCardId('hearts', '10')).toBe('H-10');
    expect(createCardId('diamonds', 'Q')).toBe('D-Q');
    expect(createCardId('clubs', 'K')).toBe('C-K');
  });

  it('throws documented error codes for invalid card input', () => {
    expectErrorCode(() => createCard('stars' as never, 'A'), 'invalid-card-suit');
    expectErrorCode(() => createCard('spades', '1' as never), 'invalid-card-rank');
    expectErrorCode(() => getPointValue('joker' as never), 'invalid-card-rank');
    expectErrorCode(() => getPokerValue('joker' as never), 'invalid-card-rank');
    expectErrorCode(() => createCardId('stars' as never, 'A'), 'invalid-card-suit');
  });

  it('uses the shared application error shape', () => {
    expect(createAppError('invalid-card-rank', 'Invalid card rank')).toMatchObject({
      code: 'invalid-card-rank',
      message: 'Invalid card rank',
    });
  });
});
