import type { NumberCardId } from '../cards/number-card-generator';
import { createSelectableCards, solveHands, type SolvedHand } from '../hand/hand-solver';
import { evaluateHand, getHandCategoryBaseScore } from '../hand/hand-evaluator';
import type {
  AiScore,
  LowerAiDecision,
  LowerAiInput,
  PlayerPossibleHandSummary,
  ScoreBreakdown,
  ScoreLowerInput,
} from './ai-types';
import {
  compareScoresForOrder,
  createReason,
  createScore,
  futureDeckPenalty,
  randomJitter,
  strongestSolvedHand,
} from './ai-utils';

export function createEmptyPlayerPossibleHandSummary(
  roundNumber: number,
): PlayerPossibleHandSummary {
  return {
    totalCandidateCount: 0,
    allUnusedCandidateCount: 0,
    containsUsedCardCandidateCount: 0,
    strongHandRatio: 0,
    bestPossibleCategory: 'NoEffectiveCards',
    averageOverlapRiskAgainstAiHand: 0,
    computedAtRound: roundNumber,
  };
}

function airPressureAdjustment(aiAir: number): number {
  const airRatio = aiAir / 25;

  if (airRatio >= 0.8) {
    return -10;
  }
  if (airRatio >= 0.5) {
    return 0;
  }
  if (airRatio >= 0.3) {
    return 20;
  }
  return 50;
}

function roundAdjustment(roundNumber: number): number {
  if (roundNumber <= 1) {
    return 0;
  }
  if (roundNumber === 2) {
    return 5;
  }
  if (roundNumber === 3) {
    return 10;
  }
  if (roundNumber === 4) {
    return 20;
  }
  return 30;
}

function scoreBestHandCategory(candidateHands: SolvedHand[]): number {
  const best = strongestSolvedHand(candidateHands);
  if (best === undefined) {
    return 0;
  }
  return getHandCategoryBaseScore(evaluateHand(best.effectiveCards).category);
}

export function scoreLowerNumberCard(input: ScoreLowerInput): AiScore {
  const bestHand = strongestSolvedHand(input.candidateHands);
  const bestEffectiveCards = bestHand?.effectiveCards ?? [];
  const calamityRiskPenalty =
    input.playerPossibleHandSummary.averageOverlapRiskAgainstAiHand * 100;
  const deckPenalty = futureDeckPenalty(bestEffectiveCards);

  return createScore([
    {
      name: 'handCategoryScore',
      impact: scoreBestHandCategory(input.candidateHands),
    },
    {
      name: 'candidateCountScore',
      impact: input.candidateHands.length * 0.1,
    },
    {
      name: 'airPressureAdjustment',
      impact: airPressureAdjustment(input.aiAir),
    },
    {
      name: 'roundAdjustment',
      impact: roundAdjustment(input.roundNumber),
    },
    {
      name: 'calamityRiskPenalty',
      impact: -calamityRiskPenalty,
    },
    {
      name: 'futureDeckPenalty',
      impact: -deckPenalty,
    },
    {
      name: 'randomJitter',
      impact: randomJitter(input.rng),
    },
  ]);
}

function solveCandidateHands(input: LowerAiInput, targetValue: number): SolvedHand[] {
  const selectableCards = createSelectableCards(input.drawPile, input.discardPile);
  return solveHands({
    targetValue,
    selectableCards,
    mode: 'upperSelection',
  }).hands;
}

export function chooseLowerNumberCard(input: LowerAiInput): LowerAiDecision {
  const playerPossibleHandSummary = createEmptyPlayerPossibleHandSummary(
    input.roundNumber,
  );
  const byKey = {} as Record<NumberCardId, AiScore>;
  const disabledCardReasons = {} as Record<NumberCardId, string>;

  for (const numberCard of input.availableNumberCards) {
    if (numberCard.status !== 'available') {
      disabledCardReasons[numberCard.id] = 'number-card-already-used';
      continue;
    }

    const candidateHands = solveCandidateHands(input, numberCard.value);
    if (candidateHands.length === 0) {
      disabledCardReasons[numberCard.id] = 'no-solvable-number-card';
      continue;
    }

    byKey[numberCard.id] = scoreLowerNumberCard({
      numberCard,
      candidateHands,
      roundNumber: input.roundNumber,
      aiAir: input.aiAir,
      playerPossibleHandSummary,
      rng: input.rng,
    });
  }

  const order = (Object.keys(byKey) as NumberCardId[]).sort((left, right) =>
    compareScoresForOrder(byKey, left, right),
  );
  const selectedNumberCardId = order[0];

  if (selectedNumberCardId === undefined) {
    return { ok: false, code: 'no-solvable-number-card' };
  }

  const selectedScore = byKey[selectedNumberCardId]!;
  return {
    ok: true,
    selectedNumberCardId,
    scoreBreakdown: {
      byKey,
      order,
    } satisfies ScoreBreakdown<NumberCardId>,
    reason: createReason(
      `select ${selectedNumberCardId}`,
      selectedScore,
      `LowerAI selected ${selectedNumberCardId} from ${order.length} solvable number cards.`,
    ),
    disabledCardReasons,
  };
}
