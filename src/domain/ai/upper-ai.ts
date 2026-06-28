import type { HandId, UpperAiDecision, UpperAiInput } from './ai-types';
import type { AiScore, ScoreBreakdown, ScoreUpperInput } from './ai-types';
import {
  compareEvaluatedHands,
  evaluateHand,
  getHandCategoryBaseScore,
  type EvaluatedHand,
} from '../hand/hand-evaluator';
import type { SolvedHand } from '../hand/hand-solver';
import {
  compareScoresForOrder,
  createHandId,
  createReason,
  createScore,
  futureDeckPenalty,
  randomJitter,
} from './ai-utils';

type RankedCandidate = {
  hand: SolvedHand;
  evaluation: EvaluatedHand;
  handId: HandId;
  strengthIndex: number;
  strengthCount: number;
};

function compareCandidatesByStrength(left: RankedCandidate, right: RankedCandidate) {
  const comparison = compareEvaluatedHands(left.evaluation, right.evaluation);
  if (comparison !== 0) {
    return -comparison;
  }
  return left.handId < right.handId ? -1 : left.handId > right.handId ? 1 : 0;
}

function tiebreakerScore(strengthIndex: number, strengthCount: number): number {
  if (strengthCount <= 1) {
    return 50;
  }
  return 50 * ((strengthCount - 1 - strengthIndex) / (strengthCount - 1));
}

function createUpperScore(
  input: ScoreUpperInput,
  normalizedTiebreakerScore: number,
): AiScore {
  const calamityRiskPenalty =
    input.playerPossibleHandSummary.averageOverlapRiskAgainstAiHand * 100;
  const deckPenalty = futureDeckPenalty(input.solvedHand.effectiveCards);

  return createScore([
    {
      name: 'categoryScore',
      impact: getHandCategoryBaseScore(input.evaluatedHand.category),
    },
    {
      name: 'tiebreakerScore',
      impact: normalizedTiebreakerScore,
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

export function scoreUpperHand(input: ScoreUpperInput): AiScore {
  return createUpperScore(input, 50);
}

export function chooseUpperHand(input: UpperAiInput): UpperAiDecision {
  if (input.candidateHands.length === 0) {
    return { ok: false, code: 'no-upper-hand-candidates' };
  }

  const candidates: RankedCandidate[] = input.candidateHands.map((hand) => ({
    hand,
    evaluation: evaluateHand(hand.effectiveCards),
    handId: createHandId(hand),
    strengthIndex: 0,
    strengthCount: input.candidateHands.length,
  }));
  candidates.sort(compareCandidatesByStrength);

  const rankedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    strengthIndex: index,
  }));

  const byKey = {} as Record<HandId, AiScore>;
  const keys: HandId[] = [];

  for (const candidate of rankedCandidates) {
    keys.push(candidate.handId);
    byKey[candidate.handId] = createUpperScore(
      {
        solvedHand: candidate.hand,
        evaluatedHand: candidate.evaluation,
        playerPossibleHandSummary: input.playerPossibleHandSummary,
        rng: input.rng,
      },
      tiebreakerScore(candidate.strengthIndex, candidate.strengthCount),
    );
  }

  const order = keys.sort((left, right) => compareScoresForOrder(byKey, left, right));
  const lockedHandId = order[0];

  if (lockedHandId === undefined) {
    return { ok: false, code: 'no-upper-hand-candidates' };
  }

  const selectedScore = byKey[lockedHandId]!;

  return {
    ok: true,
    lockedHandId,
    scoreBreakdown: {
      byKey,
      order,
    } satisfies ScoreBreakdown<HandId>,
    reason: createReason(
      `lock ${lockedHandId}`,
      selectedScore,
      `UpperAI locked ${lockedHandId} from ${input.candidateHands.length} candidate hands.`,
    ),
  };
}
