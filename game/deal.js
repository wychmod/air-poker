import { createDeck } from './cards.js';

export function randomIndex(random, length) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError('Random source must return a number in [0, 1)');
  return Math.floor(value * length);
}

// House dealing rule: ten disjoint proof hands establish initial solvability.
// They do NOT reserve cards in the shared deck during the match.
export function dealTargets(random = Math.random) {
  const deck = createDeck();
  for (let index = deck.length - 1; index > 0; index--) {
    const other = randomIndex(random, index + 1);
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  const groups = Array.from({ length: 10 }, (_, index) => {
    const proof = deck.slice(index * 5, index * 5 + 5);
    return { target: proof.reduce((sum, next) => sum + next.value, 0), proof };
  });
  // Balance sums without rerolling; this is not a canonical generation rule
  // or a guarantee of equal winning chances.
  const total = groups.reduce((sum, group) => sum + group.target, 0);
  let partition;
  let difference = Infinity;
  for (let mask = 0; mask < 1024; mask++) {
    const selected = groups.filter((_, index) => mask & (1 << index));
    if (selected.length !== 5) continue;
    const delta = Math.abs(total - 2 * selected.reduce((sum, group) => sum + group.target, 0));
    if (delta < difference) {
      partition = mask;
      difference = delta;
    }
  }
  if (randomIndex(random, 2)) partition ^= 1023;
  const player = groups.filter((_, index) => partition & (1 << index));
  const ai = groups.filter((_, index) => !(partition & (1 << index)));
  return { player, ai, leftovers: deck.slice(50) };
}
