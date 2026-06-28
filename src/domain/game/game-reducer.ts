// gameReducer：V1 唯一状态变更入口（纯函数）。详见
// `doc/v1-implementation-design/07-game-state-and-round-flow.md`。
//
// 规则约束：
// - 纯函数，不读时间 / 随机 / localStorage，不调用 AI（AI 决策由系统动作注入）。
// - 非法动作写入 lastError，不抛异常导致 UI 崩溃。
// - currentRound 用 discriminated union 表达，phase 作为顶层判别符收窄字段。

import type { BetAction, BetState } from '../betting/betting-rules';
import { applyBetAction, createInitialBetState } from '../betting/betting-engine';
import type { Card, CardId } from '../cards/card';
import {
  markNumberCardUsed,
  type NumberCard,
  type NumberCardId,
} from '../cards/number-card-generator';
import { moveEffectiveCardsToDiscard } from '../cards/deck-state';
import { evaluateHand, rankSolvedHands } from '../hand/hand-evaluator';
import {
  createSelectableCards,
  isNumberCardSolvable,
  solveHands,
} from '../hand/hand-solver';
import { createEmptyPlayerPossibleHandSummary } from '../ai/lower-ai';
import { createPlayerPossibleHandSummary } from '../ai/ai-controller';
import { detectCalamity } from '../calamity/calamity-engine';
import type { LastResultSummary, Outcome, EndReason, Settings } from '../../app/settings';
import type { ErrorPayload } from '../errors';
import type { Ante, CurrentRound, GameState, RoundHistoryEntry } from './game-state';
import type { GameAction } from './game-actions';
import type {
  FoldState,
  LockedHand,
  RoundEscrow,
  RoundResolution,
} from './round-resolution';
import { resolveRound } from './round-resolution';

// ---------- 常量 ----------

const BREATHING_COST = 1;
const MAX_ROUND_NUMBER = 5;
const TIEBREAKER_ANTE = 5;
const INITIAL_AIR = 25;

// ---------- 工具 ----------

function setError(state: GameState, code: string, message: string): GameState {
  const lastError: ErrorPayload = { code, message, phase: state.phase };
  return { ...state, lastError };
}

function clearError(state: GameState): GameState {
  if (state.lastError === null) {
    return state;
  }
  return { ...state, lastError: null };
}

function roundAnte(state: GameState): number {
  return state.isTiebreaker ? TIEBREAKER_ANTE : state.roundNumber;
}

function findNumberCard(cards: NumberCard[], id: NumberCardId): NumberCard | undefined {
  return cards.find((card) => card.id === id);
}

function hasAvailableSolvableNumberCard(cards: NumberCard[], drawPile: Card[]): boolean {
  return cards.some(
    (card) => card.status === 'available' && isNumberCardSolvable(card.value, drawPile),
  );
}

// handId = effectiveCards id 按字典序 join（与 03 附录 B stable order 一致）。
function buildHandId(cards: Card[]): string {
  return [...cards]
    .map((card) => card.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(',');
}

function buildLockedHand(effectiveCards: Card[]): LockedHand {
  return {
    selectedCards: [...effectiveCards],
    effectiveCards: [...effectiveCards],
    evaluatedHand: evaluateHand(effectiveCards),
  };
}

function emptySummary() {
  return createEmptyPlayerPossibleHandSummary(0);
}

// ---------- 初始状态 ----------

export function createIdleState(settingsSnapshot: Settings): GameState {
  return {
    version: 1,
    seed: '',
    phase: 'idle',
    roundNumber: 0,
    isTiebreaker: false,
    playerAir: INITIAL_AIR,
    aiAir: INITIAL_AIR,
    deckState: { drawPile: [], discardPile: [], burnCards: [] },
    numberCards: { player: [], ai: [] },
    currentRound: { phase: 'idle' },
    roundHistory: [],
    settingsSnapshot,
    lastError: null,
    playerPool: 0,
    aiPool: 0,
  };
}

// ---------- 初始化 ----------

function applyInitializationSucceeded(
  state: GameState,
  action: Extract<GameAction, { type: 'initializationSucceeded' }>,
): GameState {
  return {
    ...clearError(state),
    seed: action.seed,
    phase: 'roundStart',
    roundNumber: 1,
    isTiebreaker: false,
    playerAir: INITIAL_AIR,
    aiAir: INITIAL_AIR,
    deckState: action.deckState,
    numberCards: action.numberCards,
    currentRound: {
      phase: 'roundStart',
      roundCosts: { breathing: BREATHING_COST, playerAnte: 0, aiAnte: 0 },
    },
    roundHistory: [],
    playerPool: 0,
    aiPool: 0,
  };
}

// ---------- 回合扣费 ----------

function applyRoundCosts(state: GameState): GameState {
  if (state.phase !== 'roundStart') {
    return setError(state, 'wrong-phase', 'applyRoundCosts 仅在 roundStart 阶段可用');
  }

  const ante = roundAnte(state);
  const playerAir = state.playerAir;
  const aiAir = state.aiAir;

  // 1. 呼吸成本：双方各扣 1。严格按文档「某方不足 1 进入 gameOver」——
  //    不足时只对不足方处理，够的一方不扣这 1 点呼吸。
  const playerShortBreath = playerAir < BREATHING_COST;
  const aiShortBreath = aiAir < BREATHING_COST;
  if (playerShortBreath || aiShortBreath) {
    const deducted: GameState = {
      ...state,
      playerAir: playerShortBreath ? 0 : playerAir,
      aiAir: aiShortBreath ? 0 : aiAir,
    };
    return finishGameFromEarly(
      setError(deducted, 'cannotPayBreathingCost', '某方 Air 不足以支付呼吸成本'),
      'earlyTermination',
    );
  }

  // 2. 参加费：双方各扣 R（决胜 R=5）。呼吸扣减不回滚。
  const playerShortAnte = playerAir - BREATHING_COST < ante;
  const aiShortAnte = aiAir - BREATHING_COST < ante;
  if (playerShortAnte || aiShortAnte) {
    // 双方同时不足参加费：按文档「双方 Air 归零」进入 gameOver。
    // 单方不足：不足方扣到 0（参加费按应有额扣但 Air 不为负），够方扣参加费。
    const bothShort = playerShortAnte && aiShortAnte;
    const deducted: GameState = {
      ...state,
      playerAir: bothShort ? 0 : playerShortAnte ? 0 : playerAir - BREATHING_COST - ante,
      aiAir: bothShort ? 0 : aiShortAnte ? 0 : aiAir - BREATHING_COST - ante,
    };
    return finishGameFromEarly(
      setError(deducted, 'cannotPayAnte', '某方 Air 不足以支付参加费'),
      'earlyTermination',
    );
  }

  return {
    ...clearError(state),
    playerAir: playerAir - BREATHING_COST - ante,
    aiAir: aiAir - BREATHING_COST - ante,
    phase: 'lowerSelect',
    currentRound: {
      phase: 'lowerSelect',
      publicTargets: {
        playerNumberCardId: null,
        aiNumberCardId: null,
        playerTargetValue: null,
        aiTargetValue: null,
      },
      numberCardCost: ante,
      ante: { playerAnte: ante, aiAnte: ante } satisfies Ante,
    },
  };
}

// ---------- 下层选牌 ----------

function applyAiSelectedNumberCard(
  state: GameState,
  action: Extract<GameAction, { type: 'aiSelectedNumberCard' }>,
): GameState {
  if (state.phase !== 'lowerSelect') {
    return setError(
      state,
      'wrong-phase',
      'aiSelectedNumberCard 仅在 lowerSelect 阶段可用',
    );
  }
  const lower = state.currentRound;
  const aiCard = findNumberCard(state.numberCards.ai, action.numberCardId);
  if (aiCard === undefined) {
    return setError(state, 'number-card-not-found', 'AI 数字牌不存在');
  }
  if (aiCard.status !== 'available') {
    return setError(state, 'number-card-already-used', 'AI 数字牌已使用');
  }

  return {
    ...clearError(state),
    currentRound: {
      phase: 'lowerSelect',
      publicTargets: {
        ...lower.publicTargets,
        aiNumberCardId: aiCard.id,
        aiTargetValue: aiCard.value,
      },
      numberCardCost: lower.numberCardCost,
      ante: lower.ante,
    },
  } as GameState;
}

function applySelectNumberCard(
  state: GameState,
  action: Extract<GameAction, { type: 'selectNumberCard' }>,
): GameState {
  if (state.phase !== 'lowerSelect') {
    return setError(state, 'wrong-phase', 'selectNumberCard 仅在 lowerSelect 阶段可用');
  }
  const lower = state.currentRound;

  if (lower.publicTargets.aiNumberCardId === null) {
    return setError(state, 'missing-ai-number-card', 'AI 数字牌尚未预选');
  }

  const marked = markNumberCardUsed(state.numberCards.player, action.numberCardId);
  if (!marked.ok) {
    return setError(state, marked.code, '玩家数字牌选择失败');
  }
  const playerCard = findNumberCard(state.numberCards.player, action.numberCardId);

  return {
    ...clearError(state),
    numberCards: { player: marked.cards, ai: state.numberCards.ai },
    phase: 'solveHands',
    currentRound: {
      phase: 'solveHands',
      publicTargets: {
        ...lower.publicTargets,
        playerNumberCardId: playerCard!.id,
        playerTargetValue: playerCard!.value,
      },
      playerPossibleHandSummary: emptySummary(),
    },
  };
}

// ---------- 枚举成手 ----------

function applySolveHandsSucceeded(
  state: GameState,
  action: Extract<GameAction, { type: 'solveHandsSucceeded' }>,
): GameState {
  if (state.phase !== 'solveHands') {
    return setError(state, 'wrong-phase', 'solveHandsSucceeded 仅在 solveHands 阶段可用');
  }
  const solve = state.currentRound;

  if (action.playerCandidateHands.length === 0) {
    return setError(state, 'initial-hand-unsolvable', '玩家无可解候选成手');
  }

  return {
    ...clearError(state),
    phase: 'upperSelect',
    currentRound: {
      phase: 'upperSelect',
      publicTargets: solve.publicTargets,
      playerCandidateHands: action.playerCandidateHands,
      playerPossibleHandSummary: action.playerPossibleHandSummary,
      playerLockedHand: null,
      autoLocked: false,
      aiLockedHand: null,
    },
  };
}

// ---------- 上层锁定 ----------

function applyLockPlayerHand(
  state: GameState,
  action: Extract<GameAction, { type: 'lockPlayerHand' }>,
): GameState {
  if (state.phase !== 'upperSelect') {
    return setError(state, 'wrong-phase', 'lockPlayerHand 仅在 upperSelect 阶段可用');
  }
  const upper = state.currentRound;
  const target = upper.playerCandidateHands.find(
    (ranked) => buildHandId(ranked.solvedHand.effectiveCards) === action.handId,
  );
  if (target === undefined) {
    return setError(state, 'invalid-hand-selection', '候选成手不存在');
  }
  const locked = buildLockedHand(target.solvedHand.effectiveCards);
  return {
    ...clearError(state),
    currentRound: {
      phase: 'upperSelect',
      publicTargets: upper.publicTargets,
      playerCandidateHands: upper.playerCandidateHands,
      playerPossibleHandSummary: upper.playerPossibleHandSummary,
      playerLockedHand: locked,
      autoLocked: false,
      aiLockedHand: upper.aiLockedHand,
    },
  } as GameState;
}

function applyAutoLockRecommendedHand(state: GameState): GameState {
  if (state.phase !== 'upperSelect') {
    return setError(
      state,
      'wrong-phase',
      'autoLockRecommendedHand 仅在 upperSelect 阶段可用',
    );
  }
  const upper = state.currentRound;
  const recommended = upper.playerCandidateHands[0];
  if (recommended === undefined) {
    return setError(state, 'initial-hand-unsolvable', '玩家无可锁定成手');
  }
  const locked = buildLockedHand(recommended.solvedHand.effectiveCards);
  return {
    ...clearError(state),
    currentRound: {
      phase: 'upperSelect',
      publicTargets: upper.publicTargets,
      playerCandidateHands: upper.playerCandidateHands,
      playerPossibleHandSummary: upper.playerPossibleHandSummary,
      playerLockedHand: locked,
      autoLocked: true,
      aiLockedHand: upper.aiLockedHand,
    },
  } as GameState;
}

function applyAiLockedHand(
  state: GameState,
  action: Extract<GameAction, { type: 'aiLockedHand' }>,
): GameState {
  if (state.phase !== 'upperSelect') {
    return setError(state, 'wrong-phase', 'aiLockedHand 仅在 upperSelect 阶段可用');
  }
  const upper = state.currentRound;
  return {
    ...clearError(state),
    currentRound: {
      phase: 'upperSelect',
      publicTargets: upper.publicTargets,
      playerCandidateHands: upper.playerCandidateHands,
      playerPossibleHandSummary: upper.playerPossibleHandSummary,
      playerLockedHand: upper.playerLockedHand,
      autoLocked: upper.autoLocked,
      aiLockedHand: action.hand,
    },
  } as GameState;
}

function applyEnterBetting(
  state: GameState,
  action: Extract<GameAction, { type: 'enterBetting' }>,
): GameState {
  if (state.phase !== 'upperSelect') {
    return setError(state, 'wrong-phase', 'enterBetting 仅在 upperSelect 阶段可用');
  }
  const upper = state.currentRound;

  if (upper.aiLockedHand === null) {
    return setError(state, 'missing-ai-locked-hand', 'AI 尚未锁定成手');
  }

  let playerLocked = upper.playerLockedHand;
  let autoLocked = upper.autoLocked;
  if (playerLocked === null) {
    const recommended = upper.playerCandidateHands[0];
    if (recommended === undefined) {
      return setError(state, 'initial-hand-unsolvable', '玩家无可锁定成手');
    }
    playerLocked = buildLockedHand(recommended.solvedHand.effectiveCards);
    autoLocked = true;
  }

  const betState: BetState = createInitialBetState({
    playerAvailableAir: state.playerAir,
    aiAvailableAir: state.aiAir,
  });
  betState.turnStartedAt = action.now();

  const ante = roundAnte(state);

  return {
    ...clearError(state),
    phase: 'betting',
    currentRound: {
      phase: 'betting',
      publicTargets: upper.publicTargets,
      playerPossibleHandSummary: upper.playerPossibleHandSummary,
      playerLockedHand: playerLocked,
      aiLockedHand: upper.aiLockedHand,
      betState,
      betActions: [],
      foldState: 'none',
      autoLocked,
      ante: { playerAnte: ante, aiAnte: ante },
    },
  };
}

// ---------- 下注 ----------

function applySubmitBetAction(
  state: GameState,
  action: Extract<GameAction, { type: 'submitBetAction' }>,
): GameState {
  if (state.phase !== 'betting') {
    return setError(state, 'wrong-phase', 'submitBetAction 仅在 betting 阶段可用');
  }
  const betting = state.currentRound;
  const options = action.now === undefined ? {} : { now: action.now };
  const result = applyBetAction(betting.betState, action.action, options);
  if (!result.ok) {
    return setError(state, result.code, '下注动作非法');
  }

  const betActions: BetAction[] = [...betting.betActions, action.action];
  let foldState: FoldState = betting.foldState;
  if (action.action.type === 'fold') {
    foldState = action.action.actor === 'player' ? 'playerFolded' : 'aiFolded';
  }

  return {
    ...clearError(state),
    currentRound: {
      phase: 'betting',
      publicTargets: betting.publicTargets,
      playerPossibleHandSummary: betting.playerPossibleHandSummary,
      playerLockedHand: betting.playerLockedHand,
      aiLockedHand: betting.aiLockedHand,
      betState: result.state,
      betActions,
      foldState,
      autoLocked: betting.autoLocked,
      ante: betting.ante,
    },
  } as GameState;
}

function applyAiSubmittedBetAction(
  state: GameState,
  action: Extract<GameAction, { type: 'aiSubmittedBetAction' }>,
): GameState {
  const forwarded: Extract<GameAction, { type: 'submitBetAction' }> = {
    type: 'submitBetAction',
    action: action.action,
  };
  if (action.now !== undefined) {
    forwarded.now = action.now;
  }
  return applySubmitBetAction(state, forwarded);
}

function applyBetClosed(state: GameState): GameState {
  if (state.phase !== 'betting') {
    return setError(state, 'wrong-phase', 'betClosed 仅在 betting 阶段可用');
  }
  const betting = state.currentRound;

  return {
    ...clearError(state),
    phase: 'showdown',
    currentRound: {
      phase: 'showdown',
      publicTargets: betting.publicTargets,
      playerLockedHand: betting.playerLockedHand,
      aiLockedHand: betting.aiLockedHand,
      showdown: {
        playerLockedHand: betting.playerLockedHand,
        aiLockedHand: betting.aiLockedHand,
        overlappingCardIds: detectCalamity(
          betting.playerLockedHand.effectiveCards,
          betting.aiLockedHand.effectiveCards,
        ).overlappingCardIds,
      },
      foldState: betting.foldState,
      ante: betting.ante,
      betState: betting.betState,
      betActions: betting.betActions,
    },
  };
}

function applyShowdown(state: GameState): GameState {
  if (state.phase !== 'showdown') {
    return setError(state, 'wrong-phase', 'showdown 仅在 showdown 阶段可用');
  }
  const showdown = state.currentRound;
  return {
    ...clearError(state),
    phase: 'resolve',
    currentRound: {
      phase: 'resolve',
      publicTargets: showdown.publicTargets,
      playerLockedHand: showdown.playerLockedHand,
      aiLockedHand: showdown.aiLockedHand,
      resolution: null as unknown as RoundResolution,
      foldState: showdown.foldState,
      ante: showdown.ante,
      betState: showdown.betState,
      betActions: showdown.betActions,
    },
  };
}

// ---------- 结算 ----------

function applyResolveRound(state: GameState): GameState {
  if (state.phase !== 'resolve') {
    return setError(state, 'wrong-phase', 'resolveRound 仅在 resolve 阶段可用');
  }
  const resolve = state.currentRound;
  const betState = resolve.betState;

  const escrow: RoundEscrow = {
    playerAnte: resolve.ante.playerAnte,
    aiAnte: resolve.ante.aiAnte,
    playerBet: betState.playerBet,
    aiBet: betState.aiBet,
  };

  // playerAirAfterEscrow：扣完呼吸 + 参加费 + 下注后的余额 = 当前 playerAir
  // （reducer 在扣费 / 下注时已实时扣减 Air）。
  // publicTargets 在 resolve 入口校验非空（resolveRound 内部也会校验并返回
  // missing-public-target），避免 appendRoundHistory 用非空断言读 null。
  const result = resolveRound({
    playerHand: resolve.playerLockedHand,
    aiHand: resolve.aiLockedHand,
    foldState: resolve.foldState,
    escrow,
    playerAirAfterEscrow: state.playerAir,
    aiAirAfterEscrow: state.aiAir,
    publicTargets: resolve.publicTargets,
  });
  if (!result.ok) {
    return setError(state, result.code, '回合结算失败');
  }
  const resolution = result.resolution;

  const playerAir = state.playerAir + resolution.airDelta.player;
  const aiAir = state.aiAir + resolution.airDelta.ai;

  // 弃牌区更新：effectiveCards 实体移入 discardPile。
  const discardCards = collectDiscardCards(state, resolution.discardCardIds);
  const deckState = moveEffectiveCardsToDiscard(state.deckState, discardCards);

  // 累计赢得底池（净赢得 Bet）。
  const playerPool =
    state.playerPool +
    (resolution.escrowDistribution.playerReceivedBet - escrow.playerBet);
  const aiPool =
    state.aiPool + (resolution.escrowDistribution.aiReceivedBet - escrow.aiBet);

  const roundHistory = appendRoundHistory(state, resolve, escrow, resolution);

  const next: GameState = {
    ...clearError(state),
    playerAir,
    aiAir,
    deckState,
    playerPool,
    aiPool,
    roundHistory,
    phase: 'roundSummary',
    currentRound: {
      phase: 'roundSummary',
      publicTargets: resolve.publicTargets,
      playerLockedHand: resolve.playerLockedHand,
      aiLockedHand: resolve.aiLockedHand,
      resolution,
      foldState: resolve.foldState,
      ante: resolve.ante,
      betState: resolve.betState,
      betActions: resolve.betActions,
    },
  };

  // Air 归零检查：任一方 ≤ 0 进入 gameOver。
  if (playerAir <= 0 || aiAir <= 0) {
    return finishGameFromAir(next);
  }
  return next;
}

function collectDiscardCards(state: GameState, ids: CardId[]): Card[] {
  const byId = new Map<CardId, Card>();
  for (const card of state.deckState.drawPile) {
    byId.set(card.id, card);
  }
  for (const card of state.deckState.discardPile) {
    byId.set(card.id, card);
  }
  return ids.map((id) => byId.get(id)!).filter((card) => card !== undefined);
}

function appendRoundHistory(
  state: GameState,
  resolve: Extract<CurrentRound, { phase: 'resolve' }>,
  escrow: RoundEscrow,
  resolution: RoundResolution,
): RoundHistoryEntry[] {
  // resolveRound 已校验 publicTargets 四字段非空（缺失返回 missing-public-target），
  // 调用方在 result.ok 为 true 后才走到这里，故字段必然有值。
  // 用显式兜底取值，避免非空断言掩盖上游漏写。
  const publicTargets = resolve.publicTargets;
  const entry: RoundHistoryEntry = {
    roundNumber: state.roundNumber,
    isTiebreaker: state.isTiebreaker,
    playerNumberCardId: publicTargets.playerNumberCardId ?? ('' as NumberCardId),
    aiNumberCardId: publicTargets.aiNumberCardId ?? ('' as NumberCardId),
    playerTargetValue: publicTargets.playerTargetValue ?? 0,
    aiTargetValue: publicTargets.aiTargetValue ?? 0,
    playerHand: resolve.playerLockedHand,
    aiHand: resolve.aiLockedHand,
    betActions: resolve.betActions,
    foldState: resolve.foldState,
    resolution,
    escrow,
  };
  return [...state.roundHistory, entry];
}

// ---------- 下一回合 / 决胜 / 结束 ----------

function applyContinueToNextRound(state: GameState): GameState {
  if (state.phase !== 'roundSummary') {
    return setError(
      state,
      'wrong-phase',
      'continueToNextRound 仅在 roundSummary 阶段可用',
    );
  }

  // R5（含决胜）结束判定。
  if (state.roundNumber >= MAX_ROUND_NUMBER) {
    if (state.playerAir !== state.aiAir) {
      return finishGameFromAir(state);
    }
    if (state.playerPool !== state.aiPool) {
      return finishGameFromPool(state);
    }
    if (!state.isTiebreaker) {
      // 进入一次决胜回合（无可用可解数字牌则判负 / 平）。
      return enterTiebreakerOrFinish(state);
    }
    // 决胜后仍平：判平局。
    return finishGame(state, 'tie', 'draw');
  }

  // 常规下一回合。
  return {
    ...clearError(state),
    roundNumber: state.roundNumber + 1,
    phase: 'roundStart',
    currentRound: {
      phase: 'roundStart',
      roundCosts: { breathing: BREATHING_COST, playerAnte: 0, aiAnte: 0 },
    },
  };
}

function enterTiebreakerOrFinish(state: GameState): GameState {
  const drawPile = state.deckState.drawPile;
  const playerCanPlay = hasAvailableSolvableNumberCard(
    state.numberCards.player,
    drawPile,
  );
  const aiCanPlay = hasAvailableSolvableNumberCard(state.numberCards.ai, drawPile);

  if (!playerCanPlay && !aiCanPlay) {
    return finishGame(state, 'tie', 'draw');
  }
  if (!playerCanPlay) {
    return finishGame(state, 'aiWin', 'earlyTermination');
  }
  if (!aiCanPlay) {
    return finishGame(state, 'playerWin', 'earlyTermination');
  }

  return {
    ...clearError(state),
    isTiebreaker: true,
    roundNumber: MAX_ROUND_NUMBER,
    phase: 'roundStart',
    currentRound: {
      phase: 'roundStart',
      roundCosts: { breathing: BREATHING_COST, playerAnte: 0, aiAnte: 0 },
    },
  };
}

// 提前结束（呼吸 / 参加费不足）：按 Air 判定胜负 / 平局。
function finishGameFromEarly(state: GameState, endReason: EndReason): GameState {
  if (state.playerAir > state.aiAir) {
    return finishGame(state, 'playerWin', endReason);
  }
  if (state.aiAir > state.playerAir) {
    return finishGame(state, 'aiWin', endReason);
  }
  if (state.playerPool > state.aiPool) {
    return finishGame(state, 'playerWin', endReason);
  }
  if (state.aiPool > state.playerPool) {
    return finishGame(state, 'aiWin', endReason);
  }
  return finishGame(state, 'tie', 'draw');
}

// R5 后按 Air 判定胜负（Air 不同）。
function finishGameFromAir(state: GameState): GameState {
  const reason: EndReason = state.isTiebreaker
    ? 'tiebreaker'
    : state.roundNumber >= MAX_ROUND_NUMBER
      ? 'fiveRounds'
      : 'airDepleted';
  if (state.playerAir > state.aiAir) {
    return finishGame(state, 'playerWin', reason);
  }
  if (state.aiAir > state.playerAir) {
    return finishGame(state, 'aiWin', reason);
  }
  return finishGameFromPool(state);
}

// Air 相同按累计赢得底池判定。
function finishGameFromPool(state: GameState): GameState {
  if (state.playerPool > state.aiPool) {
    return finishGame(state, 'playerWin', 'fiveRounds');
  }
  if (state.aiPool > state.playerPool) {
    return finishGame(state, 'aiWin', 'fiveRounds');
  }
  return finishGame(state, 'tie', 'draw');
}

function applyFinishGame(
  state: GameState,
  action: Extract<GameAction, { type: 'finishGame' }>,
): GameState {
  return finishGameWithNow(state, action.outcome, action.endReason, action.now);
}

function finishGame(state: GameState, outcome: Outcome, endReason: EndReason): GameState {
  return finishGameWithNow(state, outcome, endReason, defaultTimestamp);
}

function finishGameWithNow(
  state: GameState,
  outcome: Outcome,
  endReason: EndReason,
  now: () => string,
): GameState {
  const summary = buildLastResultSummary(state, outcome, endReason, now());
  // 保留 lastError（如 cannotPayAnte），便于 UI 展示结束原因。
  return {
    ...state,
    phase: 'gameOver',
    currentRound: { phase: 'gameOver', finalResult: summary },
  };
}

function buildLastResultSummary(
  state: GameState,
  outcome: Outcome,
  endReason: EndReason,
  timestamp: string,
): LastResultSummary {
  let calamityCount = 0;
  let playerAllInCount = 0;
  let aiAllInCount = 0;
  for (const entry of state.roundHistory) {
    if (entry.resolution.calamity.triggered) {
      calamityCount += 1;
    }
    for (const action of entry.betActions) {
      if (action.type === 'allIn') {
        if (action.actor === 'player') {
          playerAllInCount += 1;
        } else {
          aiAllInCount += 1;
        }
      }
    }
  }
  return {
    version: 1,
    seed: state.seed,
    outcome,
    endReason,
    finalPlayerAir: state.playerAir,
    finalAiAir: state.aiAir,
    roundsPlayed: state.roundHistory.length,
    playerPool: state.playerPool,
    aiPool: state.aiPool,
    calamityCount,
    playerAllInCount,
    aiAllInCount,
    timestamp,
  };
}

// 默认时间戳：domain 不直接调用 Date；真实使用由 finishGame 系统动作注入 now()。
// 此处仅兜底，测试应通过注入 now() 覆盖。
function defaultTimestamp(): string {
  return '1970-01-01T00:00:00.000Z';
}

// ---------- 重新开局 / 设置 ----------

function applyRestartGame(
  state: GameState,
  action: Extract<GameAction, { type: 'restartGame' }>,
): GameState {
  // 强制新 seed：不复用当前 seed。新 seed 由调用方在 action 中传入。
  void state;
  return applyInitializationSucceeded(createIdleState(action.settingsSnapshot), {
    type: 'initializationSucceeded',
    seed: action.seed,
    deckState: action.deckState,
    numberCards: action.numberCards,
    settingsSnapshot: action.settingsSnapshot,
  });
}

function applyUpdateSettings(
  state: GameState,
  action: Extract<GameAction, { type: 'updateSettings' }>,
): GameState {
  // 设置变化不改变 phase，不触发 reducer 状态推进。
  return {
    ...state,
    settingsSnapshot: { ...state.settingsSnapshot, ...action.patch },
  };
}

function applyConfirmDangerousAction(state: GameState): GameState {
  // V1 仅记录语义，不改 phase；UI 层处理二次确认。
  return clearError(state);
}

// ---------- 主入口 ----------

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'startNewGame':
      // startNewGame 由 app 层生成 seed/RNG/deck 后转入；等价 initializationSucceeded。
      return applyInitializationSucceeded(state, {
        type: 'initializationSucceeded',
        seed: action.seed,
        deckState: action.deckState,
        numberCards: action.numberCards,
        settingsSnapshot: action.settingsSnapshot,
      });

    case 'initializationSucceeded':
      return applyInitializationSucceeded(state, action);
    case 'initializationFailed':
      return finishGame(
        setError(state, action.code, action.message),
        'tie',
        'earlyTermination',
      );

    case 'applyRoundCosts':
      return applyRoundCosts(state);

    case 'aiSelectedNumberCard':
      return applyAiSelectedNumberCard(state, action);

    case 'selectNumberCard':
      return applySelectNumberCard(state, action);

    case 'solveHandsSucceeded':
      return applySolveHandsSucceeded(state, action);
    case 'solveHandsFailed':
      return setError(state, action.code, action.message);

    case 'lockPlayerHand':
      return applyLockPlayerHand(state, action);
    case 'autoLockRecommendedHand':
      return applyAutoLockRecommendedHand(state);
    case 'aiLockedHand':
      return applyAiLockedHand(state, action);

    case 'enterBetting':
      return applyEnterBetting(state, action);

    case 'submitBetAction':
      return applySubmitBetAction(state, action);
    case 'aiSubmittedBetAction':
      return applyAiSubmittedBetAction(state, action);
    case 'betClosed':
      return applyBetClosed(state);

    case 'showdown':
      return applyShowdown(state);
    case 'resolveRound':
      return applyResolveRound(state);

    case 'continueToNextRound':
      return applyContinueToNextRound(state);

    case 'finishGame':
      return applyFinishGame(state, action);

    case 'restartGame':
      return applyRestartGame(state, action);
    case 'updateSettings':
      return applyUpdateSettings(state, action);
    case 'confirmDangerousAction':
      return applyConfirmDangerousAction(state);

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

// ---------- 对外暴露的领域计算辅助（供 round-flow 编排使用） ----------

// 为玩家目标值枚举候选成手并排序。返回给 solveHandsSucceeded 系统动作。
export function enumeratePlayerCandidateHands(
  targetValue: number,
  drawPile: Card[],
  discardPile: Card[],
  roundNumber = 0,
) {
  const selectableCards = createSelectableCards(drawPile, discardPile);
  const result = solveHands({
    targetValue,
    selectableCards,
    mode: 'upperSelection',
  });
  const ranked = rankSolvedHands(result.hands);
  const summary = createPlayerPossibleHandSummary({
    playerTargetValue: targetValue,
    playerCandidateHands: result.hands,
    roundNumber,
  });
  return { ranked, summary, count: result.count };
}
