import { describe, expect, it } from 'vitest';

import { createInitialBetState, getLegalBetActions } from '../betting/betting-engine';
import type { BetState } from '../betting/betting-rules';
import { applyBetAction } from '../betting/betting-engine';
import type { Card, CardId } from '../cards/card';
import { buildStandardDeck, type Rng } from '../cards/deck';
import type { NumberCard } from '../cards/number-card-generator';
import { evaluateHand } from '../hand/hand-evaluator';
import type { SolvedHand } from '../hand/hand-solver';
import type { LockedHand } from '../game/round-resolution';
import { calculateBetConfidence, checkAllInAllowed, chooseBetAction } from './betting-ai';
import { chooseLowerNumberCard, createEmptyPlayerPossibleHandSummary } from './lower-ai';
import { chooseUpperHand } from './upper-ai';
import {
  calculateAiHandPercentile,
  createHandId,
  createLockedHandFromSolvedHand,
  createPlayerPossibleHandSummary,
} from './ai-controller';
import type {
  BettingAiInput,
  LowerAiInput,
  UpperAiInput,
  PlayerPossibleHandSummary,
} from './ai-types';

const deck = buildStandardDeck();
const cardsById = new Map<CardId, Card>(deck.map((card) => [card.id, card]));

function card(id: CardId): Card {
  const value = cardsById.get(id);
  if (value === undefined) {
    throw new Error(`missing test card ${id}`);
  }
  return value;
}

function fixedRng(value: number): Rng {
  return () => value;
}

function solvedHand(ids: CardId[], usedIds: CardId[] = []): SolvedHand {
  const used = new Set<CardId>(usedIds);
  const solvedCards = ids.map((id) => {
    const target = card(id);
    const usage = used.has(id) ? 'used' : 'unused';
    return {
      card: target,
      usage,
      effective: usage === 'unused',
    } as const;
  });
  const effectiveCards = solvedCards
    .filter((item) => item.effective)
    .map((item) => item.card);

  return {
    cards: solvedCards,
    effectiveCards,
    totalValue: solvedCards.reduce((total, item) => total + item.card.pointValue, 0),
    usedCardCount: solvedCards.length - effectiveCards.length,
    allCardsUnused: effectiveCards.length === solvedCards.length,
  };
}

function lockedHand(ids: CardId[]): LockedHand {
  const effectiveCards = ids.map(card);
  return {
    selectedCards: [...effectiveCards],
    effectiveCards,
    evaluatedHand: evaluateHand(effectiveCards),
  };
}

function numberCard(id: NumberCard['id'], value: number): NumberCard {
  return {
    id,
    owner: 'ai',
    value,
    proofHand: [],
    status: 'available',
  };
}

function playerSummary(overrides: Partial<PlayerPossibleHandSummary> = {}) {
  return {
    ...createEmptyPlayerPossibleHandSummary(1),
    ...overrides,
  };
}

function guardedInput<T extends object>(input: T): T {
  Object.freeze(input);
  return new Proxy(input, {
    get(target, key, receiver) {
      if (key in target) {
        return Reflect.get(target, key, receiver) as unknown;
      }
      const error = new Error('AI accessed undeclared DTO field');
      Object.assign(error, { code: 'ai-honest-info-access' });
      throw error;
    },
  });
}

describe('AI DTO type boundary', () => {
  it('does not expose playerLockedHand on AI input DTOs', () => {
    type LowerHasPlayerLockedHand = 'playerLockedHand' extends keyof LowerAiInput
      ? true
      : false;
    type UpperHasPlayerLockedHand = 'playerLockedHand' extends keyof UpperAiInput
      ? true
      : false;
    type BettingHasPlayerLockedHand = 'playerLockedHand' extends keyof BettingAiInput
      ? true
      : false;

    const lowerHasPlayerLockedHand: LowerHasPlayerLockedHand = false;
    const upperHasPlayerLockedHand: UpperHasPlayerLockedHand = false;
    const bettingHasPlayerLockedHand: BettingHasPlayerLockedHand = false;

    expect(lowerHasPlayerLockedHand).toBe(false);
    expect(upperHasPlayerLockedHand).toBe(false);
    expect(bettingHasPlayerLockedHand).toBe(false);
  });
});

describe('createPlayerPossibleHandSummary', () => {
  it('summarizes public player candidates without leaking a selected hand', () => {
    const royal = solvedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']);
    const highCardWithUsed = solvedHand(['C-2', 'D-3', 'H-4', 'S-5', 'C-7'], ['C-7']);
    const aiHand = lockedHand(['S-A', 'S-K', 'C-2', 'D-3', 'H-8']);

    const summary = createPlayerPossibleHandSummary({
      playerTargetValue: 47,
      playerCandidateHands: [royal, highCardWithUsed],
      aiLockedHand: aiHand,
      roundNumber: 3,
    });

    expect(summary.totalCandidateCount).toBe(2);
    expect(summary.allUnusedCandidateCount).toBe(1);
    expect(summary.containsUsedCardCandidateCount).toBe(1);
    expect(summary.strongHandRatio).toBe(0.5);
    expect(summary.bestPossibleCategory).toBe('RoyalStraightFlush');
    expect(summary.averageOverlapRiskAgainstAiHand).toBeCloseTo(0.4);
    expect(summary.computedAtRound).toBe(3);
    expect(Object.keys(summary)).not.toContain('playerLockedHand');
  });
});

describe('LowerAI', () => {
  it('selects the highest scoring solvable number card and explains the score', () => {
    const decision = chooseLowerNumberCard({
      availableNumberCards: [numberCard('N-royal', 47), numberCard('N-bad', 99)],
      drawPile: deck,
      discardPile: [],
      roundNumber: 5,
      isTiebreaker: false,
      aiAir: 8,
      playerAir: 12,
      rng: fixedRng(0.5),
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      return;
    }

    expect(decision.selectedNumberCardId).toBe('N-royal');
    expect(decision.disabledCardReasons['N-bad']).toBe('no-solvable-number-card');
    expect(decision.scoreBreakdown.order[0]).toBe('N-royal');
    expect(
      decision.scoreBreakdown.byKey['N-royal']!.components.map((item) => item.name),
    ).toContain('handCategoryScore');
    expect(decision.reason.primaryAction).not.toBe('');
    expect(decision.reason.topFactors.length).toBeGreaterThan(0);
    expect(decision.reason.summary).not.toBe('');
  });

  it('does not access undeclared DTO fields at runtime', () => {
    const input = guardedInput({
      availableNumberCards: [numberCard('N-royal', 47)],
      drawPile: deck,
      discardPile: [],
      roundNumber: 1,
      isTiebreaker: false,
      aiAir: 23,
      playerAir: 23,
      rng: fixedRng(0.5),
    } satisfies LowerAiInput);

    expect(() => chooseLowerNumberCard(input)).not.toThrow();
  });
});

describe('UpperAI', () => {
  it('locks the strongest candidate hand with stable hand IDs', () => {
    const royal = solvedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']);
    const highCard = solvedHand(['C-2', 'D-3', 'H-4', 'S-5', 'C-7']);
    const decision = chooseUpperHand({
      aiTargetValue: 47,
      candidateHands: [highCard, royal],
      playerPossibleHandSummary: playerSummary(),
      discardPile: [],
      rng: fixedRng(0.5),
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      return;
    }

    expect(decision.lockedHandId).toBe(createHandId(royal));
    expect(decision.scoreBreakdown.order[0]).toBe(createHandId(royal));
    expect(decision.reason.primaryAction).not.toBe('');
  });
});

describe('BettingAI', () => {
  it('calculates confidence from percentile, player risk and Air pressure', () => {
    const result = calculateBetConfidence({
      aiHandScore: {
        total: 1000,
        components: [{ name: 'categoryScore', impact: 1000 }],
      },
      aiHandPercentile: 0.75,
      playerStrongHandRisk: 0.25,
      aiAir: 30,
      playerAir: 10,
    });

    expect(result.components.percentileComponent).toBeCloseTo(0.45);
    expect(result.components.playerRiskComponent).toBeCloseTo(-0.1);
    expect(result.components.airDiffComponent).toBeCloseTo(0.16);
    expect(result.components.airRatioPenalty).toBeCloseTo(0);
    expect(result.confidence).toBeCloseTo(0.51);
  });

  it('reports every all-in constraint failure with stable reason codes', () => {
    const result = checkAllInAllowed({
      confidence: 0.7,
      aiAir: 4,
      roundNumber: 1,
      isTiebreaker: false,
      aiAllInState: { count: 2, lastAllInRound: 0 },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedReasons).toEqual([
      'confidence-below-0.92',
      'air-below-5',
      'round-before-r2-or-tiebreaker',
      'all-in-count-exhausted',
      'all-in-cooldown',
    ]);
  });

  it('downgrades blocked all-in to raise when confidence stays high', () => {
    const initial = createInitialBetState({
      playerAvailableAir: 10,
      aiAvailableAir: 80,
    });
    const afterPlayerBet = applyBetAction(initial, {
      actor: 'player',
      type: 'bet',
      amount: 3,
    });
    if (!afterPlayerBet.ok) {
      throw new Error(afterPlayerBet.code);
    }
    const betState: BetState = afterPlayerBet.state;
    const aiLockedHand = lockedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']);
    const decision = chooseBetAction({
      aiLockedHand,
      aiHandPercentile: 1,
      playerPossibleHandSummary: playerSummary({ strongHandRatio: 0 }),
      betState,
      roundNumber: 3,
      isTiebreaker: false,
      aiAir: 80,
      playerAir: 0,
      aiAllInState: { count: 1, lastAllInRound: 2 },
      legalActions: getLegalBetActions(betState, 'ai'),
      rng: fixedRng(0.5),
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      return;
    }

    expect(decision.allInCheck.allowed).toBe(false);
    expect(decision.allInCheck.failedReasons).toContain('all-in-cooldown');
    expect(decision.action.type).toBe('raise');
    expect(decision.fallbackReason).toContain('all-in-cooldown');
  });

  it('returns no-legal-bet-action when every action is disabled', () => {
    const decision = chooseBetAction({
      aiLockedHand: createLockedHandFromSolvedHand(
        solvedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']),
      ),
      aiHandPercentile: 1,
      playerPossibleHandSummary: playerSummary(),
      betState: createInitialBetState({ playerAvailableAir: 1, aiAvailableAir: 1 }),
      roundNumber: 2,
      isTiebreaker: false,
      aiAir: 1,
      playerAir: 1,
      aiAllInState: { count: 0, lastAllInRound: null },
      legalActions: [
        {
          type: 'check',
          minAmount: 0,
          maxAmount: 0,
          disabledReason: 'not-current-actor',
        },
      ],
      rng: fixedRng(0.5),
    });

    expect(decision).toEqual({ ok: false, code: 'no-legal-bet-action' });
  });

  it('calculates AI hand percentile as rank/N against candidate hands', () => {
    const royal = solvedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']);
    const highCard = solvedHand(['C-2', 'D-3', 'H-4', 'S-5', 'C-7']);
    const candidates = [highCard, royal];

    // 锁定高牌（最弱，rank=0）→ 0 / 2 = 0。
    expect(
      calculateAiHandPercentile(
        lockedHand(['C-2', 'D-3', 'H-4', 'S-5', 'C-7']),
        candidates,
      ),
    ).toBe(0);
    // 锁定皇家同花顺（最强，rank=1）→ 1 / 2 = 0.5。
    expect(
      calculateAiHandPercentile(
        lockedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']),
        candidates,
      ),
    ).toBe(0.5);
    // 候选为空 → 0 兜底。
    expect(
      calculateAiHandPercentile(lockedHand(['S-A', 'S-K', 'S-Q', 'S-J', 'S-10']), []),
    ).toBe(0);
    // 锁定成手不在候选集合 → 0。
    expect(
      calculateAiHandPercentile(
        lockedHand(['C-2', 'D-3', 'H-4', 'S-5', 'C-8']),
        candidates,
      ),
    ).toBe(0);
  });
});
