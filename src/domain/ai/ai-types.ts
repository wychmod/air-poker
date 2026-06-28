import type { BetAction, BetState, LegalBetAction } from '../betting/betting-rules';
import type { Card } from '../cards/card';
import type { NumberCard, NumberCardId } from '../cards/number-card-generator';
import type { Rng } from '../cards/deck';
import type { HandCategory, EvaluatedHand } from '../hand/hand-evaluator';
import type { SolvedHand } from '../hand/hand-solver';
import type { LockedHand } from '../game/round-resolution';

export type HandId = string;

export type AiAllInState = {
  count: number;
  lastAllInRound: number | null;
};

export type LowerAiInput = {
  availableNumberCards: NumberCard[];
  drawPile: Card[];
  discardPile: Card[];
  roundNumber: number;
  isTiebreaker: boolean;
  aiAir: number;
  playerAir: number;
  rng: Rng;
};

export type UpperAiInput = {
  aiTargetValue: number;
  candidateHands: SolvedHand[];
  playerPossibleHandSummary: PlayerPossibleHandSummary;
  discardPile: Card[];
  rng: Rng;
};

export type BettingAiInput = {
  aiLockedHand: LockedHand;
  // AI 锁定成手在该 targetValue 候选成手中按 handCategoryBaseScore 升序的百分位
  //（rank / N，rank 从 0 计）。由 round-flow 按 08 文档口径预算后传入，不读玩家隐藏信息。
  aiHandPercentile: number;
  playerPossibleHandSummary: PlayerPossibleHandSummary;
  betState: BetState;
  roundNumber: number;
  isTiebreaker: boolean;
  aiAir: number;
  playerAir: number;
  aiAllInState: AiAllInState;
  legalActions: LegalBetAction[];
  rng: Rng;
};

export type AiScoreComponent = {
  name: string;
  impact: number;
};

export type AiScore = {
  total: number;
  components: AiScoreComponent[];
};

export type ScoreBreakdown<TKey extends string> = {
  byKey: Record<TKey, AiScore>;
  order: TKey[];
};

export type AiReason = {
  primaryAction: string;
  topFactors: AiScoreComponent[];
  summary: string;
};

export type PlayerPossibleHandSummary = {
  totalCandidateCount: number;
  allUnusedCandidateCount: number;
  containsUsedCardCandidateCount: number;
  strongHandRatio: number;
  bestPossibleCategory: HandCategory;
  averageOverlapRiskAgainstAiHand: number;
  computedAtRound: number;
};

export type LowerAiDecision =
  | {
      ok: true;
      selectedNumberCardId: NumberCardId;
      scoreBreakdown: ScoreBreakdown<NumberCardId>;
      reason: AiReason;
      disabledCardReasons: Record<NumberCardId, string>;
    }
  | { ok: false; code: 'no-solvable-number-card' };

export type UpperAiDecision =
  | {
      ok: true;
      lockedHandId: HandId;
      scoreBreakdown: ScoreBreakdown<HandId>;
      reason: AiReason;
    }
  | { ok: false; code: 'no-upper-hand-candidates' };

export type AllInFailureReason =
  | 'confidence-below-0.92'
  | 'air-below-5'
  | 'round-before-r2-or-tiebreaker'
  | 'all-in-count-exhausted'
  | 'all-in-cooldown';

export type AllInCheckResult = {
  allowed: boolean;
  failedReasons: AllInFailureReason[];
};

export type BettingAiDecision =
  | {
      ok: true;
      action: BetAction;
      confidence: number;
      allInCheck: AllInCheckResult;
      reason: AiReason;
      fallbackReason?: string;
    }
  | { ok: false; code: 'no-legal-bet-action' };

export type ScoreLowerInput = {
  numberCard: NumberCard;
  candidateHands: SolvedHand[];
  roundNumber: number;
  aiAir: number;
  playerPossibleHandSummary: PlayerPossibleHandSummary;
  rng: Rng;
};

export type ScoreUpperInput = {
  solvedHand: SolvedHand;
  evaluatedHand: EvaluatedHand;
  playerPossibleHandSummary: PlayerPossibleHandSummary;
  rng: Rng;
};

export type CalculateBetConfidenceInput = {
  aiHandScore: AiScore;
  aiHandPercentile: number;
  playerStrongHandRisk: number;
  aiAir: number;
  playerAir: number;
};

export type ConfidenceResult = {
  confidence: number;
  components: {
    percentileComponent: number;
    playerRiskComponent: number;
    airDiffComponent: number;
    airRatioPenalty: number;
  };
};

export type CheckAllInAllowedInput = {
  confidence: number;
  aiAir: number;
  roundNumber: number;
  isTiebreaker: boolean;
  aiAllInState: AiAllInState;
};

export type CreatePlayerPossibleHandSummaryInput = {
  playerTargetValue: number;
  playerCandidateHands: SolvedHand[];
  aiLockedHand?: LockedHand;
  roundNumber: number;
};
