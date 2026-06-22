import type { Card } from './card';
import { buildStandardDeck, shuffleDeck, uniqueCards, type Rng } from './deck';

export type NumberCardId = `N-${string}`;
export type NumberCardOwner = 'player' | 'ai';
export type NumberCardStatus = 'available' | 'used' | 'replaced';

export type UnassignedNumberCard = {
  id: NumberCardId;
  value: number;
  proofHand: Card[];
  status: NumberCardStatus;
};

export type NumberCard = UnassignedNumberCard & {
  owner: NumberCardOwner;
};

export type NumberCardDeal = {
  playerCards: NumberCard[];
  aiCards: NumberCard[];
  burnCards: Card[];
  allNumberCards: NumberCard[];
  sourceDeck: Card[];
  attempts: number;
  seed: string;
};

export type NumberCardErrorCode =
  | 'invalid-source-deck'
  | 'balance-threshold-exceeded'
  | 'number-card-generation-failed'
  | 'number-card-not-found'
  | 'number-card-already-used'
  | 'not-enough-cards'
  | 'no-legal-replacement-hand'
  | 'replacement-still-unsolvable';

type FailureResult<Code extends NumberCardErrorCode> = {
  ok: false;
  code: Code;
  message: string;
};

export type CreateNumberCardsFromDeckResult =
  | {
      ok: true;
      numberCards: UnassignedNumberCard[];
      burnCards: Card[];
    }
  | FailureResult<'invalid-source-deck'>;

export type AssignmentResult =
  | {
      ok: true;
      playerCards: NumberCard[];
      aiCards: NumberCard[];
      difference: number;
    }
  | (FailureResult<'balance-threshold-exceeded'> & {
      bestDifference: number;
    });

export type GenerateNumberCardDealInput = {
  rng: Rng;
  seed?: string;
  maxAttempts?: number;
  balanceThreshold?: number;
  isSolvable: (value: number, availableCards: Card[]) => boolean;
};

export type NumberCardDealResult =
  | {
      ok: true;
      deal: NumberCardDeal;
    }
  | (FailureResult<'number-card-generation-failed'> & {
      attempts: number;
      reason: string;
    });

export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      details?: unknown;
    };

export type MarkNumberCardUsedResult =
  | {
      ok: true;
      cards: NumberCard[];
    }
  | FailureResult<'number-card-not-found' | 'number-card-already-used'>;

export type ReplacementHandSolver = (targetValue: number, drawPile: Card[]) => Card[][];

export type ReplaceUnsolvableInput = {
  owner: NumberCardOwner;
  cards: NumberCard[];
  drawPile: Card[];
  rng: Rng;
  isSolvable: (value: number, availableCards: Card[]) => boolean;
  solveReplacementHands?: ReplacementHandSolver;
};

export type ReplaceNumberCardResult =
  | {
      ok: true;
      cards: NumberCard[];
      replacement: NumberCard;
    }
  | FailureResult<
      'not-enough-cards' | 'no-legal-replacement-hand' | 'replacement-still-unsolvable'
    >;

const NUMBER_CARD_COUNT = 10;
const NUMBER_CARD_HAND_SIZE = 5;
const BURN_CARD_COUNT = 2;
const DEFAULT_MAX_ATTEMPTS = 200;
const DEFAULT_BALANCE_THRESHOLD = 30;
const FULL_DECK_POINT_TOTAL = 364;
const standardCardOrder = new Map(
  buildStandardDeck().map((card, index) => [card.id, index]),
);

function createFailure<Code extends NumberCardErrorCode>(
  code: Code,
  message: string,
): FailureResult<Code> {
  return { ok: false, code, message };
}

function createNumberCardId(index: number): NumberCardId {
  return `N-${String(index + 1).padStart(2, '0')}`;
}

function sumCardPointValues(cards: Card[]): number {
  return cards.reduce((total, card) => total + card.pointValue, 0);
}

function sumNumberCardValues(cards: Array<{ value: number }>): number {
  return cards.reduce((total, card) => total + card.value, 0);
}

function cardIds(cards: Card[]): string[] {
  return cards.map((card) => card.id);
}

function numberCardIds(cards: Array<{ id: string }>): string {
  return cards.map((card) => card.id).join(',');
}

function cardsHaveSameIds(left: Card[], right: Card[]): boolean {
  const leftIds = cardIds(left).sort();
  const rightIds = cardIds(right).sort();

  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((id, index) => id === rightIds[index]);
}

function compareCardsByStandardOrder(left: Card, right: Card): number {
  return standardCardOrder.get(left.id)! - standardCardOrder.get(right.id)!;
}

function validateSourceDeck(cards: Card[]): boolean {
  return cards.length === 52 && uniqueCards(cards);
}

function withOwner(cards: UnassignedNumberCard[], owner: NumberCardOwner): NumberCard[] {
  return cards.map((card) => ({
    ...card,
    proofHand: [...card.proofHand],
    owner,
  }));
}

function enumerateFiveCardIndexes(length: number): number[][] {
  const groups: number[][] = [];

  for (let first = 0; first <= length - 5; first += 1) {
    for (let second = first + 1; second <= length - 4; second += 1) {
      for (let third = second + 1; third <= length - 3; third += 1) {
        for (let fourth = third + 1; fourth <= length - 2; fourth += 1) {
          for (let fifth = fourth + 1; fifth <= length - 1; fifth += 1) {
            groups.push([first, second, third, fourth, fifth]);
          }
        }
      }
    }
  }

  return groups;
}

function createDefaultReplacementHands(_targetValue: number, drawPile: Card[]): Card[][] {
  const sortedDrawPile = [...drawPile].sort(compareCardsByStandardOrder);
  const hands: Card[][] = [];

  for (const indexes of enumerateFiveCardIndexes(sortedDrawPile.length)) {
    hands.push(indexes.map((index) => sortedDrawPile[index]!));
  }

  return hands;
}

export function createNumberCardsFromDeck(
  cards: Card[],
): CreateNumberCardsFromDeckResult {
  if (!validateSourceDeck(cards)) {
    return createFailure(
      'invalid-source-deck',
      'Source deck must contain 52 unique cards',
    );
  }

  const burnCards = cards.slice(0, BURN_CARD_COUNT);
  const numberCards: UnassignedNumberCard[] = [];

  for (let index = 0; index < NUMBER_CARD_COUNT; index += 1) {
    const start = BURN_CARD_COUNT + index * NUMBER_CARD_HAND_SIZE;
    const proofHand = cards.slice(start, start + NUMBER_CARD_HAND_SIZE);

    numberCards.push({
      id: createNumberCardId(index),
      value: sumCardPointValues(proofHand),
      proofHand,
      status: 'available',
    });
  }

  return {
    ok: true,
    numberCards,
    burnCards,
  };
}

export function assignNumberCards(
  numberCards: UnassignedNumberCard[],
  balanceThreshold: number,
): AssignmentResult {
  let bestPlayerIndexes: number[] | undefined;
  let bestDifference = Number.POSITIVE_INFINITY;
  let bestKey = '';
  const totalValue = sumNumberCardValues(numberCards);

  for (const indexes of enumerateFiveCardIndexes(numberCards.length)) {
    const playerCards = indexes.map((index) => numberCards[index]!);
    const playerTotal = sumNumberCardValues(playerCards);
    const aiTotal = totalValue - playerTotal;
    const difference = Math.abs(playerTotal - aiTotal);
    const key = numberCardIds(
      [...playerCards].sort((left, right) => left.id.localeCompare(right.id)),
    );

    if (
      difference < bestDifference ||
      (difference === bestDifference &&
        (bestPlayerIndexes === undefined || key < bestKey))
    ) {
      bestDifference = difference;
      bestPlayerIndexes = indexes;
      bestKey = key;
    }
  }

  if (bestPlayerIndexes === undefined || bestDifference > balanceThreshold) {
    return {
      ...createFailure(
        'balance-threshold-exceeded',
        'No number card assignment satisfies the balance threshold',
      ),
      bestDifference,
    };
  }

  const playerIndexSet = new Set(bestPlayerIndexes);
  const playerUnassigned = numberCards.filter((_, index) => playerIndexSet.has(index));
  const aiUnassigned = numberCards.filter((_, index) => !playerIndexSet.has(index));

  return {
    ok: true,
    playerCards: withOwner(playerUnassigned, 'player'),
    aiCards: withOwner(aiUnassigned, 'ai'),
    difference: bestDifference,
  };
}

export function generateNumberCardDeal(
  input: GenerateNumberCardDealInput,
): NumberCardDealResult {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const balanceThreshold = input.balanceThreshold ?? DEFAULT_BALANCE_THRESHOLD;
  let lastReason = 'generation-not-started';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sourceDeck = shuffleDeck(buildStandardDeck(), input.rng);
    const created = createNumberCardsFromDeck(sourceDeck);

    if (!created.ok) {
      lastReason = created.code;
      continue;
    }

    const assignment = assignNumberCards(created.numberCards, balanceThreshold);

    if (!assignment.ok) {
      lastReason = assignment.code;
      continue;
    }

    const availableCards = sourceDeck.slice(BURN_CARD_COUNT);
    const allNumberCards = [...assignment.playerCards, ...assignment.aiCards];
    const allSolvable = allNumberCards.every((numberCard) =>
      input.isSolvable(numberCard.value, availableCards),
    );

    if (!allSolvable) {
      lastReason = 'initial-hand-unsolvable';
      continue;
    }

    const deal: NumberCardDeal = {
      playerCards: assignment.playerCards,
      aiCards: assignment.aiCards,
      burnCards: created.burnCards,
      allNumberCards,
      sourceDeck,
      attempts: attempt,
      seed: input.seed ?? 'unseeded',
    };
    const validation = validateNumberCardDeal(deal);

    if (!validation.ok) {
      lastReason = validation.reason;
      continue;
    }

    return { ok: true, deal };
  }

  return {
    ...createFailure(
      'number-card-generation-failed',
      'Could not generate a balanced and solvable number card deal',
    ),
    attempts: maxAttempts,
    reason: lastReason,
  };
}

export function validateNumberCardDeal(deal: NumberCardDeal): ValidationResult {
  if (deal.playerCards.length !== 5 || deal.aiCards.length !== 5) {
    return {
      ok: false,
      reason: 'invalid-owner-card-count',
      details: {
        playerCount: deal.playerCards.length,
        aiCount: deal.aiCards.length,
      },
    };
  }

  if (deal.burnCards.length !== BURN_CARD_COUNT) {
    return {
      ok: false,
      reason: 'invalid-burn-card-count',
      details: { burnCardCount: deal.burnCards.length },
    };
  }

  if (deal.allNumberCards.length !== NUMBER_CARD_COUNT) {
    return {
      ok: false,
      reason: 'invalid-number-card-count',
      details: { numberCardCount: deal.allNumberCards.length },
    };
  }

  const expectedAllNumberCardIds = new Set([
    ...deal.playerCards.map((card) => card.id),
    ...deal.aiCards.map((card) => card.id),
  ]);
  const actualAllNumberCardIds = new Set(deal.allNumberCards.map((card) => card.id));

  if (
    expectedAllNumberCardIds.size !== NUMBER_CARD_COUNT ||
    actualAllNumberCardIds.size !== NUMBER_CARD_COUNT ||
    [...expectedAllNumberCardIds].some((id) => !actualAllNumberCardIds.has(id))
  ) {
    return {
      ok: false,
      reason: 'invalid-all-number-cards',
    };
  }

  const ownerNumberCards = [...deal.playerCards, ...deal.aiCards];
  const ownerCardsById = new Map(ownerNumberCards.map((card) => [card.id, card]));

  for (const numberCard of ownerNumberCards) {
    if (
      numberCard.proofHand.length !== NUMBER_CARD_HAND_SIZE ||
      !uniqueCards(numberCard.proofHand)
    ) {
      return {
        ok: false,
        reason: 'invalid-proof-hand',
        details: { numberCardId: numberCard.id },
      };
    }

    if (numberCard.value !== sumCardPointValues(numberCard.proofHand)) {
      return {
        ok: false,
        reason: 'number-card-value-mismatch',
        details: { numberCardId: numberCard.id },
      };
    }
  }

  for (const numberCard of deal.allNumberCards) {
    const ownerCard = ownerCardsById.get(numberCard.id);

    if (
      ownerCard === undefined ||
      ownerCard.owner !== numberCard.owner ||
      ownerCard.value !== numberCard.value ||
      ownerCard.status !== numberCard.status ||
      cardIds(ownerCard.proofHand).join(',') !== cardIds(numberCard.proofHand).join(',')
    ) {
      return {
        ok: false,
        reason: 'invalid-all-number-cards',
        details: { numberCardId: numberCard.id },
      };
    }
  }

  const proofCards = deal.allNumberCards.flatMap((numberCard) => numberCard.proofHand);
  const physicalCards = [...deal.burnCards, ...proofCards];

  if (
    physicalCards.length !== 52 ||
    !uniqueCards(physicalCards) ||
    !cardsHaveSameIds(physicalCards, deal.sourceDeck)
  ) {
    return {
      ok: false,
      reason: 'physical-card-coverage-mismatch',
    };
  }

  const totalWithBurnCards =
    sumNumberCardValues(deal.allNumberCards) + sumCardPointValues(deal.burnCards);

  if (totalWithBurnCards !== FULL_DECK_POINT_TOTAL) {
    return {
      ok: false,
      reason: 'total-point-sum-mismatch',
      details: { total: totalWithBurnCards },
    };
  }

  const playerTotal = sumNumberCardValues(deal.playerCards);
  const aiTotal = sumNumberCardValues(deal.aiCards);
  const difference = Math.abs(playerTotal - aiTotal);

  if (difference > DEFAULT_BALANCE_THRESHOLD) {
    return {
      ok: false,
      reason: 'balance-threshold-exceeded',
      details: { difference },
    };
  }

  return { ok: true };
}

export function markNumberCardUsed(
  cards: NumberCard[],
  cardId: NumberCardId,
): MarkNumberCardUsedResult {
  const target = cards.find((card) => card.id === cardId);

  if (target === undefined) {
    return createFailure('number-card-not-found', 'Number card was not found');
  }

  if (target.status !== 'available') {
    return createFailure(
      'number-card-already-used',
      'Number card is not available for use',
    );
  }

  return {
    ok: true,
    cards: cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            proofHand: [...card.proofHand],
            status: 'used',
          }
        : {
            ...card,
            proofHand: [...card.proofHand],
          },
    ),
  };
}

export function replaceUnsolvableNumberCard(
  input: ReplaceUnsolvableInput,
): ReplaceNumberCardResult {
  if (input.drawPile.length < NUMBER_CARD_HAND_SIZE) {
    return createFailure('not-enough-cards', 'Draw pile must contain at least 5 cards');
  }

  const targetIndex = input.cards.findIndex(
    (card) =>
      card.status === 'available' && !input.isSolvable(card.value, input.drawPile),
  );

  if (targetIndex === -1) {
    return createFailure(
      'no-legal-replacement-hand',
      'There is no available unsolvable number card to replace',
    );
  }

  const target = input.cards[targetIndex]!;
  const solveReplacementHands =
    input.solveReplacementHands ?? createDefaultReplacementHands;
  const replacementHands = solveReplacementHands(target.value, input.drawPile);
  const proofHand = replacementHands[0];

  if (proofHand === undefined) {
    return createFailure(
      'no-legal-replacement-hand',
      'No replacement proof hand can be built from the draw pile',
    );
  }

  const replacementValue = sumCardPointValues(proofHand);

  if (!input.isSolvable(replacementValue, input.drawPile)) {
    return createFailure(
      'replacement-still-unsolvable',
      'Replacement number card is still unsolvable',
    );
  }

  const replacement: NumberCard = {
    id: target.id,
    owner: input.owner,
    value: replacementValue,
    proofHand: [...proofHand],
    status: 'replaced',
  };
  const nextCards = input.cards.map((card, index) =>
    index === targetIndex
      ? replacement
      : {
          ...card,
          proofHand: [...card.proofHand],
        },
  );

  return {
    ok: true,
    cards: nextCards,
    replacement,
  };
}
