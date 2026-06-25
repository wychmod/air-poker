import { describe, expect, it } from 'vitest';

import { createCard, type Rank } from '../cards/card';
import { applyCalamityPenalty, detectCalamity } from './calamity-engine';

function spade(rank: Rank) {
  return createCard('spades', rank);
}
function heart(rank: Rank) {
  return createCard('hearts', rank);
}
function diamond(rank: Rank) {
  return createCard('diamonds', rank);
}
function club(rank: Rank) {
  return createCard('clubs', rank);
}

describe('calamity/detectCalamity', () => {
  it('triggers when effective cards overlap and returns sorted ids', () => {
    const player = [spade('A'), heart('5'), diamond('9')];
    const ai = [spade('A'), club('K'), heart('2')];
    const result = detectCalamity(player, ai);
    expect(result.triggered).toBe(true);
    expect(result.overlappingCardIds).toEqual(['S-A']);
  });

  it('does not trigger when either side is empty', () => {
    expect(detectCalamity([], [spade('A')]).triggered).toBe(false);
    expect(detectCalamity([spade('A')], []).triggered).toBe(false);
    expect(detectCalamity([], []).triggered).toBe(false);
  });

  it('sorts overlapping ids ascending by id', () => {
    const player = [club('K'), heart('2'), spade('A')];
    const ai = [spade('A'), heart('2'), club('K')];
    const result = detectCalamity(player, ai);
    expect(result.overlappingCardIds).toEqual(['C-K', 'H-2', 'S-A']);
  });

  it('does not trigger when no overlap', () => {
    const player = [spade('A'), heart('5')];
    const ai = [diamond('A'), club('K')];
    expect(detectCalamity(player, ai).triggered).toBe(false);
  });

  it('throws duplicate-effective-card on internal duplicates', () => {
    const dup = [spade('A'), spade('A')];
    try {
      detectCalamity(dup, [heart('2')]);
      throw new Error('Expected detectCalamity to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'duplicate-effective-card' });
    }
  });
});

describe('calamity/applyCalamityPenalty', () => {
  const escrow = { playerBet: 5, aiBet: 5 };

  it('returns zeros when not triggered or no loser', () => {
    expect(
      applyCalamityPenalty({
        triggered: false,
        loser: 'player',
        escrow,
        playerAir: 10,
        aiAir: 10,
      }),
    ).toStrictEqual({ playerDeduction: 0, aiDeduction: 0, vanishedAir: 0 });
    expect(
      applyCalamityPenalty({
        triggered: true,
        loser: null,
        escrow,
        playerAir: 10,
        aiAir: 10,
      }),
    ).toStrictEqual({ playerDeduction: 0, aiDeduction: 0, vanishedAir: 0 });
  });

  it('deducts loser bet from player and records vanishedAir as owed', () => {
    expect(
      applyCalamityPenalty({
        triggered: true,
        loser: 'player',
        escrow,
        playerAir: 10,
        aiAir: 10,
      }),
    ).toStrictEqual({ playerDeduction: 5, aiDeduction: 0, vanishedAir: 5 });
  });

  it('clamps deduction to 0 when loser air insufficient, vanishedAir stays owed', () => {
    expect(
      applyCalamityPenalty({
        triggered: true,
        loser: 'player',
        escrow,
        playerAir: 3,
        aiAir: 10,
      }),
    ).toStrictEqual({ playerDeduction: 3, aiDeduction: 0, vanishedAir: 5 });
  });

  it('deducts from ai symmetrically', () => {
    expect(
      applyCalamityPenalty({
        triggered: true,
        loser: 'ai',
        escrow,
        playerAir: 10,
        aiAir: 4,
      }),
    ).toStrictEqual({ playerDeduction: 0, aiDeduction: 4, vanishedAir: 5 });
  });
});
