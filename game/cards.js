import { SUITS, RANKS } from './data.js';
import { compareRanks, rankHand } from './rules.js';

export function card(rank, suitIndex) {
  if (
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > 13 ||
    !Number.isInteger(suitIndex) ||
    suitIndex < 0 ||
    suitIndex >= SUITS.length
  )
    throw new RangeError('Invalid card rank or suit');
  const suit = SUITS[suitIndex];
  return {
    rank: RANKS[rank - 1].label,
    value: rank,
    suit: suit.symbol,
    red: suit.red,
    id: rank + '-' + suitIndex,
  };
}

export function createDeck() {
  return RANKS.flatMap(({ value }) => SUITS.map((_, index) => card(value, index)));
}

// Every feasible rank multiset has a representative; flushes need additional
// suit representatives. The best poker rank is exact, but physical choices
// are only a recommended subset, not all possible overlap-avoidance plays.
export function makeCandidates(target, discard = []) {
  if (!Number.isInteger(target) || target < 6 || target > 64)
    throw new RangeError('Target must be an integer from 6 to 64');
  const used = new Set(discard.map((next) => next.id));
  const available = Array.from({ length: 14 }, () => []);
  for (const next of createDeck()) if (!used.has(next.id)) available[next.value].push(next);
  const best = [];
  const seen = new Set();
  function offer(hand) {
    const id = hand
      .map((next) => next.id)
      .sort()
      .join(',');
    if (seen.has(id)) return;
    seen.add(id);
    const candidate = { hand, rank: rankHand(hand) };
    const index = best.findIndex((other) => compareRanks(candidate.rank, other.rank) > 0);
    best.splice(index < 0 ? best.length : index, 0, candidate);
    if (best.length > 3) best.pop();
  }
  function represent(values) {
    for (let offset = 0; offset < 4; offset++) {
      const counts = new Map();
      offer(
        values.map((value) => {
          const count = counts.get(value) ?? 0;
          counts.set(value, count + 1);
          const start = values.indexOf(value);
          return available[value][(start + offset + count) % available[value].length];
        }),
      );
    }
    if (new Set(values).size !== 5) return;
    for (const suit of SUITS) {
      const hand = values.map((value) =>
        available[value].find((next) => next.suit === suit.symbol),
      );
      if (hand.every(Boolean)) offer(hand);
    }
  }
  function visit(values, minimum, remaining) {
    const slots = 5 - values.length;
    if (!slots) {
      if (!remaining) represent(values);
      return;
    }
    if (remaining < minimum * slots || remaining > 13 * slots) return;
    for (let value = minimum; value <= 13; value++) {
      const count = values.filter((other) => other === value).length;
      if (count >= available[value].length) continue;
      visit([...values, value], value, remaining - value);
    }
  }
  visit([], 1, target);
  return best;
}
