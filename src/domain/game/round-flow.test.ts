import { describe, expect, it } from 'vitest';

import { createInitialDeckState } from '../cards/deck-state';
import {
  generateNumberCardDeal,
  type NumberCard,
  type NumberCardId,
} from '../cards/number-card-generator';
import { isNumberCardSolvable } from '../hand/hand-solver';
import { createSeededRng } from '../../app/rng';
import type { Settings } from '../../app/settings';
import { createIdleState, gameReducer } from './game-reducer';
import type { GameState } from './game-state';
import type { AiDecisionFunctions, UpperAiView } from './round-flow';
import { createDeterministicAiStub, planSystemActions } from './round-flow';
import { createLockedHandFromSolvedHand } from '../ai/ai-controller';
import type { LockedHand } from './round-resolution';

const DEFAULT_SETTINGS: Settings = {
  version: 1,
  soundEnabled: true,
  theme: 'system',
  reduceMotion: false,
  showAIDebug: false,
};

const FIXED_NOW = () => 1_000;

function buildGameInputs(seed: string) {
  const rng = createSeededRng(seed);
  const { deckState } = createInitialDeckState(rng);
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
    numberCards: {
      player: deal.deal.playerCards,
      ai: deal.deal.aiCards,
    },
  };
}

function firstAvailable(cards: NumberCard[]): NumberCardId {
  const card = cards.find((c) => c.status === 'available');
  if (card === undefined) {
    throw new Error('no available number card');
  }
  return card.id;
}

// 确定性 AI stub：lower 选第一张可用可解；upper 选最强候选；betting check。
function deterministicAi(): AiDecisionFunctions {
  return createDeterministicAiStub(firstCandidateHand);
}

function firstCandidateHand(view: UpperAiView): LockedHand | null {
  const best = view.candidateHands[0];
  return best === undefined ? null : createLockedHandFromSolvedHand(best);
}

// 推进到 lowerSelect 阶段。
function reachLowerSelect(seed: string): GameState {
  const inputs = buildGameInputs(seed);
  const idle = createIdleState(DEFAULT_SETTINGS);
  const state = gameReducer(idle, {
    type: 'initializationSucceeded',
    seed,
    deckState: inputs.deckState,
    numberCards: inputs.numberCards,
    settingsSnapshot: DEFAULT_SETTINGS,
  });
  return gameReducer(state, { type: 'applyRoundCosts' });
}

describe('round-flow/planSystemActions', () => {
  it('produces aiSelectedNumberCard when AI has not preselected in lowerSelect', () => {
    const state = reachLowerSelect('seed-A');
    expect(state.phase).toBe('lowerSelect');
    const plan = planSystemActions(state, deterministicAi(), FIXED_NOW);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.type).toBe('aiSelectedNumberCard');
  });

  it('produces no action when AI already preselected in lowerSelect', () => {
    const state = reachLowerSelect('seed-A');
    const ai = deterministicAi();
    // 第一次推进写入 AI 数字牌。
    const first = planSystemActions(state, ai, FIXED_NOW);
    const after = first.actions.reduce<GameState>((s, a) => gameReducer(s, a), state);
    const second = planSystemActions(after, ai, FIXED_NOW);
    expect(second.actions).toHaveLength(0);
  });

  it('produces solveHandsSucceeded in solveHands phase', () => {
    const state = reachLowerSelect('seed-A');
    const ai = deterministicAi();
    let current = planSystemActions(state, ai, FIXED_NOW).actions.reduce<GameState>(
      (s, a) => gameReducer(s, a),
      state,
    );
    const playerCardId = firstAvailable(current.numberCards.player);
    current = gameReducer(current, {
      type: 'selectNumberCard',
      numberCardId: playerCardId,
    });
    expect(current.phase).toBe('solveHands');
    const plan = planSystemActions(current, ai, FIXED_NOW);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.type).toBe('solveHandsSucceeded');
  });

  it('produces aiLockedHand when AI has not locked in upperSelect', () => {
    const state = reachLowerSelect('seed-A');
    const ai = deterministicAi();
    let current = planSystemActions(state, ai, FIXED_NOW).actions.reduce<GameState>(
      (s, a) => gameReducer(s, a),
      state,
    );
    const playerCardId = firstAvailable(current.numberCards.player);
    current = gameReducer(current, {
      type: 'selectNumberCard',
      numberCardId: playerCardId,
    });
    // solveHandsSucceeded 推进到 upperSelect。
    current = planSystemActions(current, ai, FIXED_NOW).actions.reduce<GameState>(
      (s, a) => gameReducer(s, a),
      current,
    );
    expect(current.phase).toBe('upperSelect');
    const plan = planSystemActions(current, ai, FIXED_NOW);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.type).toBe('aiLockedHand');
  });

  it('produces aiSubmittedBetAction when betting and awaitingAi', () => {
    const state = reachLowerSelect('seed-A');
    const ai = deterministicAi();
    let current = planSystemActions(state, ai, FIXED_NOW).actions.reduce<GameState>(
      (s, a) => gameReducer(s, a),
      state,
    );
    const playerCardId = firstAvailable(current.numberCards.player);
    current = gameReducer(current, {
      type: 'selectNumberCard',
      numberCardId: playerCardId,
    });
    // solveHands -> upperSelect -> aiLockedHand：循环 pump 直到无系统动作。
    for (let i = 0; i < 4; i += 1) {
      const plan = planSystemActions(current, ai, FIXED_NOW);
      if (plan.actions.length === 0) break;
      current = plan.actions.reduce<GameState>((s, a) => gameReducer(s, a), current);
    }
    current = gameReducer(current, { type: 'enterBetting', now: FIXED_NOW });
    // 玩家先 bet 1（玩家先动），轮到 AI（awaitingAi）。
    current = gameReducer(current, {
      type: 'submitBetAction',
      action: { actor: 'player', type: 'bet', amount: 1 },
      now: FIXED_NOW,
    });
    expect(current.phase).toBe('betting');
    const plan = planSystemActions(current, ai, FIXED_NOW);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.type).toBe('aiSubmittedBetAction');
  });

  it('produces no action in phases without AI/system work', () => {
    const idle = createIdleState(DEFAULT_SETTINGS);
    const plan = planSystemActions(idle, deterministicAi(), FIXED_NOW);
    expect(plan.actions).toHaveLength(0);
  });

  it('does not mutate state (pure function)', () => {
    const state = reachLowerSelect('seed-A');
    const snapshot = JSON.stringify(state);
    planSystemActions(state, deterministicAi(), FIXED_NOW);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
