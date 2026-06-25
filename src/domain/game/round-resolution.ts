// 回合结算账本：胜负、参加费、Bet escrow、灾厄、弃牌区候选。
// 详见 `doc/v1-implementation-design/06-round-resolution-and-calamity.md`。
//
// 本模块只做账本计算，不直接修改 GameState，由 game reducer 合并结果。

import { type Card, type CardId } from '../cards/card';
import { createAppError } from '../errors';
import {
  compareEvaluatedHands,
  type EvaluatedHand,
  type HandCompareResult,
} from '../hand/hand-evaluator';
import { applyCalamityPenalty, detectCalamity } from '../calamity/calamity-engine';

export type RoundWinner = 'player' | 'ai' | 'tie';
export type FoldState = 'none' | 'playerFolded' | 'aiFolded';
export type RoundReason = 'handComparison' | 'playerFolded' | 'aiFolded' | 'exactTie';

// 本回合 escrow 账本。下注额已在 Bet 阶段扣入 escrow。
export type RoundEscrow = {
  playerAnte: number;
  aiAnte: number;
  playerBet: number;
  aiBet: number;
};

// 锁定成手。selectedCards 长度 5；effectiveCards 是其去掉失效用过牌的子集。
export type LockedHand = {
  selectedCards: Card[];
  effectiveCards: Card[];
  evaluatedHand: EvaluatedHand;
};

export type CalamityResult = {
  triggered: boolean;
  overlappingCardIds: CardId[];
  loser: 'player' | 'ai' | null;
  vanishedAir: number;
};

export type AirDelta = {
  player: number;
  ai: number;
};

export type EscrowDistribution = {
  playerReceivedAnte: number;
  aiReceivedAnte: number;
  playerReceivedBet: number;
  aiReceivedBet: number;
};

export type RoundResolution = {
  winner: RoundWinner;
  reason: RoundReason;
  airDelta: AirDelta;
  calamity: CalamityResult;
  discardCardIds: CardId[];
  escrowDistribution: EscrowDistribution;
  vanishedAir: number;
};

export type RoundResolutionResult =
  | { ok: true; resolution: RoundResolution }
  | { ok: false; code: string };

export type ResolveRoundInput = {
  playerHand: LockedHand;
  aiHand: LockedHand;
  foldState: FoldState;
  escrow: RoundEscrow;
  playerAirAfterEscrow: number;
  aiAirAfterEscrow: number;
};

export type DetermineRoundWinnerInput = {
  playerEvaluatedHand: EvaluatedHand;
  aiEvaluatedHand: EvaluatedHand;
  foldState: FoldState;
};

export type RoundWinnerResult = {
  winner: RoundWinner;
  reason: RoundReason;
  compareResult: HandCompareResult;
};

export type AnteSettlement = {
  playerReceivedAnte: number;
  aiReceivedAnte: number;
  vanishedAir: number;
};

export type BetSettlement = {
  playerReceivedBet: number;
  aiReceivedBet: number;
};

// ---------- 校验 ----------

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateEscrow(escrow: RoundEscrow): void {
  const { playerAnte, aiAnte, playerBet, aiBet } = escrow;
  if (
    !isNonNegativeInteger(playerAnte) ||
    !isNonNegativeInteger(aiAnte) ||
    !isNonNegativeInteger(playerBet) ||
    !isNonNegativeInteger(aiBet)
  ) {
    throw createAppError('invalid-escrow', 'escrow 字段为负或非整数', {
      details: { playerAnte, aiAnte, playerBet, aiBet },
    });
  }
}

// ---------- 胜负判定 ----------

export function determineRoundWinner(
  input: DetermineRoundWinnerInput,
): RoundWinnerResult {
  const { playerEvaluatedHand, aiEvaluatedHand, foldState } = input;

  if (foldState === 'playerFolded') {
    return { winner: 'ai', reason: 'playerFolded', compareResult: 0 };
  }

  if (foldState === 'aiFolded') {
    return { winner: 'player', reason: 'aiFolded', compareResult: 0 };
  }

  // foldState === 'none'：牌型比较。
  // compareEvaluatedHands(player, ai)：返回 1 → 玩家更强；-1 → AI 更强；0 → 平手。
  const compareResult = compareEvaluatedHands(playerEvaluatedHand, aiEvaluatedHand);

  if (compareResult > 0) {
    return { winner: 'player', reason: 'handComparison', compareResult };
  }
  if (compareResult < 0) {
    return { winner: 'ai', reason: 'handComparison', compareResult };
  }
  return { winner: 'tie', reason: 'exactTie', compareResult };
}

// ---------- 参加费结算 ----------

export function settleAnte(escrow: RoundEscrow, winner: RoundWinner): AnteSettlement {
  validateEscrow(escrow);

  if (winner === 'player') {
    return {
      playerReceivedAnte: escrow.playerAnte,
      aiReceivedAnte: 0,
      vanishedAir: escrow.aiAnte,
    };
  }

  if (winner === 'ai') {
    return {
      playerReceivedAnte: 0,
      aiReceivedAnte: escrow.aiAnte,
      vanishedAir: escrow.playerAnte,
    };
  }

  // 平手：双方各拿回自己参加费。
  return {
    playerReceivedAnte: escrow.playerAnte,
    aiReceivedAnte: escrow.aiAnte,
    vanishedAir: 0,
  };
}

// ---------- Bet escrow 结算 ----------

// Fold 后 Bet 归属规则（不依赖牌型比较）：
// - 玩家 fold：玩家下注归 AI，AI 下注退还 AI 自己。
// - AI fold：AI 下注归玩家，玩家下注退还玩家自己。
// - 非 fold：胜方拿 playerBet + aiBet，负方 0；平手各自取回。
function settleBetEscrowWithReason(
  escrow: RoundEscrow,
  winner: RoundWinner,
  reason: RoundReason,
): BetSettlement {
  if (reason === 'playerFolded') {
    return {
      playerReceivedBet: 0,
      aiReceivedBet: escrow.playerBet + escrow.aiBet,
    };
  }

  if (reason === 'aiFolded') {
    return {
      playerReceivedBet: escrow.playerBet + escrow.aiBet,
      aiReceivedBet: 0,
    };
  }

  if (winner === 'player') {
    return {
      playerReceivedBet: escrow.playerBet + escrow.aiBet,
      aiReceivedBet: 0,
    };
  }

  if (winner === 'ai') {
    return {
      playerReceivedBet: 0,
      aiReceivedBet: escrow.playerBet + escrow.aiBet,
    };
  }

  // 平手：各自取回。
  return {
    playerReceivedBet: escrow.playerBet,
    aiReceivedBet: escrow.aiBet,
  };
}

export function settleBetEscrow(escrow: RoundEscrow, winner: RoundWinner): BetSettlement {
  validateEscrow(escrow);
  // settleBetEscrow 的对外契约只接收 winner，reason 由 winner 推导：
  // 平手 → exactTie 语义；非平手 → 胜方全拿。Fold 场景由 resolveRound 内部
  // 直接调用 settleBetEscrowWithReason 传入 reason，故本函数按非 fold 口径处理。
  if (winner === 'tie') {
    return {
      playerReceivedBet: escrow.playerBet,
      aiReceivedBet: escrow.aiBet,
    };
  }
  return settleBetEscrowWithReason(escrow, winner, 'handComparison');
}

// ---------- 弃牌区候选 ----------

function sortCardIdsAsc(ids: CardId[]): CardId[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function collectDiscardCardIds(
  playerHand: LockedHand,
  aiHand: LockedHand,
): CardId[] {
  const ids = new Set<CardId>();
  for (const card of playerHand.effectiveCards) {
    ids.add(card.id);
  }
  for (const card of aiHand.effectiveCards) {
    ids.add(card.id);
  }
  return sortCardIdsAsc([...ids]);
}

// ---------- 完整结算 ----------

// 推导灾厄输家：fold 方为输家；非 fold 时输家为胜方的反面；平手无输家。
function deriveLoser(winner: RoundWinner, foldState: FoldState): 'player' | 'ai' | null {
  if (foldState === 'playerFolded') {
    return 'player';
  }
  if (foldState === 'aiFolded') {
    return 'ai';
  }
  if (winner === 'player') {
    return 'ai';
  }
  if (winner === 'ai') {
    return 'player';
  }
  return null;
}

export function resolveRound(input: ResolveRoundInput): RoundResolutionResult {
  const {
    playerHand,
    aiHand,
    foldState,
    escrow,
    playerAirAfterEscrow,
    aiAirAfterEscrow,
  } = input;

  if (playerHand === null || aiHand === null) {
    return { ok: false, code: 'missing-locked-hand' };
  }

  try {
    validateEscrow(escrow);
  } catch {
    return { ok: false, code: 'invalid-escrow' };
  }

  // 1. 胜负。
  const winnerResult = determineRoundWinner({
    playerEvaluatedHand: playerHand.evaluatedHand,
    aiEvaluatedHand: aiHand.evaluatedHand,
    foldState,
  });

  // 2. 参加费结算。
  const anteSettlement = settleAnte(escrow, winnerResult.winner);

  // 3. Bet escrow 结算（按 reason 处理 fold 归属）。
  const betSettlement = settleBetEscrowWithReason(
    escrow,
    winnerResult.winner,
    winnerResult.reason,
  );

  // 4. 灾厄判定（基于 effectiveCards，fold 后仍判定）。
  const detection = detectCalamity(playerHand.effectiveCards, aiHand.effectiveCards);
  const loser = deriveLoser(winnerResult.winner, foldState);

  // 5. 灾厄扣减。输家 Air 以 escrow 后余额为基准。
  const penalty = applyCalamityPenalty({
    triggered: detection.triggered,
    loser,
    escrow,
    playerAir: playerAirAfterEscrow,
    aiAir: aiAirAfterEscrow,
  });

  // 6. Air 净变化计算。
  //
  // 结算前 Air 已经扣除了呼吸、参加费、下注（即 *AirAfterEscrow）。
  // 结算后 Air = escrow 后余额 + 收回的参加费 + 收回/赢得的 Bet - 灾厄扣减。
  const playerAirAfter =
    playerAirAfterEscrow +
    anteSettlement.playerReceivedAnte +
    betSettlement.playerReceivedBet -
    penalty.playerDeduction;
  const aiAirAfter =
    aiAirAfterEscrow +
    anteSettlement.aiReceivedAnte +
    betSettlement.aiReceivedBet -
    penalty.aiDeduction;

  // airDelta 是从结算前（escrow 前）到结算后的净变化。
  // 结算前 = escrow 后余额 + 已扣的参加费 + 已扣的下注。
  const playerAirBefore = playerAirAfterEscrow + escrow.playerAnte + escrow.playerBet;
  const aiAirBefore = aiAirAfterEscrow + escrow.aiAnte + escrow.aiBet;

  const airDelta: AirDelta = {
    player: playerAirAfter - playerAirBefore,
    ai: aiAirAfter - aiAirBefore,
  };

  // 7. vanishedAir = 灾厄消失 + 负方 ante 消失。
  const vanishedAir = anteSettlement.vanishedAir + penalty.vanishedAir;

  // 8. 弃牌区候选。
  const discardCardIds = collectDiscardCardIds(playerHand, aiHand);

  const resolution: RoundResolution = {
    winner: winnerResult.winner,
    reason: winnerResult.reason,
    airDelta,
    calamity: {
      triggered: detection.triggered,
      overlappingCardIds: detection.overlappingCardIds,
      loser,
      vanishedAir: penalty.vanishedAir,
    },
    discardCardIds,
    escrowDistribution: {
      playerReceivedAnte: anteSettlement.playerReceivedAnte,
      aiReceivedAnte: anteSettlement.aiReceivedAnte,
      playerReceivedBet: betSettlement.playerReceivedBet,
      aiReceivedBet: betSettlement.aiReceivedBet,
    },
    vanishedAir,
  };

  return { ok: true, resolution };
}
