import { SUITS, RANKS, HAND_PRESETS } from './data.js';
import { compareHands, effectiveHand, rankHand } from './rules.js';

export function card(rank, suitIndex) {
  if (
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > 13 ||
    !Number.isInteger(suitIndex) ||
    suitIndex < 0 ||
    suitIndex >= SUITS.length
  ) {
    throw new RangeError('Invalid card rank or suit');
  }
  const suit = SUITS[suitIndex];
  return {
    rank: RANKS[rank - 1].label,
    value: rank,
    suit: suit.symbol,
    red: suit.red,
    id: `${rank}-${suitIndex}`,
  };
}

export function makeHand(target, seed = 0) {
  const templates = HAND_PRESETS[target];
  if (!templates || !Number.isInteger(seed) || seed < 0) {
    throw new RangeError('Unsupported target or seed');
  }
  const values = templates[seed % templates.length];
  if (values.some((value) => values.filter((other) => other === value).length > 4)) {
    throw new Error('Candidate exceeds the number of physical suits');
  }
  const used = new Set();
  const hand = values.map((value, index) => {
    let suit = (index + seed) % SUITS.length;
    // Equal ranks can occur more than four positions apart in a template.
    while (used.has(`${value}-${suit}`)) suit = (suit + 1) % SUITS.length;
    const next = card(value, suit);
    used.add(next.id);
    return next;
  });
  if (hand.length !== 5 || hand.reduce((sum, next) => sum + next.value, 0) !== target) {
    throw new Error(`Candidate does not match target ${target}`);
  }
  return hand;
}

export function makeCandidates(target, discard = []) {
  return [0, 1, 2]
    .map((seed) => {
      const hand = makeHand(target, seed);
      return { hand, rank: rankHand(effectiveHand(hand, discard)) };
    })
    .sort((a, b) => compareHands(effectiveHand(b.hand, discard), effectiveHand(a.hand, discard)));
}
