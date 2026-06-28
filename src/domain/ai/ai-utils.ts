import type { Card } from '../cards/card';
import type { Rng } from '../cards/deck';
import {
  compareEvaluatedHands,
  evaluateHand,
  getHandCategoryBaseScore,
} from '../hand/hand-evaluator';
import type { SolvedHand } from '../hand/hand-solver';
import type { LockedHand } from '../game/round-resolution';
import type { AiReason, AiScore, AiScoreComponent } from './ai-types';

const IMPORTANT_FUTURE_RANKS = new Set(['A', 'K', 'Q', 'J']);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomJitter(rng: Rng): number {
  return rng() * 6 - 3;
}

export function sumScoreComponents(components: AiScoreComponent[]): number {
  return components.reduce((total, component) => total + component.impact, 0);
}

export function createScore(components: AiScoreComponent[]): AiScore {
  return {
    total: sumScoreComponents(components),
    components,
  };
}

export function createReason(
  primaryAction: string,
  score: AiScore,
  summary: string,
): AiReason {
  const topFactors = [...score.components]
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .slice(0, 3);

  return {
    primaryAction,
    topFactors,
    summary,
  };
}

export function getScoreComponent(score: AiScore, name: string): number {
  return score.components.find((component) => component.name === name)?.impact ?? 0;
}

export function countFutureDeckPressureCards(cards: Card[]): number {
  return cards.filter((card) => IMPORTANT_FUTURE_RANKS.has(card.rank)).length;
}

export function futureDeckPenalty(cards: Card[]): number {
  return countFutureDeckPressureCards(cards) * 0.5;
}

export function strongestSolvedHand(hands: SolvedHand[]): SolvedHand | undefined {
  let best: SolvedHand | undefined;

  for (const hand of hands) {
    if (best === undefined) {
      best = hand;
      continue;
    }

    const comparison = compareEvaluatedHands(
      evaluateHand(hand.effectiveCards),
      evaluateHand(best.effectiveCards),
    );

    if (comparison > 0) {
      best = hand;
    }
  }

  return best;
}

export function createHandId(hand: SolvedHand): string {
  return hand.cards
    .map((item) => item.card.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join(',');
}

// AI 锁定成手在该 targetValue 候选成手中按 handCategoryBaseScore 升序的百分位。
// 08 文档钉死：rank 从 0 计（最弱为 0，最强为 N-1），percentile = rank / N。
// 同 baseScore 内按 handId 字典序稳定排序，保证固定输入下可复现。
// 候选为空时返回 0（兜底，理论上锁定成手存在则候选必非空）。
export function calculateAiHandPercentile(
  aiLockedHand: LockedHand,
  aiCandidateHands: SolvedHand[],
): number {
  if (aiCandidateHands.length === 0) {
    return 0;
  }

  const ranked = aiCandidateHands
    .map((hand) => ({
      handId: createHandId(hand),
      baseScore: getHandCategoryBaseScore(evaluateHand(hand.effectiveCards).category),
    }))
    .sort((left, right) => {
      if (left.baseScore !== right.baseScore) {
        return left.baseScore - right.baseScore;
      }
      return left.handId < right.handId ? -1 : left.handId > right.handId ? 1 : 0;
    });

  const lockedId = aiLockedHand.effectiveCards
    .map((card) => card.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join(',');
  const rank = ranked.findIndex((item) => item.handId === lockedId);

  // 锁定成手不在候选集合中时（不应发生），按最弱处理，返回 0。
  if (rank === -1) {
    return 0;
  }

  return rank / ranked.length;
}

export function createLockedHandFromSolvedHand(hand: SolvedHand): LockedHand {
  const selectedCards = hand.cards.map((item) => item.card);
  const effectiveCards = [...hand.effectiveCards];

  return {
    selectedCards,
    effectiveCards,
    evaluatedHand: evaluateHand(effectiveCards),
  };
}

export function compareScoresForOrder<TKey extends string>(
  byKey: Record<TKey, AiScore>,
  left: TKey,
  right: TKey,
): number {
  const leftScore = byKey[left];
  const rightScore = byKey[right];
  const totalDifference = rightScore.total - leftScore.total;

  if (totalDifference !== 0) {
    return totalDifference;
  }

  const leftFuturePenalty = Math.abs(getScoreComponent(leftScore, 'futureDeckPenalty'));
  const rightFuturePenalty = Math.abs(getScoreComponent(rightScore, 'futureDeckPenalty'));
  const futurePenaltyDifference = leftFuturePenalty - rightFuturePenalty;

  if (futurePenaltyDifference !== 0) {
    return futurePenaltyDifference;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}
