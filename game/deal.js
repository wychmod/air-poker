import { createDeck } from './cards.js';

export function randomIndex(random, length) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError('Random source must return a number in [0, 1)');
  return Math.floor(value * length);
}

// House dealing rule: ten disjoint proof hands establish initial solvability.
// They do NOT reserve cards in the shared deck during the match.
// The five numbers handed to the player are kept distinct, so the same value
// never appears twice in one hand. The opponent side stays unconstrained:
// both sides may still hold an equal number, which keeps the tie-break live.
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
  // Draw the side flip before choosing the split: the distinctness rule only
  // constrains the half the player actually receives.
  const flipped = randomIndex(random, 2) === 1;
  // Balance sums without rerolling; this is not a canonical generation rule
  // or a guarantee of equal winning chances.
  const total = groups.reduce((sum, group) => sum + group.target, 0);
  let partition;
  let difference = Infinity;
  let fallback;
  let fallbackDifference = Infinity;
  for (let mask = 0; mask < 1024; mask++) {
    const selected = groups.filter((_, index) => mask & (1 << index));
    if (selected.length !== 5) continue;
    const delta = Math.abs(total - 2 * selected.reduce((sum, group) => sum + group.target, 0));
    if (delta < fallbackDifference) {
      fallback = mask;
      fallbackDifference = delta;
    }
    const offered = groups.filter((_, index) => (flipped ? mask ^ 1023 : mask) & (1 << index));
    if (new Set(offered.map((group) => group.target)).size !== 5) continue;
    if (delta < difference) {
      partition = mask;
      difference = delta;
    }
  }
  // A distinct split exists for virtually every shuffle; the balanced split is
  // still used as a bounded fallback so a degenerate random source cannot loop.
  const playerMask = (partition ?? fallback) ^ (flipped ? 1023 : 0);
  const player = groups.filter((_, index) => playerMask & (1 << index));
  const ai = groups.filter((_, index) => !(playerMask & (1 << index)));
  return { player, ai, leftovers: deck.slice(50) };
}
