import { getLegalBetActions } from '../betting/betting-engine';
import type { BetAction, BetState, LegalBetAction } from '../betting/betting-rules';
import type { Card } from '../cards/card';
import type { Rng } from '../cards/deck';
import type { NumberCard } from '../cards/number-card-generator';
import type {
  AiAllInState,
  BettingAiDecision,
  BettingAiInput,
  LowerAiDecision,
  LowerAiInput,
  PlayerPossibleHandSummary,
  UpperAiDecision,
  UpperAiInput,
} from '../ai/ai-types';
import {
  chooseBetAction,
  chooseLowerNumberCard,
  chooseUpperHand,
  calculateAiHandPercentile,
  createHandId,
  createLockedHandFromSolvedHand,
} from '../ai/ai-controller';
import { createSelectableCards, solveHands, type SolvedHand } from '../hand/hand-solver';
import type { RankedSolvedHand } from '../hand/hand-evaluator';
import type { GameState } from './game-state';
import type {
  AiLockedHandAction,
  AiSelectedNumberCardAction,
  AiSubmittedBetActionAction,
  SolveHandsSucceededAction,
} from './game-actions';
import type { LockedHand } from './round-resolution';
import { enumeratePlayerCandidateHands } from './game-reducer';

export type LowerAiView = LowerAiInput;
export type UpperAiView = UpperAiInput & {
  drawPile: Card[];
  roundNumber: number;
  isTiebreaker: boolean;
};
export type BettingAiView = BettingAiInput;

export type AiDecisionFunctions = {
  chooseLowerNumberCard: (view: LowerAiView) => LowerAiDecision;
  chooseUpperHand: (view: UpperAiView) => UpperAiDecision;
  chooseBetAction: (view: BettingAiView) => BettingAiDecision;
};

export type OrchestratorOutput = {
  actions: Array<
    | AiSelectedNumberCardAction
    | SolveHandsSucceededAction
    | AiLockedHandAction
    | AiSubmittedBetActionAction
  >;
};

const DEFAULT_RNG: Rng = () => 0.5;
const DEFAULT_AI_ALL_IN_STATE: AiAllInState = {
  count: 0,
  lastAllInRound: null,
};

function availableNumberCards(cards: NumberCard[]): NumberCard[] {
  return cards.filter((card) => card.status === 'available');
}

function enumerateAiCandidateHands(
  targetValue: number,
  drawPile: Card[],
  discardPile: Card[],
): SolvedHand[] {
  const selectableCards = createSelectableCards(drawPile, discardPile);
  return solveHands({
    targetValue,
    selectableCards,
    mode: 'upperSelection',
  }).hands;
}

function findSolvedHandById(
  candidateHands: SolvedHand[],
  lockedHandId: string,
): SolvedHand | undefined {
  return candidateHands.find((hand) => createHandId(hand) === lockedHandId);
}

export function planSystemActions(
  state: GameState,
  ai: AiDecisionFunctions,
  now: () => number,
  rng: Rng = DEFAULT_RNG,
  aiAllInState: AiAllInState = DEFAULT_AI_ALL_IN_STATE,
): OrchestratorOutput {
  const actions: OrchestratorOutput['actions'] = [];

  switch (state.phase) {
    case 'lowerSelect': {
      if (state.currentRound.publicTargets.aiNumberCardId !== null) {
        break;
      }

      const decision = ai.chooseLowerNumberCard({
        availableNumberCards: availableNumberCards(state.numberCards.ai),
        drawPile: state.deckState.drawPile,
        discardPile: state.deckState.discardPile,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
        aiAir: state.aiAir,
        playerAir: state.playerAir,
        rng,
      });

      if (decision.ok) {
        actions.push({
          type: 'aiSelectedNumberCard',
          numberCardId: decision.selectedNumberCardId,
        });
      }
      break;
    }

    case 'solveHands': {
      const targetValue = state.currentRound.publicTargets.playerTargetValue;
      if (targetValue === null) {
        break;
      }

      const { ranked, summary } = enumeratePlayerCandidateHands(
        targetValue,
        state.deckState.drawPile,
        state.deckState.discardPile,
        state.roundNumber,
      );

      actions.push({
        type: 'solveHandsSucceeded',
        playerCandidateHands: ranked satisfies RankedSolvedHand[],
        playerPossibleHandSummary: summary satisfies PlayerPossibleHandSummary,
      });
      break;
    }

    case 'upperSelect': {
      if (state.currentRound.aiLockedHand !== null) {
        break;
      }

      const aiTargetValue = state.currentRound.publicTargets.aiTargetValue;
      if (aiTargetValue === null) {
        break;
      }

      const candidateHands = enumerateAiCandidateHands(
        aiTargetValue,
        state.deckState.drawPile,
        state.deckState.discardPile,
      );
      const decision = ai.chooseUpperHand({
        aiTargetValue,
        candidateHands,
        playerPossibleHandSummary: state.currentRound.playerPossibleHandSummary,
        discardPile: state.deckState.discardPile,
        drawPile: state.deckState.drawPile,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
        rng,
      });

      if (decision.ok) {
        const hand = findSolvedHandById(candidateHands, decision.lockedHandId);
        if (hand !== undefined) {
          actions.push({
            type: 'aiLockedHand',
            hand: createLockedHandFromSolvedHand(hand),
          });
        }
      }
      break;
    }

    case 'betting': {
      if (state.currentRound.betState.status !== 'awaitingAi') {
        break;
      }

      const legalActions = getLegalBetActions(state.currentRound.betState, 'ai');
      const aiTargetValue = state.currentRound.publicTargets.aiTargetValue;
      // AI 候选成手按 08 文档口径预算 percentile：rank / N（升序，rank 从 0 计）。
      // 枚举不依赖 RNG、不读玩家隐藏信息；aiTargetValue 缺失时按最弱 0 处理。
      const aiHandPercentile =
        aiTargetValue === null
          ? 0
          : calculateAiHandPercentile(
              state.currentRound.aiLockedHand,
              enumerateAiCandidateHands(
                aiTargetValue,
                state.deckState.drawPile,
                state.deckState.discardPile,
              ),
            );
      const decision = ai.chooseBetAction({
        aiLockedHand: state.currentRound.aiLockedHand,
        aiHandPercentile,
        playerPossibleHandSummary: state.currentRound.playerPossibleHandSummary,
        betState: state.currentRound.betState,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
        aiAir: state.aiAir,
        playerAir: state.playerAir,
        aiAllInState,
        legalActions,
        rng,
      });

      if (decision.ok) {
        actions.push({
          type: 'aiSubmittedBetAction',
          action: decision.action,
          now,
        });
      }
      break;
    }

    default:
      break;
  }

  return { actions };
}

export function createDeterministicAiStub(
  candidatesForUpper: (view: UpperAiView) => LockedHand | null,
): AiDecisionFunctions {
  return {
    chooseLowerNumberCard: (view) => {
      const available = view.availableNumberCards[0];
      if (available === undefined) {
        return { ok: false, code: 'no-solvable-number-card' };
      }

      return {
        ok: true,
        selectedNumberCardId: available.id,
        scoreBreakdown: { byKey: {}, order: [available.id] },
        reason: {
          primaryAction: 'select first available',
          topFactors: [{ name: 'deterministicStub', impact: 1 }],
          summary: 'Deterministic stub selected the first available number card.',
        },
        disabledCardReasons: {},
      };
    },
    chooseUpperHand: (view) => {
      const hand = candidatesForUpper(view);
      if (hand === null) {
        return { ok: false, code: 'no-upper-hand-candidates' };
      }

      const candidate = view.candidateHands.find(
        (item) =>
          item.effectiveCards.map((card) => card.id).join(',') ===
          hand.effectiveCards.map((card) => card.id).join(','),
      );
      const lockedHandId =
        candidate === undefined
          ? hand.effectiveCards
              .map((card) => card.id)
              .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
              .join(',')
          : createHandId(candidate);

      return {
        ok: true,
        lockedHandId,
        scoreBreakdown: { byKey: {}, order: [lockedHandId] },
        reason: {
          primaryAction: 'lock deterministic candidate',
          topFactors: [{ name: 'deterministicStub', impact: 1 }],
          summary: 'Deterministic stub locked a candidate hand.',
        },
      };
    },
    chooseBetAction: (view) => ({
      ok: true,
      action: createConservativeBetAction(view.betState, view.legalActions),
      confidence: 0,
      allInCheck: { allowed: false, failedReasons: ['confidence-below-0.92'] },
      reason: {
        primaryAction: 'conservative bet',
        topFactors: [{ name: 'deterministicStub', impact: 1 }],
        summary: 'Deterministic stub chose the most conservative legal action.',
      },
    }),
  };
}

function createConservativeBetAction(
  betState: BetState,
  legalActions: LegalBetAction[],
): BetAction {
  const check = legalActions.find(
    (action) => action.type === 'check' && action.disabledReason === undefined,
  );
  if (check !== undefined) {
    return { actor: 'ai', type: 'check', amount: 0 };
  }

  const fold = legalActions.find(
    (action) => action.type === 'fold' && action.disabledReason === undefined,
  );
  if (fold !== undefined) {
    return { actor: 'ai', type: 'fold', amount: 0 };
  }

  const call = legalActions.find(
    (action) => action.type === 'call' && action.disabledReason === undefined,
  );
  if (call !== undefined) {
    return { actor: 'ai', type: 'call', amount: call.maxAmount };
  }

  void betState;
  return { actor: 'ai', type: 'check', amount: 0 };
}

export function createDefaultAiDecisionFunctions(): AiDecisionFunctions {
  return {
    chooseLowerNumberCard,
    chooseUpperHand,
    chooseBetAction,
  };
}
