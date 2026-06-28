import { getCallAmount } from '../betting/betting-engine';
import type { BetAction, BetActionType, LegalBetAction } from '../betting/betting-rules';
import { getHandCategoryBaseScore } from '../hand/hand-evaluator';
import type {
  AiScore,
  AllInCheckResult,
  BettingAiDecision,
  BettingAiInput,
  CalculateBetConfidenceInput,
  CheckAllInAllowedInput,
  ConfidenceResult,
} from './ai-types';
import {
  clamp,
  createReason,
  createScore,
  futureDeckPenalty,
  randomJitter,
} from './ai-utils';

type IdealBetAction =
  | { type: 'allIn' }
  | { type: 'raise'; amount: number }
  | { type: 'call' }
  | { type: 'check' }
  | { type: 'fold' };

type ClipResult = {
  action: BetAction | null;
  fallbackReason?: string;
};

export function calculateBetConfidence(
  input: CalculateBetConfidenceInput,
): ConfidenceResult {
  void input.aiHandScore;
  const airDiff = input.aiAir - input.playerAir;
  const airRatio = input.aiAir / 25;
  const percentileComponent = input.aiHandPercentile * 0.6;
  const playerRiskComponent = -input.playerStrongHandRisk * 0.4;
  const airDiffComponent = (airDiff / 25) * 0.2;
  const airRatioPenalty = -Math.max(0, 0.4 - airRatio) * 0.3;
  const confidence = clamp(
    percentileComponent + playerRiskComponent + airDiffComponent + airRatioPenalty,
    0,
    1,
  );

  return {
    confidence,
    components: {
      percentileComponent,
      playerRiskComponent,
      airDiffComponent,
      airRatioPenalty,
    },
  };
}

export function checkAllInAllowed(input: CheckAllInAllowedInput): AllInCheckResult {
  const failedReasons: AllInCheckResult['failedReasons'] = [];

  if (input.confidence < 0.92) {
    failedReasons.push('confidence-below-0.92');
  }
  if (input.aiAir < 5) {
    failedReasons.push('air-below-5');
  }
  if (input.roundNumber < 2 && !input.isTiebreaker) {
    failedReasons.push('round-before-r2-or-tiebreaker');
  }
  if (input.aiAllInState.count >= 2) {
    failedReasons.push('all-in-count-exhausted');
  }
  if (
    input.aiAllInState.lastAllInRound !== null &&
    input.roundNumber - input.aiAllInState.lastAllInRound < 2
  ) {
    failedReasons.push('all-in-cooldown');
  }

  return {
    allowed: failedReasons.length === 0,
    failedReasons,
  };
}

function enabledAction(
  legalActions: LegalBetAction[],
  type: BetActionType,
): LegalBetAction | undefined {
  return legalActions.find(
    (action) => action.type === type && action.disabledReason === undefined,
  );
}

function hasEnabledAction(legalActions: LegalBetAction[]): boolean {
  return legalActions.some((action) => action.disabledReason === undefined);
}

function maxLegalRaise(legalActions: LegalBetAction[]): BetAction | null {
  const raise = enabledAction(legalActions, 'raise');
  if (raise === undefined || raise.minAmount > raise.maxAmount) {
    return null;
  }
  return { actor: 'ai', type: 'raise', amount: raise.maxAmount };
}

function callOrCheckOrFold(input: BettingAiInput, reason: string): ClipResult {
  const call = enabledAction(input.legalActions, 'call');
  const callAmount = getCallAmount(input.betState, 'ai');

  if (
    call !== undefined &&
    callAmount > 0 &&
    input.betState.aiAvailableAir >= callAmount
  ) {
    return {
      action: { actor: 'ai', type: 'call', amount: call.maxAmount },
      fallbackReason: reason,
    };
  }

  const check = enabledAction(input.legalActions, 'check');
  if (check !== undefined) {
    return {
      action: { actor: 'ai', type: 'check', amount: 0 },
      fallbackReason: reason,
    };
  }

  const fold = enabledAction(input.legalActions, 'fold');
  if (fold !== undefined) {
    return {
      action: { actor: 'ai', type: 'fold', amount: 0 },
      fallbackReason: reason,
    };
  }

  return { action: null, fallbackReason: reason };
}

function clipIdealAction(
  input: BettingAiInput,
  ideal: IdealBetAction,
  allInCheck: AllInCheckResult,
): ClipResult {
  if (ideal.type === 'allIn') {
    const allIn = enabledAction(input.legalActions, 'allIn');
    if (allIn !== undefined && allInCheck.allowed) {
      return { action: { actor: 'ai', type: 'allIn', amount: allIn.maxAmount } };
    }

    const fallbackReason =
      allInCheck.failedReasons.length === 0
        ? 'all-in-not-legal'
        : allInCheck.failedReasons.join(',');
    const raise = maxLegalRaise(input.legalActions);
    if (raise !== null) {
      return { action: raise, fallbackReason };
    }
    return callOrCheckOrFold(input, fallbackReason);
  }

  if (ideal.type === 'raise') {
    const raise = enabledAction(input.legalActions, 'raise');
    if (raise !== undefined && raise.minAmount <= raise.maxAmount) {
      return {
        action: {
          actor: 'ai',
          type: 'raise',
          amount: clamp(ideal.amount, raise.minAmount, raise.maxAmount),
        },
      };
    }
    return callOrCheckOrFold(input, 'raise-not-legal');
  }

  if (ideal.type === 'call') {
    const call = enabledAction(input.legalActions, 'call');
    const callAmount = getCallAmount(input.betState, 'ai');
    if (
      call !== undefined &&
      callAmount > 0 &&
      input.betState.aiAvailableAir >= callAmount
    ) {
      return { action: { actor: 'ai', type: 'call', amount: call.maxAmount } };
    }
    return callOrCheckOrFold(input, 'call-not-legal');
  }

  if (ideal.type === 'check') {
    const check = enabledAction(input.legalActions, 'check');
    if (check !== undefined) {
      return { action: { actor: 'ai', type: 'check', amount: 0 } };
    }
    return callOrCheckOrFold(input, 'check-not-legal');
  }

  const fold = enabledAction(input.legalActions, 'fold');
  if (fold !== undefined) {
    return { action: { actor: 'ai', type: 'fold', amount: 0 } };
  }
  const check = enabledAction(input.legalActions, 'check');
  if (check !== undefined) {
    return {
      action: { actor: 'ai', type: 'check', amount: 0 },
      fallbackReason: 'fold-not-legal',
    };
  }
  return { action: null, fallbackReason: 'fold-not-legal' };
}

function scoreBettingHand(input: BettingAiInput): AiScore {
  const categoryScore = getHandCategoryBaseScore(
    input.aiLockedHand.evaluatedHand.category,
  );
  const tiebreakerScore = 50;
  const calamityRiskPenalty =
    input.playerPossibleHandSummary.averageOverlapRiskAgainstAiHand * 100;
  const deckPenalty = futureDeckPenalty(input.aiLockedHand.effectiveCards);

  return createScore([
    { name: 'categoryScore', impact: categoryScore },
    { name: 'tiebreakerScore', impact: tiebreakerScore },
    { name: 'calamityRiskPenalty', impact: -calamityRiskPenalty },
    { name: 'futureDeckPenalty', impact: -deckPenalty },
    { name: 'randomJitter', impact: randomJitter(input.rng) },
  ]);
}

function chooseIdealAction(
  input: BettingAiInput,
  confidence: number,
  allInCheck: AllInCheckResult,
): IdealBetAction {
  void allInCheck;
  const callAmount = getCallAmount(input.betState, 'ai');

  if (confidence >= 0.92) {
    // >=0.92 时理想动作为 allIn；约束是否通过由裁剪层 clipIdealAction 决定降级。
    return { type: 'allIn' };
  }

  if (confidence >= 0.85) {
    const raise = enabledAction(input.legalActions, 'raise');
    return { type: 'raise', amount: raise?.maxAmount ?? 1 };
  }

  if (confidence >= 0.65) {
    const raise = enabledAction(input.legalActions, 'raise');
    if (raise !== undefined && raise.minAmount <= 3) {
      return { type: 'raise', amount: Math.min(3, raise.maxAmount) };
    }
    return { type: 'call' };
  }

  if (confidence >= 0.4) {
    return callAmount > 0 ? { type: 'call' } : { type: 'check' };
  }

  if (confidence >= 0.2) {
    return callAmount > 0 && callAmount <= 3 ? { type: 'call' } : { type: 'fold' };
  }

  return { type: 'fold' };
}

export function chooseBetAction(input: BettingAiInput): BettingAiDecision {
  if (!hasEnabledAction(input.legalActions)) {
    return { ok: false, code: 'no-legal-bet-action' };
  }

  const aiHandScore = scoreBettingHand(input);
  const confidenceResult = calculateBetConfidence({
    aiHandScore,
    aiHandPercentile: input.aiHandPercentile,
    playerStrongHandRisk: input.playerPossibleHandSummary.strongHandRatio,
    aiAir: input.aiAir,
    playerAir: input.playerAir,
  });
  const allInCheck = checkAllInAllowed({
    confidence: confidenceResult.confidence,
    aiAir: input.aiAir,
    roundNumber: input.roundNumber,
    isTiebreaker: input.isTiebreaker,
    aiAllInState: input.aiAllInState,
  });
  const ideal = chooseIdealAction(input, confidenceResult.confidence, allInCheck);
  const clipped = clipIdealAction(input, ideal, allInCheck);

  if (clipped.action === null) {
    return { ok: false, code: 'no-legal-bet-action' };
  }

  const reason = createReason(
    clipped.action.type,
    aiHandScore,
    `BettingAI chose ${clipped.action.type} with confidence ${confidenceResult.confidence.toFixed(
      2,
    )}.`,
  );

  return {
    ok: true,
    action: clipped.action,
    confidence: confidenceResult.confidence,
    allInCheck,
    reason,
    ...(clipped.fallbackReason === undefined
      ? {}
      : { fallbackReason: clipped.fallbackReason }),
  };
}
