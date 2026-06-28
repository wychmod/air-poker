import { evaluateHand, type HandCategory } from '../hand/hand-evaluator';
import type {
  CreatePlayerPossibleHandSummaryInput,
  PlayerPossibleHandSummary,
} from './ai-types';
export {
  createHandId,
  createLockedHandFromSolvedHand,
  calculateAiHandPercentile,
} from './ai-utils';

export function createPlayerPossibleHandSummary(
  input: CreatePlayerPossibleHandSummaryInput,
): PlayerPossibleHandSummary {
  const candidates = input.playerCandidateHands;
  void input.playerTargetValue;

  if (candidates.length === 0) {
    return {
      totalCandidateCount: 0,
      allUnusedCandidateCount: 0,
      containsUsedCardCandidateCount: 0,
      strongHandRatio: 0,
      bestPossibleCategory: 'NoEffectiveCards',
      averageOverlapRiskAgainstAiHand: 0,
      computedAtRound: input.roundNumber,
    };
  }

  let allUnusedCandidateCount = 0;
  let strongCandidateCount = 0;
  let bestCategory: HandCategory = 'NoEffectiveCards';
  let bestCategoryRank = 0;
  let overlapTotal = 0;
  const aiEffectiveIds = new Set(
    input.aiLockedHand?.effectiveCards.map((card) => card.id) ?? [],
  );

  for (const candidate of candidates) {
    if (candidate.allCardsUnused) {
      allUnusedCandidateCount += 1;
    }

    const evaluation = evaluateHand(candidate.effectiveCards);
    if (evaluation.categoryRank >= 6) {
      strongCandidateCount += 1;
    }
    if (evaluation.categoryRank > bestCategoryRank) {
      bestCategory = evaluation.category;
      bestCategoryRank = evaluation.categoryRank;
    }

    if (input.aiLockedHand !== undefined) {
      const intersectSize = candidate.effectiveCards.filter((card) =>
        aiEffectiveIds.has(card.id),
      ).length;
      overlapTotal += intersectSize / 5;
    }
  }

  return {
    totalCandidateCount: candidates.length,
    allUnusedCandidateCount,
    containsUsedCardCandidateCount: candidates.length - allUnusedCandidateCount,
    strongHandRatio: strongCandidateCount / candidates.length,
    bestPossibleCategory: bestCategory,
    averageOverlapRiskAgainstAiHand:
      input.aiLockedHand === undefined ? 0 : overlapTotal / candidates.length,
    computedAtRound: input.roundNumber,
  };
}

export { chooseLowerNumberCard, scoreLowerNumberCard } from './lower-ai';
export { chooseUpperHand, scoreUpperHand } from './upper-ai';
export { calculateBetConfidence, checkAllInAllowed, chooseBetAction } from './betting-ai';
export type {
  AiAllInState,
  AiReason,
  AiScore,
  AiScoreComponent,
  AllInCheckResult,
  BettingAiDecision,
  BettingAiInput,
  CheckAllInAllowedInput,
  ConfidenceResult,
  CreatePlayerPossibleHandSummaryInput,
  HandId,
  LowerAiDecision,
  LowerAiInput,
  PlayerPossibleHandSummary,
  ScoreBreakdown,
  UpperAiDecision,
  UpperAiInput,
} from './ai-types';
