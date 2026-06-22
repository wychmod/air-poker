import { type Card } from '../cards/card';
import { createAppError } from '../errors';
import {
  HAND_CATEGORY_LABEL,
  HAND_CATEGORY_RANK,
  type HandCategory,
} from './hand-ranking';
import { type SolvedHand } from './hand-solver';

export { getHandCategoryBaseScore, type HandCategory } from './hand-ranking';

export type EvaluatedHand = {
  category: HandCategory;
  categoryRank: number;
  effectiveCardCount: number;
  tiebreakers: number[];
  label: string;
  cardsByRank?: Array<{ rank: number; cards: Card[] }>;
};

export type HandCompareResult = -1 | 0 | 1;

export type RankedSolvedHand = {
  solvedHand: SolvedHand;
  evaluation: EvaluatedHand;
  rank: number;
};

type RankGroup = {
  rank: number;
  cards: Card[];
};

function compareNumbersDescending(left: number, right: number): number {
  return right - left;
}

function createEvaluation(
  category: HandCategory,
  effectiveCards: Card[],
  tiebreakers: number[],
  cardsByRank?: RankGroup[],
): EvaluatedHand {
  return {
    category,
    categoryRank: HAND_CATEGORY_RANK[category],
    effectiveCardCount: effectiveCards.length,
    tiebreakers,
    label: HAND_CATEGORY_LABEL[category],
    ...(cardsByRank === undefined ? {} : { cardsByRank }),
  };
}

function assertEvaluableCards(effectiveCards: Card[]): void {
  if (effectiveCards.length > 5) {
    throw createAppError(
      'too-many-effective-cards',
      'Effective hand cannot contain more than five cards',
      {
        details: { count: effectiveCards.length },
      },
    );
  }

  const seen = new Set<string>();

  for (const card of effectiveCards) {
    if (seen.has(card.id)) {
      throw createAppError(
        'duplicate-card-in-hand',
        'Effective hand cannot contain duplicate card IDs',
        {
          details: { cardId: card.id },
        },
      );
    }

    seen.add(card.id);
  }
}

function groupCardsByRank(cards: Card[]): RankGroup[] {
  const groupsByRank = new Map<number, Card[]>();

  for (const card of cards) {
    const group = groupsByRank.get(card.pokerValue);

    if (group === undefined) {
      groupsByRank.set(card.pokerValue, [card]);
    } else {
      group.push(card);
    }
  }

  return Array.from(groupsByRank.entries())
    .map(([rank, groupCards]) => ({ rank, cards: groupCards }))
    .sort((left, right) => {
      const countDifference = right.cards.length - left.cards.length;

      if (countDifference !== 0) {
        return countDifference;
      }

      return right.rank - left.rank;
    });
}

function sortedRanksDescending(cards: Card[]): number[] {
  return cards.map((card) => card.pokerValue).sort(compareNumbersDescending);
}

function isFlush(cards: Card[]): boolean {
  return cards.length === 5 && cards.every((card) => card.suit === cards[0]!.suit);
}

function getStraightHighRank(cards: Card[]): number | undefined {
  if (cards.length !== 5) {
    return undefined;
  }

  const uniqueRanks = Array.from(new Set(cards.map((card) => card.pokerValue))).sort(
    compareNumbersDescending,
  );

  if (uniqueRanks.length !== 5) {
    return undefined;
  }

  if (uniqueRanks.join(',') === '14,5,4,3,2') {
    return 5;
  }

  for (let index = 0; index < uniqueRanks.length - 1; index += 1) {
    if (uniqueRanks[index]! - uniqueRanks[index + 1]! !== 1) {
      return undefined;
    }
  }

  return uniqueRanks[0];
}

function isRoyalStraightFlush(cards: Card[]): boolean {
  if (!isFlush(cards)) {
    return false;
  }

  const ranks = sortedRanksDescending(cards);

  return ranks.join(',') === '14,13,12,11,10';
}

function evaluateFiveCardHand(cards: Card[], cardsByRank: RankGroup[]): EvaluatedHand {
  const straightHighRank = getStraightHighRank(cards);
  const flush = isFlush(cards);

  if (isRoyalStraightFlush(cards)) {
    return createEvaluation('RoyalStraightFlush', cards, [], cardsByRank);
  }

  if (flush && straightHighRank !== undefined) {
    return createEvaluation('StraightFlush', cards, [straightHighRank], cardsByRank);
  }

  const fourGroup = cardsByRank.find((group) => group.cards.length === 4);

  if (fourGroup !== undefined) {
    const kicker = cardsByRank.find((group) => group.cards.length === 1)!.rank;

    return createEvaluation('FourOfAKind', cards, [fourGroup.rank, kicker], cardsByRank);
  }

  const threeGroup = cardsByRank.find((group) => group.cards.length === 3);
  const pairGroups = cardsByRank.filter((group) => group.cards.length === 2);

  if (threeGroup !== undefined && pairGroups.length === 1) {
    return createEvaluation(
      'FullHouse',
      cards,
      [threeGroup.rank, pairGroups[0]!.rank],
      cardsByRank,
    );
  }

  if (flush) {
    return createEvaluation('Flush', cards, sortedRanksDescending(cards), cardsByRank);
  }

  if (straightHighRank !== undefined) {
    return createEvaluation('Straight', cards, [straightHighRank], cardsByRank);
  }

  if (threeGroup !== undefined) {
    const kickers = cardsByRank
      .filter((group) => group.cards.length === 1)
      .map((group) => group.rank)
      .sort(compareNumbersDescending);

    return createEvaluation(
      'ThreeOfAKind',
      cards,
      [threeGroup.rank, ...kickers],
      cardsByRank,
    );
  }

  if (pairGroups.length === 2) {
    const pairRanks = pairGroups
      .map((group) => group.rank)
      .sort(compareNumbersDescending);
    const kicker = cardsByRank.find((group) => group.cards.length === 1)!.rank;

    return createEvaluation('TwoPair', cards, [...pairRanks, kicker], cardsByRank);
  }

  if (pairGroups.length === 1) {
    const kickers = cardsByRank
      .filter((group) => group.cards.length === 1)
      .map((group) => group.rank)
      .sort(compareNumbersDescending);

    return createEvaluation(
      'OnePair',
      cards,
      [pairGroups[0]!.rank, ...kickers],
      cardsByRank,
    );
  }

  return createEvaluation('HighCard', cards, sortedRanksDescending(cards), cardsByRank);
}

function evaluateFourCardHand(cards: Card[], cardsByRank: RankGroup[]): EvaluatedHand {
  const fourGroup = cardsByRank.find((group) => group.cards.length === 4);

  if (fourGroup !== undefined) {
    const kickers = cardsByRank
      .filter((group) => group.cards.length === 1)
      .map((group) => group.rank)
      .sort(compareNumbersDescending);

    return createEvaluation(
      'FourOfAKind',
      cards,
      [fourGroup.rank, ...kickers],
      cardsByRank,
    );
  }

  const threeGroup = cardsByRank.find((group) => group.cards.length === 3);

  if (threeGroup !== undefined) {
    const kicker = cardsByRank.find((group) => group.cards.length === 1)!.rank;

    return createEvaluation(
      'ThreeOfAKind',
      cards,
      [threeGroup.rank, kicker],
      cardsByRank,
    );
  }

  const pairGroups = cardsByRank.filter((group) => group.cards.length === 2);

  if (pairGroups.length === 2) {
    const pairRanks = pairGroups
      .map((group) => group.rank)
      .sort(compareNumbersDescending);

    return createEvaluation('TwoPair', cards, pairRanks, cardsByRank);
  }

  if (pairGroups.length === 1) {
    const kickers = cardsByRank
      .filter((group) => group.cards.length === 1)
      .map((group) => group.rank)
      .sort(compareNumbersDescending);

    return createEvaluation(
      'OnePair',
      cards,
      [pairGroups[0]!.rank, ...kickers],
      cardsByRank,
    );
  }

  return createEvaluation('HighCard', cards, sortedRanksDescending(cards), cardsByRank);
}

function evaluateThreeCardHand(cards: Card[], cardsByRank: RankGroup[]): EvaluatedHand {
  const threeGroup = cardsByRank.find((group) => group.cards.length === 3);

  if (threeGroup !== undefined) {
    return createEvaluation('ThreeOfAKind', cards, [threeGroup.rank], cardsByRank);
  }

  const pairGroup = cardsByRank.find((group) => group.cards.length === 2);

  if (pairGroup !== undefined) {
    const kicker = cardsByRank.find((group) => group.cards.length === 1)!.rank;

    return createEvaluation('OnePair', cards, [pairGroup.rank, kicker], cardsByRank);
  }

  return createEvaluation('HighCard', cards, sortedRanksDescending(cards), cardsByRank);
}

function evaluateTwoCardHand(cards: Card[], cardsByRank: RankGroup[]): EvaluatedHand {
  const pairGroup = cardsByRank.find((group) => group.cards.length === 2);

  if (pairGroup !== undefined) {
    return createEvaluation('OnePair', cards, [pairGroup.rank], cardsByRank);
  }

  return createEvaluation('HighCard', cards, sortedRanksDescending(cards), cardsByRank);
}

export function evaluateHand(effectiveCards: Card[]): EvaluatedHand {
  assertEvaluableCards(effectiveCards);

  if (effectiveCards.length === 0) {
    return createEvaluation('NoEffectiveCards', effectiveCards, []);
  }

  const cardsByRank = groupCardsByRank(effectiveCards);

  if (effectiveCards.length === 5) {
    return evaluateFiveCardHand(effectiveCards, cardsByRank);
  }

  if (effectiveCards.length === 4) {
    return evaluateFourCardHand(effectiveCards, cardsByRank);
  }

  if (effectiveCards.length === 3) {
    return evaluateThreeCardHand(effectiveCards, cardsByRank);
  }

  if (effectiveCards.length === 2) {
    return evaluateTwoCardHand(effectiveCards, cardsByRank);
  }

  return createEvaluation(
    'HighCard',
    effectiveCards,
    sortedRanksDescending(effectiveCards),
    cardsByRank,
  );
}

function compareNumber(left: number, right: number): HandCompareResult {
  if (left > right) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  return 0;
}

export function compareEvaluatedHands(
  left: EvaluatedHand,
  right: EvaluatedHand,
): HandCompareResult {
  const categoryResult = compareNumber(left.categoryRank, right.categoryRank);

  if (categoryResult !== 0) {
    return categoryResult;
  }

  const countResult = compareNumber(left.effectiveCardCount, right.effectiveCardCount);

  if (countResult !== 0) {
    return countResult;
  }

  const maxLength = Math.max(left.tiebreakers.length, right.tiebreakers.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left.tiebreakers[index] ?? 0;
    const rightValue = right.tiebreakers[index] ?? 0;
    const result = compareNumber(leftValue, rightValue);

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

export function compareHands(leftCards: Card[], rightCards: Card[]): HandCompareResult {
  return compareEvaluatedHands(evaluateHand(leftCards), evaluateHand(rightCards));
}

export function rankSolvedHands(hands: SolvedHand[]): RankedSolvedHand[] {
  const evaluatedHands = hands.map((solvedHand, index) => ({
    solvedHand,
    evaluation: evaluateHand(solvedHand.effectiveCards),
    inputIndex: index,
  }));

  evaluatedHands.sort((left, right) => {
    const comparison = compareEvaluatedHands(left.evaluation, right.evaluation);

    if (comparison !== 0) {
      return -comparison;
    }

    return left.inputIndex - right.inputIndex;
  });

  const rankedHands: RankedSolvedHand[] = [];
  let currentRank = 0;
  let previousEvaluation: EvaluatedHand | undefined;

  for (const item of evaluatedHands) {
    if (
      previousEvaluation === undefined ||
      compareEvaluatedHands(previousEvaluation, item.evaluation) !== 0
    ) {
      currentRank += 1;
      previousEvaluation = item.evaluation;
    }

    rankedHands.push({
      solvedHand: item.solvedHand,
      evaluation: item.evaluation,
      rank: currentRank,
    });
  }

  return rankedHands;
}
