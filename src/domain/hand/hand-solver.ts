import { type Card } from '../cards/card';
import { buildStandardDeck } from '../cards/deck';
import { createAppError } from '../errors';

export type CardUsage = 'unused' | 'used';
export type SolveMode = 'lowerAvailability' | 'upperSelection';

export type SelectableCard = {
  card: Card;
  usage: CardUsage;
};

export type SolvedCard = {
  card: Card;
  usage: CardUsage;
  effective: boolean;
};

export type SolvedHand = {
  cards: SolvedCard[];
  effectiveCards: Card[];
  totalValue: number;
  usedCardCount: number;
  allCardsUnused: boolean;
};

export type SolveHandsInput = {
  targetValue: number;
  selectableCards: SelectableCard[];
  mode: SolveMode;
  limit?: number;
};

export type SolveResult = {
  targetValue: number;
  hands: SolvedHand[];
  count: number;
  truncated: boolean;
};

export type SolvedHandSummary = {
  totalCount: number;
  allUnusedCount: number;
  containsUsedCount: number;
  minUsedCardCount: number;
  maxUsedCardCount: number;
};

const HAND_SIZE = 5;
const standardCardOrder = new Map(
  buildStandardDeck().map((card, index) => [card.id, index]),
);

function assertIntegerTargetValue(targetValue: number): void {
  if (!Number.isInteger(targetValue)) {
    throw createAppError('invalid-target-value', 'Target value must be an integer', {
      details: { targetValue },
    });
  }
}

function assertUniqueSelectableCards(selectableCards: SelectableCard[]): void {
  const seen = new Set<string>();

  for (const item of selectableCards) {
    if (seen.has(item.card.id)) {
      throw createAppError(
        'duplicate-selectable-card',
        'Selectable cards must not contain duplicate card IDs',
        {
          details: { cardId: item.card.id },
        },
      );
    }

    seen.add(item.card.id);
  }
}

function assertSeparatePiles(drawPile: Card[], discardPile: Card[]): void {
  const seen = new Set<string>();

  for (const card of [...drawPile, ...discardPile]) {
    if (seen.has(card.id)) {
      throw createAppError(
        'card-in-both-piles',
        'Draw pile and discard pile must not contain duplicate card IDs',
        {
          details: { cardId: card.id },
        },
      );
    }

    seen.add(card.id);
  }
}

function compareCardsByStandardOrder(left: Card, right: Card): number {
  return standardCardOrder.get(left.id)! - standardCardOrder.get(right.id)!;
}

function solveKey(hand: SolvedHand): string {
  return hand.cards.map((card) => card.card.id).join(',');
}

function compareSolvedHands(left: SolvedHand, right: SolvedHand): number {
  const leftKey = solveKey(left);
  const rightKey = solveKey(right);

  if (leftKey < rightKey) {
    return -1;
  }

  if (leftKey > rightKey) {
    return 1;
  }

  return 0;
}

function canUseCard(item: SelectableCard, mode: SolveMode): boolean {
  return mode === 'upperSelection' || item.usage === 'unused';
}

function buildSolvedHand(cards: SelectableCard[]): SolvedHand {
  const solvedCards = cards.map((item): SolvedCard => {
    const effective = item.usage === 'unused';

    return {
      card: item.card,
      usage: item.usage,
      effective,
    };
  });
  const effectiveCards = solvedCards
    .filter((item) => item.effective)
    .map((item) => item.card);
  const usedCardCount = solvedCards.length - effectiveCards.length;

  return {
    cards: solvedCards,
    effectiveCards,
    totalValue: solvedCards.reduce((total, item) => total + item.card.pointValue, 0),
    usedCardCount,
    allCardsUnused: usedCardCount === 0,
  };
}

export function solveHands(input: SolveHandsInput): SolveResult {
  assertIntegerTargetValue(input.targetValue);
  assertUniqueSelectableCards(input.selectableCards);

  const limit = input.limit;
  const hands: SolvedHand[] = [];
  let count = 0;
  const selectableCards = input.selectableCards;

  if (selectableCards.length < HAND_SIZE) {
    return {
      targetValue: input.targetValue,
      hands,
      count,
      truncated: false,
    };
  }

  for (let first = 0; first <= selectableCards.length - 5; first += 1) {
    const firstCard = selectableCards[first]!;
    if (!canUseCard(firstCard, input.mode)) {
      continue;
    }

    for (let second = first + 1; second <= selectableCards.length - 4; second += 1) {
      const secondCard = selectableCards[second]!;
      if (!canUseCard(secondCard, input.mode)) {
        continue;
      }

      for (let third = second + 1; third <= selectableCards.length - 3; third += 1) {
        const thirdCard = selectableCards[third]!;
        if (!canUseCard(thirdCard, input.mode)) {
          continue;
        }

        for (let fourth = third + 1; fourth <= selectableCards.length - 2; fourth += 1) {
          const fourthCard = selectableCards[fourth]!;
          if (!canUseCard(fourthCard, input.mode)) {
            continue;
          }

          for (let fifth = fourth + 1; fifth <= selectableCards.length - 1; fifth += 1) {
            const fifthCard = selectableCards[fifth]!;
            if (!canUseCard(fifthCard, input.mode)) {
              continue;
            }

            const totalValue =
              firstCard.card.pointValue +
              secondCard.card.pointValue +
              thirdCard.card.pointValue +
              fourthCard.card.pointValue +
              fifthCard.card.pointValue;

            if (totalValue !== input.targetValue) {
              continue;
            }

            count += 1;
            hands.push(
              buildSolvedHand([firstCard, secondCard, thirdCard, fourthCard, fifthCard]),
            );
          }
        }
      }
    }
  }

  hands.sort(compareSolvedHands);
  const returnedHands = limit === undefined ? hands : hands.slice(0, limit);

  return {
    targetValue: input.targetValue,
    hands: returnedHands,
    count,
    truncated: limit !== undefined && count > returnedHands.length,
  };
}

export function isNumberCardSolvable(targetValue: number, drawPile: Card[]): boolean {
  assertIntegerTargetValue(targetValue);

  if (drawPile.length < HAND_SIZE) {
    return false;
  }

  for (let first = 0; first <= drawPile.length - 5; first += 1) {
    for (let second = first + 1; second <= drawPile.length - 4; second += 1) {
      for (let third = second + 1; third <= drawPile.length - 3; third += 1) {
        for (let fourth = third + 1; fourth <= drawPile.length - 2; fourth += 1) {
          for (let fifth = fourth + 1; fifth <= drawPile.length - 1; fifth += 1) {
            const totalValue =
              drawPile[first]!.pointValue +
              drawPile[second]!.pointValue +
              drawPile[third]!.pointValue +
              drawPile[fourth]!.pointValue +
              drawPile[fifth]!.pointValue;

            if (totalValue === targetValue) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

export function createSelectableCards(
  drawPile: Card[],
  discardPile: Card[],
): SelectableCard[] {
  assertSeparatePiles(drawPile, discardPile);

  const unused = [...drawPile]
    .sort(compareCardsByStandardOrder)
    .map((card): SelectableCard => ({ card, usage: 'unused' }));
  const used = [...discardPile]
    .sort(compareCardsByStandardOrder)
    .map((card): SelectableCard => ({ card, usage: 'used' }));

  return [...unused, ...used];
}

export function summarizeSolvedHands(hands: SolvedHand[]): SolvedHandSummary {
  if (hands.length === 0) {
    return {
      totalCount: 0,
      allUnusedCount: 0,
      containsUsedCount: 0,
      minUsedCardCount: 0,
      maxUsedCardCount: 0,
    };
  }

  let allUnusedCount = 0;
  let minUsedCardCount = Number.POSITIVE_INFINITY;
  let maxUsedCardCount = 0;

  for (const hand of hands) {
    if (hand.allCardsUnused) {
      allUnusedCount += 1;
    }

    minUsedCardCount = Math.min(minUsedCardCount, hand.usedCardCount);
    maxUsedCardCount = Math.max(maxUsedCardCount, hand.usedCardCount);
  }

  return {
    totalCount: hands.length,
    allUnusedCount,
    containsUsedCount: hands.length - allUnusedCount,
    minUsedCardCount,
    maxUsedCardCount,
  };
}
