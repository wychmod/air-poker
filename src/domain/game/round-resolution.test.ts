import { describe, expect, it } from 'vitest';

import { createCard, type Card, type Rank } from '../cards/card';
import { evaluateHand } from '../hand/hand-evaluator';
import {
  collectDiscardCardIds,
  determineRoundWinner,
  resolveRound,
  settleAnte,
  settleBetEscrow,
  type LockedHand,
  type RoundEscrow,
} from './round-resolution';

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

function lockedHand(effectiveCards: Card[]): LockedHand {
  // selectedCards 长度 5：不足时用 effectiveCards 之外的占位补齐，保证契约。
  const selected = [...effectiveCards];
  while (selected.length < 5) {
    selected.push(spade('2'));
  }
  return {
    selectedCards: selected.slice(0, 5),
    effectiveCards,
    evaluatedHand: evaluateHand(effectiveCards),
  };
}

// 5/5 平手用：构造两张等价但不同花色的 HighCard，确保 compareEvaluatedHands === 0。
function tiedHighCardHands(): { player: LockedHand; ai: LockedHand } {
  const player = lockedHand([
    spade('A'),
    heart('K'),
    diamond('8'),
    club('5'),
    spade('2'),
  ]);
  const ai = lockedHand([heart('A'), diamond('K'), club('8'), spade('5'), heart('2')]);
  return { player, ai };
}

const baseEscrow: RoundEscrow = {
  playerAnte: 1,
  aiAnte: 1,
  playerBet: 5,
  aiBet: 5,
};

function resolveOk(input: Parameters<typeof resolveRound>[0]) {
  const result = resolveRound(input);
  if (!result.ok) {
    throw new Error(`Expected resolveRound to succeed, got code=${result.code}`);
  }
  return result.resolution;
}

describe('round-resolution/determineRoundWinner', () => {
  it('returns player win on handComparison when player stronger', () => {
    const playerEval = evaluateHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const aiEval = evaluateHand([
      heart('9'),
      heart('8'),
      heart('7'),
      heart('6'),
      heart('5'),
    ]);
    const result = determineRoundWinner({
      playerEvaluatedHand: playerEval,
      aiEvaluatedHand: aiEval,
      foldState: 'none',
    });
    expect(result.winner).toBe('player');
    expect(result.reason).toBe('handComparison');
    expect(result.compareResult).toBe(1);
  });

  it('returns ai win on playerFolded regardless of hands', () => {
    const result = determineRoundWinner({
      playerEvaluatedHand: evaluateHand([spade('A')]),
      aiEvaluatedHand: evaluateHand([heart('2')]),
      foldState: 'playerFolded',
    });
    expect(result).toMatchObject({ winner: 'ai', reason: 'playerFolded' });
  });

  it('returns player win on aiFolded', () => {
    const result = determineRoundWinner({
      playerEvaluatedHand: evaluateHand([heart('2')]),
      aiEvaluatedHand: evaluateHand([spade('A')]),
      foldState: 'aiFolded',
    });
    expect(result).toMatchObject({ winner: 'player', reason: 'aiFolded' });
  });

  it('returns exactTie when hands equal', () => {
    const { player, ai } = tiedHighCardHands();
    const result = determineRoundWinner({
      playerEvaluatedHand: player.evaluatedHand,
      aiEvaluatedHand: ai.evaluatedHand,
      foldState: 'none',
    });
    expect(result).toMatchObject({ winner: 'tie', reason: 'exactTie', compareResult: 0 });
  });
});

describe('round-resolution/settleAnte', () => {
  it('player win: player gets own ante, ai ante vanishes', () => {
    expect(settleAnte(baseEscrow, 'player')).toStrictEqual({
      playerReceivedAnte: 1,
      aiReceivedAnte: 0,
      vanishedAir: 1,
    });
  });

  it('ai win: ai gets own ante, player ante vanishes', () => {
    expect(settleAnte(baseEscrow, 'ai')).toStrictEqual({
      playerReceivedAnte: 0,
      aiReceivedAnte: 1,
      vanishedAir: 1,
    });
  });

  it('tie: both get own ante back, nothing vanishes', () => {
    expect(settleAnte(baseEscrow, 'tie')).toStrictEqual({
      playerReceivedAnte: 1,
      aiReceivedAnte: 1,
      vanishedAir: 0,
    });
  });
});

describe('round-resolution/settleBetEscrow', () => {
  it('player win: player gets both bets', () => {
    expect(settleBetEscrow(baseEscrow, 'player')).toStrictEqual({
      playerReceivedBet: 10,
      aiReceivedBet: 0,
    });
  });

  it('tie: each gets own bet back', () => {
    expect(settleBetEscrow(baseEscrow, 'tie')).toStrictEqual({
      playerReceivedBet: 5,
      aiReceivedBet: 5,
    });
  });
});

describe('round-resolution/hand comparison accounting', () => {
  // 结算前 Air = 25。扣呼吸 1 + ante 1 + bet 5 = 7 后，escrow 后余额 = 18。
  const airAfterEscrow = 18;

  it('player wins: aiReceivedBet = playerBet + aiBet, player net = +aiBet', () => {
    const player = lockedHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const ai = lockedHand([heart('9'), heart('8'), heart('7'), heart('6'), heart('5')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: baseEscrow,
      playerAirAfterEscrow: airAfterEscrow,
      aiAirAfterEscrow: airAfterEscrow,
    });
    expect(resolution.winner).toBe('player');
    expect(resolution.escrowDistribution.playerReceivedBet).toBe(10);
    expect(resolution.escrowDistribution.aiReceivedBet).toBe(0);
    // 玩家：18 + 1(ante) + 10(bet) - 0 = 29；结算前账本 = 18 + 1 + 5 = 24；delta = +5。
    expect(resolution.airDelta.player).toBe(5);
    // AI：18 + 0 + 0 - 0 = 18；结算前账本 = 18 + 1 + 5 = 24；delta = -6。
    expect(resolution.airDelta.ai).toBe(-6);
    // 负方 ante 消失 1。
    expect(resolution.vanishedAir).toBe(1);
  });

  it('ai wins symmetrically', () => {
    const player = lockedHand([
      heart('9'),
      heart('8'),
      heart('7'),
      heart('6'),
      heart('5'),
    ]);
    const ai = lockedHand([spade('A'), spade('K'), spade('Q'), spade('J'), spade('10')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: baseEscrow,
      playerAirAfterEscrow: airAfterEscrow,
      aiAirAfterEscrow: airAfterEscrow,
    });
    expect(resolution.winner).toBe('ai');
    expect(resolution.escrowDistribution.aiReceivedBet).toBe(10);
    // 玩家输：18 + 0 + 0 - 0 = 18；结算前账本 = 18 + 1 + 5 = 24；delta = -6。
    expect(resolution.airDelta.player).toBe(-6);
    // AI 赢：18 + 1 + 10 - 0 = 29；结算前账本 = 18 + 1 + 5 = 24；delta = +5。
    expect(resolution.airDelta.ai).toBe(5);
  });

  it('exact tie: both get own ante + own bet, vanishedAir = 0', () => {
    const { player, ai } = tiedHighCardHands();
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: baseEscrow,
      playerAirAfterEscrow: airAfterEscrow,
      aiAirAfterEscrow: airAfterEscrow,
    });
    expect(resolution.winner).toBe('tie');
    expect(resolution.reason).toBe('exactTie');
    expect(resolution.escrowDistribution).toStrictEqual({
      playerReceivedAnte: 1,
      aiReceivedAnte: 1,
      playerReceivedBet: 5,
      aiReceivedBet: 5,
    });
    expect(resolution.vanishedAir).toBe(0);
    // 平手：18 + 1 + 5 = 24；结算前账本同为 24，delta = 0。
    expect(resolution.airDelta.player).toBe(0);
    expect(resolution.airDelta.ai).toBe(0);
  });
});

describe('round-resolution/fold bet attribution', () => {
  it('player fold 5/5: aiReceivedBet = 10, playerReceivedBet = 0', () => {
    const { player, ai } = tiedHighCardHands();
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'playerFolded',
      escrow: baseEscrow,
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.winner).toBe('ai');
    expect(resolution.reason).toBe('playerFolded');
    expect(resolution.escrowDistribution.playerReceivedBet).toBe(0);
    expect(resolution.escrowDistribution.aiReceivedBet).toBe(10);
  });

  it('player fold after ai raise to 8: aiReceivedBet = 8 (own 3 + player 5)', () => {
    const { player, ai } = tiedHighCardHands();
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'playerFolded',
      escrow: { playerAnte: 1, aiAnte: 1, playerBet: 5, aiBet: 3 },
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 16,
    });
    expect(resolution.escrowDistribution.aiReceivedBet).toBe(8);
    expect(resolution.escrowDistribution.playerReceivedBet).toBe(0);
  });

  it('ai fold: player gets both bets', () => {
    const { player, ai } = tiedHighCardHands();
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'aiFolded',
      escrow: baseEscrow,
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.winner).toBe('player');
    expect(resolution.reason).toBe('aiFolded');
    expect(resolution.escrowDistribution.playerReceivedBet).toBe(10);
    expect(resolution.escrowDistribution.aiReceivedBet).toBe(0);
  });
});

describe('round-resolution/calamity', () => {
  it('triggers on overlapping effective cards and deducts loser bet', () => {
    // 双方共用 S-A：玩家强（皇家同花顺级别示意），AI 弱 → 玩家胜，loser = ai。
    const player = lockedHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const ai = lockedHand([spade('A'), heart('2'), diamond('3'), club('4'), heart('5')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: { playerAnte: 1, aiAnte: 1, playerBet: 5, aiBet: 5 },
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.calamity.triggered).toBe(true);
    expect(resolution.calamity.overlappingCardIds).toEqual(['S-A']);
    expect(resolution.calamity.loser).toBe('ai');
    // 输家 AI 额外扣 aiBet=5；vanishedAir = 灾厄5 + 负方ante1 = 6。
    expect(resolution.calamity.vanishedAir).toBe(5);
    expect(resolution.vanishedAir).toBe(6);
    // airBefore = 14 + ante1 + bet5 = 20。
    // AI：14 + 0 + 0 - 5(灾厄) = 9；delta = 9 - 20 = -11。
    expect(resolution.airDelta.ai).toBe(-11);
    // 玩家：14 + 1 + 10 - 0 = 25；delta = 25 - 20 = +5。
    expect(resolution.airDelta.player).toBe(5);
  });

  it('clamps loser deduction when air insufficient, vanishedAir stays owed', () => {
    const player = lockedHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const ai = lockedHand([spade('A'), heart('2'), diamond('3'), club('4'), heart('5')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: { playerAnte: 1, aiAnte: 1, playerBet: 5, aiBet: 5 },
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 2, // AI 仅剩 2，不足扣 5
    });
    expect(resolution.calamity.vanishedAir).toBe(5); // 仍按 5 记录
    // AI 实际只扣 2，结算后 Air 不会为负。
    // aiAirBefore = 2 + 1 + 5 = 8；aiAirAfter = 2 + 0 + 0 - 2 = 0；delta = -8。
    expect(resolution.airDelta.ai).toBe(-8);
  });

  it('Bet = 0 still records triggered with vanishedAir = 0 and no airDelta change', () => {
    const player = lockedHand([
      spade('A'),
      spade('K'),
      spade('Q'),
      spade('J'),
      spade('10'),
    ]);
    const ai = lockedHand([spade('A'), heart('2'), diamond('3'), club('4'), heart('5')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: { playerAnte: 1, aiAnte: 1, playerBet: 0, aiBet: 0 },
      playerAirAfterEscrow: 19,
      aiAirAfterEscrow: 19,
    });
    expect(resolution.calamity.triggered).toBe(true);
    expect(resolution.calamity.vanishedAir).toBe(0);
    // 玩家胜、Bet=0：19 + 1(ante) + 0(bet) - 0 = 20；delta = 20 - 20 = 0。
    expect(resolution.airDelta.player).toBe(0);
    // AI 输：19 + 0 + 0 - 0 = 19；delta = 19 - 20 = -1（仅负方 ante 消失）。
    expect(resolution.airDelta.ai).toBe(-1);
  });

  it('fold still triggers calamity with loser = fold side', () => {
    // 玩家 fold，双方共用 S-A → 灾厄触发，loser = player。
    const player = lockedHand([
      spade('A'),
      heart('K'),
      diamond('8'),
      club('5'),
      spade('2'),
    ]);
    const ai = lockedHand([spade('A'), heart('9'), diamond('7'), club('6'), spade('3')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'playerFolded',
      escrow: baseEscrow,
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.calamity.triggered).toBe(true);
    expect(resolution.calamity.loser).toBe('player');
    expect(resolution.calamity.vanishedAir).toBe(5); // playerBet
  });

  it('zero effective cards on one side never triggers', () => {
    const player = lockedHand([]); // 0 张有效牌
    const ai = lockedHand([spade('A'), heart('2'), diamond('3'), club('4'), heart('5')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: baseEscrow,
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.calamity.triggered).toBe(false);
  });
});

describe('round-resolution/discard card ids', () => {
  it('collects effective card ids deduped and sorted', () => {
    const player = lockedHand([spade('A'), heart('5'), diamond('9')]);
    const ai = lockedHand([spade('A'), club('K'), heart('2')]);
    const ids = collectDiscardCardIds(player, ai);
    expect(ids).toEqual(['C-K', 'D-9', 'H-2', 'H-5', 'S-A']);
  });

  it('resolution.discardCardIds excludes used cards and burns', () => {
    const player = lockedHand([spade('A'), heart('5')]);
    const ai = lockedHand([diamond('9'), club('K')]);
    const resolution = resolveOk({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: baseEscrow,
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(resolution.discardCardIds).toEqual(['C-K', 'D-9', 'H-5', 'S-A']);
  });
});

describe('round-resolution/error handling', () => {
  it('returns invalid-escrow on negative or non-integer escrow', () => {
    const { player, ai } = tiedHighCardHands();
    const result = resolveRound({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: { playerAnte: -1, aiAnte: 1, playerBet: 5, aiBet: 5 },
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid-escrow' });
  });

  it('returns invalid-escrow on non-integer bet', () => {
    const { player, ai } = tiedHighCardHands();
    const result = resolveRound({
      playerHand: player,
      aiHand: ai,
      foldState: 'none',
      escrow: { playerAnte: 1, aiAnte: 1, playerBet: 5.5, aiBet: 5 },
      playerAirAfterEscrow: 14,
      aiAirAfterEscrow: 14,
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid-escrow' });
  });
});

describe('round-resolution/locked hand contract', () => {
  it('selectedCards length is 5 and effectiveCards subset', () => {
    const player = lockedHand([spade('A'), heart('5')]);
    expect(player.selectedCards.length).toBe(5);
    const selectedIds = new Set(player.selectedCards.map((c) => c.id));
    for (const card of player.effectiveCards) {
      expect(selectedIds.has(card.id)).toBe(true);
    }
    expect(player.effectiveCards.length).toBeLessThanOrEqual(5);
  });

  it('evaluatedHand is computed from effectiveCards', () => {
    const effective = [spade('A'), spade('K'), spade('Q'), spade('J'), spade('10')];
    const hand = lockedHand(effective);
    expect(hand.evaluatedHand.category).toBe('RoyalStraightFlush');
  });
});
