import { createDeck, judgeHand } from '../game/cards.js';

const deck = new Map(createDeck().map((card) => [card.id, card]));
const current = (state, draft) =>
  state.phase === 'upper' &&
  draft?.sessionId === state.sessionId &&
  draft?.attemptId === state.upper.attemptId;

// An editable view draft, never authoritative match state.
export function syncHandDraft(state, draft) {
  if (state.phase !== 'upper') return null;
  if (current(state, draft)) return draft;
  return {
    sessionId: state.sessionId,
    attemptId: state.upper.attemptId,
    cardIds: [],
    suit: 'all',
    candidateIndex: null,
  };
}

export function getDraftCards(state, draft) {
  if (!current(state, draft)) return [];
  return draft.cardIds.flatMap((id) => (deck.has(id) ? [{ ...deck.get(id) }] : []));
}

export function getDraftStatus(state, draft) {
  const hand = getDraftCards(state, draft);
  const judged = judgeHand(hand, state.playerTarget, state.discard);
  return {
    hand,
    sum: hand.reduce((sum, card) => sum + card.value, 0),
    complete: hand.length === 5,
    valid: judged.valid,
    reason: judged.reason,
  };
}

export function editHandDraft(state, draft, action, data) {
  // Time is flushed by the caller first; buttons from an expired attempt are inert.
  if (!current(state, draft) || Number(data.attempt) !== draft.attemptId) return draft;
  if (action === 'filter-hand-suit')
    return ['all', '0', '1', '2', '3'].includes(data.suit) ? { ...draft, suit: data.suit } : draft;
  if (action === 'clear-hand') return { ...draft, cardIds: [], candidateIndex: null };
  if (action === 'select-candidate') {
    const index = Number(data.index);
    const candidate = state.candidates[index];
    return Number.isInteger(index) && candidate
      ? { ...draft, cardIds: candidate.hand.map((card) => card.id), candidateIndex: index }
      : draft;
  }
  if (action !== 'toggle-hand-card' || !deck.has(data.card)) return draft;
  const selected = draft.cardIds.includes(data.card);
  if (!selected && draft.cardIds.length >= 5) return draft;
  return {
    ...draft,
    cardIds: selected
      ? draft.cardIds.filter((id) => id !== data.card)
      : [...draft.cardIds, data.card],
    candidateIndex: null,
  };
}
