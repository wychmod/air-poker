import { createAppError } from '../errors';
import { type Card, RANKS, SUITS } from './card';
import { type Rng, buildStandardDeck, shuffleDeck } from './deck';

export type CardUsage = 'unused' | 'used';

export type SelectableCard = {
  card: Card;
  usage: CardUsage;
};

export type DeckState = {
  drawPile: Card[];
  discardPile: Card[];
  burnCards: Card[];
};

const suitOrder = new Map(SUITS.map((suit, index) => [suit, index]));
const rankOrder = new Map(RANKS.map((rank, index) => [rank, index]));

function compareCards(left: Card, right: Card): number {
  const suitDifference = suitOrder.get(left.suit)! - suitOrder.get(right.suit)!;

  if (suitDifference !== 0) {
    return suitDifference;
  }

  return rankOrder.get(left.rank)! - rankOrder.get(right.rank)!;
}

export function createInitialDeckState(rng: Rng): {
  deckState: DeckState;
  fullDeck: Card[];
} {
  const fullDeck = buildStandardDeck();

  return {
    fullDeck,
    deckState: {
      drawPile: shuffleDeck(fullDeck, rng),
      discardPile: [],
      burnCards: [],
    },
  };
}

export function moveEffectiveCardsToDiscard(
  deckState: DeckState,
  effectiveCards: Card[],
): DeckState {
  const drawPileById = new Map(deckState.drawPile.map((card) => [card.id, card]));
  const discardPileById = new Map(deckState.discardPile.map((card) => [card.id, card]));
  const effectiveById = new Map<string, Card>();

  for (const card of effectiveCards) {
    if (!drawPileById.has(card.id) && !discardPileById.has(card.id)) {
      throw createAppError('unknown-card-id', `Unknown card id: ${card.id}`, {
        details: { cardId: card.id },
      });
    }

    effectiveById.set(card.id, card);
  }

  const effectiveIds = new Set(effectiveById.keys());
  const drawPile = deckState.drawPile.filter((card) => !effectiveIds.has(card.id));
  const discardPile = [...deckState.discardPile];
  const existingDiscardIds = new Set(discardPile.map((card) => card.id));

  for (const card of effectiveById.values()) {
    if (!existingDiscardIds.has(card.id)) {
      discardPile.push(card);
      existingDiscardIds.add(card.id);
    }
  }

  return {
    drawPile,
    discardPile,
    burnCards: [...deckState.burnCards],
  };
}

export function isCardUsed(deckState: DeckState, cardId: string): boolean {
  return deckState.discardPile.some((card) => card.id === cardId);
}

export function getSelectableCards(deckState: DeckState): SelectableCard[] {
  const unused = [...deckState.drawPile]
    .sort(compareCards)
    .map((card): SelectableCard => ({ card, usage: 'unused' }));
  const used = [...deckState.discardPile]
    .sort(compareCards)
    .map((card): SelectableCard => ({ card, usage: 'used' }));

  return [...unused, ...used];
}
