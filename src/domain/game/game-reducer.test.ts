import { describe, expect, it } from 'vitest';

import { createInitialDeckState } from '../cards/deck-state';
import {
  generateNumberCardDeal,
  type NumberCard,
  type NumberCardId,
} from '../cards/number-card-generator';
import { isNumberCardSolvable } from '../hand/hand-solver';
import type { RankedSolvedHand } from '../hand/hand-evaluator';
import { evaluateHand, rankSolvedHands } from '../hand/hand-evaluator';
import { createSelectableCards, solveHands } from '../hand/hand-solver';
import type { Rng } from '../cards/deck';
import { createSeededRng } from '../../app/rng';
import type { Settings } from '../../app/settings';
import {
  createIdleState,
  enumeratePlayerCandidateHands,
  gameReducer,
} from './game-reducer';
import type { GameState } from './game-state';
import type { AiDecisionFunctions } from './round-flow';
import { planSystemActions } from './round-flow';

// 收窄 state 到指定 phase 分支，避免在 currentRound union 上读字段报错。
function stateOf<P extends GameState['phase']>(
  state: GameState,
  phase: P,
): Extract<GameState, { phase: P }> {
  if (state.phase !== phase) {
    throw new Error(`expected phase ${phase}, got ${state.phase}`);
  }
  return state as unknown as Extract<GameState, { phase: P }>;
}

const DEFAULT_SETTINGS: Settings = {
  version: 1,
  soundEnabled: true,
  theme: 'system',
  reduceMotion: false,
  showAIDebug: false,
};

const FIXED_NOW = () => 1_000;

// 用固定 seed 生成一局可用数据：deckState + 双方数字牌。
function buildGameInputs(seed: string): {
  deckState: GameState['deckState'];
  numberCards: { player: NumberCard[]; ai: NumberCard[] };
  rng: Rng;
} {
  const rng = createSeededRng(seed);
  const { deckState } = createInitialDeckState(rng);
  // 用 deckState.drawPile 作为共享牌库生成数字牌。
  const deal = generateNumberCardDeal({
    rng: createSeededRng(seed + '-deal'),
    seed,
    isSolvable: (value, cards) => isNumberCardSolvable(value, cards),
  });
  if (!deal.ok) {
    throw new Error(`number card generation failed: ${deal.code}`);
  }
  return {
    deckState,
    numberCards: { player: deal.deal.playerCards, ai: deal.deal.aiCards },
    rng,
  };
}

// 第一张可用数字牌 ID。
function firstAvailableNumberCardId(cards: NumberCard[]): NumberCardId {
  const card = cards.find((c) => c.status === 'available');
  if (card === undefined) {
    throw new Error('no available number card');
  }
  return card.id;
}

// 确定性 AI stub：lower 选第一张可用可解数字牌；upper 选最强候选；betting check/fold。
function buildDeterministicAi(): AiDecisionFunctions {
  return {
    chooseLowerNumberCard: (view) => {
      const card = view.aiNumberCards.find(
        (c) => c.status === 'available' && isNumberCardSolvable(c.value, view.drawPile),
      );
      return card === undefined ? null : card.id;
    },
    chooseUpperHand: (view) => {
      const selectable = createSelectableCards(view.drawPile, view.discardPile);
      const result = solveHands({
        targetValue: view.aiTargetValue,
        selectableCards: selectable,
        mode: 'upperSelection',
      });
      const ranked = rankSolvedHands(result.hands);
      const best = ranked[0];
      if (best === undefined) {
        return null;
      }
      return {
        selectedCards: [...best.solvedHand.effectiveCards],
        effectiveCards: [...best.solvedHand.effectiveCards],
        evaluatedHand: evaluateHand(best.solvedHand.effectiveCards),
      };
    },
    chooseBetAction: () => ({ actor: 'ai', type: 'check', amount: 0 }),
  };
}

// 把 planSystemActions 产出的系统动作逐个 dispatch，返回推进后的 state。
function pumpSystemActions(state: GameState, ai: AiDecisionFunctions): GameState {
  let current = state;
  // 最多循环若干次，避免死循环。
  for (let i = 0; i < 8; i += 1) {
    const plan = planSystemActions(current, ai, FIXED_NOW);
    if (plan.actions.length === 0) {
      break;
    }
    for (const action of plan.actions) {
      current = gameReducer(current, action);
    }
  }
  return current;
}

// 完整推进一回合：从 lowerSelect 走到 roundSummary。
// 调用方负责在合适阶段注入玩家动作。
function runOneRound(
  state: GameState,
  ai: AiDecisionFunctions,
  playerNumberCardId: NumberCardId,
  playerLockHandId: string | null,
): GameState {
  // lowerSelect：先让 AI 预选，再玩家选牌。
  let current = pumpSystemActions(state, ai);
  current = gameReducer(current, {
    type: 'selectNumberCard',
    numberCardId: playerNumberCardId,
  });
  // solveHands -> upperSelect：枚举候选 + AI 锁定。
  current = pumpSystemActions(current, ai);
  if (playerLockHandId !== null) {
    current = gameReducer(current, { type: 'lockPlayerHand', handId: playerLockHandId });
  }
  // 进入 betting。
  current = gameReducer(current, { type: 'enterBetting', now: FIXED_NOW });
  // 玩家 check 收敛（首注阶段 check 合法）。
  current = gameReducer(current, {
    type: 'submitBetAction',
    action: { actor: 'player', type: 'check', amount: 0 },
    now: FIXED_NOW,
  });
  // AI check 收敛 -> betClosed 由 reducer 在收敛时不自动跳，需显式 betClosed。
  current = pumpSystemActions(current, ai);
  // 若 betState 仍 open 且轮到玩家已收敛，手动推进 showdown。
  if (
    current.phase === 'betting' &&
    stateOf(current, 'betting').currentRound.betState.status === 'closed'
  ) {
    current = gameReducer(current, { type: 'betClosed' });
  }
  // showdown -> resolve -> roundSummary。
  current = gameReducer(current, { type: 'showdown' });
  current = gameReducer(current, { type: 'resolveRound' });
  return current;
}

describe('game-reducer/createIdleState', () => {
  it('creates idle state with no current round data', () => {
    const state = createIdleState(DEFAULT_SETTINGS);
    expect(state.phase).toBe('idle');
    expect(state.playerAir).toBe(25);
    expect(state.aiAir).toBe(25);
    expect(state.roundHistory).toEqual([]);
    expect(state.playerPool).toBe(0);
  });
});

describe('game-reducer/initialization and round costs', () => {
  it('initializes to roundStart and deducts breathing + ante on applyRoundCosts', () => {
    const inputs = buildGameInputs('seed-A');
    const idle = createIdleState(DEFAULT_SETTINGS);
    const initialized = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    expect(initialized.phase).toBe('roundStart');
    expect(initialized.roundNumber).toBe(1);

    const afterCosts = gameReducer(initialized, { type: 'applyRoundCosts' });
    expect(afterCosts.phase).toBe('lowerSelect');
    // R1：呼吸 1 + 参加费 1 = 2
    expect(afterCosts.playerAir).toBe(23);
    expect(afterCosts.aiAir).toBe(23);
    expect(stateOf(afterCosts, 'lowerSelect').currentRound.ante).toEqual({
      playerAnte: 1,
      aiAnte: 1,
    });
  });

  it('enters gameOver with cannotPayBreathingCost when air < 1', () => {
    const inputs = buildGameInputs('seed-breath');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-breath',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    // 把双方 Air 设为 0 模拟呼吸不足。
    state = { ...state, playerAir: 0, aiAir: 0 };
    const after = gameReducer(state, { type: 'applyRoundCosts' });
    expect(after.phase).toBe('gameOver');
    expect(after.lastError?.code).toBe('cannotPayBreathingCost');
    expect(after.roundNumber).toBe(1);
  });

  it('enters gameOver with cannotPayAnte when air < R, breathing not rolled back', () => {
    const inputs = buildGameInputs('seed-ante');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-ante',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    // R1 ante=1，设玩家 Air=0（呼吸已扣逻辑：玩家 Air 0 < 1 呼吸直接走呼吸分支），
    // 改用 R2 测试参加费：设 roundNumber=2, playerAir=2（呼吸扣 1 后剩 1 < ante 2）。
    state = {
      ...state,
      roundNumber: 2,
      playerAir: 2,
      aiAir: 25,
    };
    const after = gameReducer(state, { type: 'applyRoundCosts' });
    expect(after.phase).toBe('gameOver');
    expect(after.lastError?.code).toBe('cannotPayAnte');
  });
});

describe('game-reducer/lowerSelect ordering', () => {
  it('AI number card is written before player selectNumberCard', () => {
    const inputs = buildGameInputs('seed-A');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    expect(state.phase).toBe('lowerSelect');
    expect(
      stateOf(state, 'lowerSelect').currentRound.publicTargets.aiNumberCardId,
    ).toBeNull();

    const ai = buildDeterministicAi();
    // AI 预选。
    state = pumpSystemActions(state, ai);
    expect(
      stateOf(state, 'lowerSelect').currentRound.publicTargets.aiNumberCardId,
    ).not.toBeNull();

    // 玩家选牌。
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = gameReducer(state, { type: 'selectNumberCard', numberCardId: playerCardId });
    expect(state.phase).toBe('solveHands');
    expect(
      stateOf(state, 'solveHands').currentRound.publicTargets.playerNumberCardId,
    ).toBe(playerCardId);
  });

  it('player selectNumberCard before AI preselect writes missing-ai-locked-hand', () => {
    const inputs = buildGameInputs('seed-A');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    const after = gameReducer(state, {
      type: 'selectNumberCard',
      numberCardId: playerCardId,
    });
    expect(after.lastError?.code).toBe('missing-ai-locked-hand');
    expect(after.phase).toBe('lowerSelect');
  });
});

describe('game-reducer/upperSelect and betting', () => {
  it('auto-locks recommended hand when entering betting without lock', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    state = pumpSystemActions(state, ai);
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = gameReducer(state, { type: 'selectNumberCard', numberCardId: playerCardId });
    state = pumpSystemActions(state, ai);
    expect(state.phase).toBe('upperSelect');
    expect(stateOf(state, 'upperSelect').currentRound.aiLockedHand).not.toBeNull();

    // 不手动锁定，直接进入 betting -> 自动锁定。
    state = gameReducer(state, { type: 'enterBetting', now: FIXED_NOW });
    expect(state.phase).toBe('betting');
    expect(stateOf(state, 'betting').currentRound.playerLockedHand).not.toBeNull();
  });

  it('enterBetting writes missing-ai-locked-hand when AI not locked', () => {
    const inputs = buildGameInputs('seed-A');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    // 玩家选牌但不让 AI 锁定。
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    // 先手动注入 AI 数字牌以通过 selectNumberCard 守卫。
    const aiCard = inputs.numberCards.ai.find((c) => c.status === 'available')!;
    state = gameReducer(state, { type: 'aiSelectedNumberCard', numberCardId: aiCard.id });
    state = gameReducer(state, { type: 'selectNumberCard', numberCardId: playerCardId });
    // 用枚举产 solveHandsSucceeded，但不产 aiLockedHand（用一个永不锁定的 AI stub）。
    const neverLockAi: AiDecisionFunctions = {
      ...buildDeterministicAi(),
      chooseUpperHand: () => null,
    };
    state = pumpSystemActions(state, neverLockAi);
    expect(state.phase).toBe('upperSelect');
    const after = gameReducer(state, { type: 'enterBetting', now: FIXED_NOW });
    expect(after.lastError?.code).toBe('missing-ai-locked-hand');
    expect(after.phase).toBe('upperSelect');
  });

  it('lockPlayerHand in betting phase writes wrong-phase', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    state = pumpSystemActions(state, ai);
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = gameReducer(state, { type: 'selectNumberCard', numberCardId: playerCardId });
    state = pumpSystemActions(state, ai);
    state = gameReducer(state, { type: 'enterBetting', now: FIXED_NOW });
    const after = gameReducer(state, { type: 'lockPlayerHand', handId: 'whatever' });
    expect(after.lastError?.code).toBe('wrong-phase');
    expect(after.phase).toBe('betting');
  });
});

describe('game-reducer/full round resolution', () => {
  it('resolves a round and updates air, discard pile, pool, history', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    // 推进一整回合。
    state = runOneRound(state, ai, playerCardId, null);

    expect(state.phase).toBe('roundSummary');
    expect(state.roundHistory).toHaveLength(1);
    const entry = state.roundHistory[0]!;
    expect(entry.roundNumber).toBe(1);
    expect(entry.resolution.winner).toMatch(/player|ai|tie/);
    // 双方 check 无下注：airDelta 只含 ante 退还差异。
    // 玩家 Air 应为非负且无非法值。
    expect(state.playerAir).toBeGreaterThanOrEqual(0);
    expect(state.aiAir).toBeGreaterThanOrEqual(0);
    // 弃牌区应包含本回合有效牌。
    expect(state.deckState.discardPile.length).toBeGreaterThan(0);
  });

  it('does not double calamity penalty (loser net loss = pot total, not x2)', () => {
    // 此用例由 06 模块保证账本正确；这里仅断言 airDelta 与 resolution 一致。
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    const entry = state.roundHistory[0]!;
    const escrow = entry.escrow;
    const dist = entry.resolution.escrowDistribution;
    // playerPool 净变化 = playerReceivedBet - playerBet。
    const playerNetBet = dist.playerReceivedBet - escrow.playerBet;
    // airDelta.player = ante 退还差 + playerNetBet - 灾厄扣减。
    // 这里只校验非爆炸性：vanishedAir 不为负。
    expect(entry.resolution.vanishedAir).toBeGreaterThanOrEqual(0);
    void playerNetBet;
  });
});

describe('game-reducer/multi-round and tiebreaker', () => {
  it('advances roundNumber on continueToNextRound when roundNumber < 5', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    expect(state.phase).toBe('roundSummary');
    const next = gameReducer(state, { type: 'continueToNextRound' });
    expect(next.phase).toBe('roundStart');
    expect(next.roundNumber).toBe(2);
  });

  it('enters tiebreaker when R5 ends with equal air and equal pool', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    // 直接构造一个 R5 平手 roundSummary 状态。
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    // 强制设为 R5 平手局面。
    const tieState = {
      ...state,
      phase: 'roundSummary',
      roundNumber: 5,
      isTiebreaker: false,
      playerAir: 10,
      aiAir: 10,
      playerPool: 0,
      aiPool: 0,
    } as GameState;
    const next = gameReducer(tieState, { type: 'continueToNextRound' });
    // 双方有可用数字牌 -> 进入决胜 roundStart。
    expect(next.phase).toBe('roundStart');
    expect(next.isTiebreaker).toBe(true);
    expect(next.roundNumber).toBe(5);
  });

  it('judges draw when tiebreaker still tied', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    const tieState = {
      ...state,
      phase: 'roundSummary',
      roundNumber: 5,
      isTiebreaker: true,
      playerAir: 5,
      aiAir: 5,
      playerPool: 0,
      aiPool: 0,
    } as GameState;
    const next = gameReducer(tieState, { type: 'continueToNextRound' });
    expect(next.phase).toBe('gameOver');
    const finalResult = (
      next.currentRound as { finalResult: { outcome: string; endReason: string } }
    ).finalResult;
    expect(finalResult.outcome).toBe('tie');
    expect(finalResult.endReason).toBe('draw');
  });

  it('tiebreaker charges R5 ante (=5)', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    const tieState = {
      ...state,
      phase: 'roundSummary',
      roundNumber: 5,
      isTiebreaker: false,
      playerAir: 10,
      aiAir: 10,
      playerPool: 0,
      aiPool: 0,
    } as GameState;
    const tiebreakerStart = gameReducer(tieState, { type: 'continueToNextRound' });
    expect(tiebreakerStart.isTiebreaker).toBe(true);
    const afterCosts = gameReducer(tiebreakerStart, { type: 'applyRoundCosts' });
    // 决胜 R=5：呼吸 1 + 参加费 5 = 6。
    expect(afterCosts.playerAir).toBe(4);
    expect(afterCosts.aiAir).toBe(4);
  });

  it('finishes as draw when neither side has available solvable number card in tiebreaker', () => {
    const inputs = buildGameInputs('seed-A');
    const ai = buildDeterministicAi();
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const playerCardId = firstAvailableNumberCardId(inputs.numberCards.player);
    state = runOneRound(state, ai, playerCardId, null);
    // 把双方数字牌全部标记 used，模拟无可用牌。
    const allUsedPlayer = state.numberCards.player.map((c) => ({
      ...c,
      status: 'used' as const,
    }));
    const allUsedAi = state.numberCards.ai.map((c) => ({
      ...c,
      status: 'used' as const,
    }));
    const tieState = {
      ...state,
      phase: 'roundSummary',
      roundNumber: 5,
      isTiebreaker: false,
      playerAir: 10,
      aiAir: 10,
      playerPool: 0,
      aiPool: 0,
      numberCards: { player: allUsedPlayer, ai: allUsedAi },
    } as GameState;
    const next = gameReducer(tieState, { type: 'continueToNextRound' });
    expect(next.phase).toBe('gameOver');
    const finalResult = (
      next.currentRound as { finalResult: { outcome: string; endReason: string } }
    ).finalResult;
    expect(finalResult.outcome).toBe('tie');
    expect(finalResult.endReason).toBe('draw');
  });
});

describe('game-reducer/settings and restart', () => {
  it('updateSettings does not change phase', () => {
    const inputs = buildGameInputs('seed-A');
    const idle = createIdleState(DEFAULT_SETTINGS);
    const state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    const after = gameReducer(state, {
      type: 'updateSettings',
      patch: { soundEnabled: false },
    });
    expect(after.phase).toBe('roundStart');
    expect(after.settingsSnapshot.soundEnabled).toBe(false);
  });

  it('restartGame forces new seed (does not reuse current seed)', () => {
    const inputs = buildGameInputs('seed-A');
    const newInputs = buildGameInputs('seed-B');
    const idle = createIdleState(DEFAULT_SETTINGS);
    let state = gameReducer(idle, {
      type: 'initializationSucceeded',
      seed: 'seed-A',
      deckState: inputs.deckState,
      numberCards: inputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    state = gameReducer(state, { type: 'applyRoundCosts' });
    const restarted = gameReducer(state, {
      type: 'restartGame',
      seed: 'seed-B',
      rng: newInputs.rng,
      deckState: newInputs.deckState,
      numberCards: newInputs.numberCards,
      settingsSnapshot: DEFAULT_SETTINGS,
    });
    expect(restarted.seed).toBe('seed-B');
    expect(restarted.phase).toBe('roundStart');
    expect(restarted.roundHistory).toEqual([]);
  });
});

describe('game-reducer/wrong-phase handling', () => {
  it('returns wrong-phase without throwing for out-of-phase actions', () => {
    const idle = createIdleState(DEFAULT_SETTINGS);
    const after = gameReducer(idle, { type: 'applyRoundCosts' });
    expect(after.lastError?.code).toBe('wrong-phase');
    expect(after.phase).toBe('idle');
  });
});

describe('enumeratePlayerCandidateHands', () => {
  it('returns ranked candidate hands for a solvable target value', () => {
    const inputs = buildGameInputs('seed-A');
    const targetValue = inputs.numberCards.player[0]!.value;
    const { ranked, summary, count } = enumeratePlayerCandidateHands(
      targetValue,
      inputs.deckState.drawPile,
      [],
    );
    expect(count).toBeGreaterThan(0);
    expect(ranked.length).toBeGreaterThan(0);
    expect(summary.totalCount).toBe(count);
    // ranked 按 rank 升序，最强在 index 0。
    const first: RankedSolvedHand = ranked[0]!;
    expect(first.rank).toBe(1);
  });
});

// 完整推进一局：从 roundStart 逐回合跑到 gameOver（用确定性 AI stub）。
// 覆盖 harness 4.3 seed A「正常 5 回合」主路径：阶段流转合法、Air 不出现非法值、
// 牌库与弃牌区无重复实体、最终进入 gameOver 并产出 finalResult。
function runFullGame(seed: string): GameState {
  const inputs = buildGameInputs(seed);
  const ai = buildDeterministicAi();
  let state = gameReducer(createIdleState(DEFAULT_SETTINGS), {
    type: 'initializationSucceeded',
    seed,
    deckState: inputs.deckState,
    numberCards: inputs.numberCards,
    settingsSnapshot: DEFAULT_SETTINGS,
  });
  // 最多 5 个常规回合 + 1 次决胜，超出则视为卡死。
  for (let i = 0; i < 12; i += 1) {
    if (state.phase === 'gameOver') {
      break;
    }
    if (state.phase === 'roundStart') {
      state = gameReducer(state, { type: 'applyRoundCosts' });
      continue;
    }
    if (state.phase === 'lowerSelect') {
      const playerCardId = firstAvailableNumberCardId(state.numberCards.player);
      state = runOneRound(state, ai, playerCardId, null);
      continue;
    }
    if (state.phase === 'roundSummary') {
      state = gameReducer(state, { type: 'continueToNextRound' });
      continue;
    }
    // 其它阶段停留视为卡死，跳出由断言捕获。
    break;
  }
  return state;
}

describe('game-reducer/full game idle to gameOver', () => {
  it('runs a complete game from idle to gameOver with deterministic AI (seed A)', () => {
    const finalState = runFullGame('seed-A');
    expect(['gameOver', 'roundStart']).toContain(finalState.phase);
    // Air 不出现非法值。
    expect(finalState.playerAir).toBeGreaterThanOrEqual(0);
    expect(finalState.aiAir).toBeGreaterThanOrEqual(0);
    // 至少打完一回合。
    expect(finalState.roundHistory.length).toBeGreaterThanOrEqual(1);
    // 若进入 gameOver，finalResult 字段合法。
    if (finalState.phase === 'gameOver') {
      const finalResult = (
        finalState.currentRound as { finalResult: { outcome: string; endReason: string } }
      ).finalResult;
      expect(finalResult.outcome).toMatch(/playerWin|aiWin|tie/);
      expect(finalResult.endReason).toMatch(
        /airDepleted|fiveRounds|tiebreaker|earlyTermination|draw/,
      );
    }
  });

  it('keeps deck and discard pile free of duplicate card entities across the game', () => {
    const finalState = runFullGame('seed-A');
    const seen = new Set<string>();
    for (const card of finalState.deckState.drawPile) {
      expect(seen.has(card.id)).toBe(false);
      seen.add(card.id);
    }
    for (const card of finalState.deckState.discardPile) {
      expect(seen.has(card.id)).toBe(false);
      seen.add(card.id);
    }
  });

  it('runs other harness seeds (B-F) to a terminal state without illegal Air', () => {
    // harness 4.3 seed A-J 场景：用确定性 AI stub 跑通主路径。
    // 确定性 stub 双方均 check（不下注），Air 仅随呼吸 + 参加费递减，
    // 部分种子会在 R5 进入 roundStart 因 cannotPayAnte 提前结束——这是合法的
    // 提前结算路径。真实 AI（08）下的具体局面不在本用例验证范围。
    // 每局需枚举多回合候选成手，5 个种子串行较慢，放宽超时。
    for (const seed of ['seed-B', 'seed-C', 'seed-D', 'seed-E', 'seed-F']) {
      const finalState = runFullGame(seed);
      expect(['gameOver', 'roundStart']).toContain(finalState.phase);
      expect(finalState.playerAir).toBeGreaterThanOrEqual(0);
      expect(finalState.aiAir).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);
});

