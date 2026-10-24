export function effectiveHand(hand, discard = []) {
  const used = new Set(discard.map((card) => card.id));
  return hand.filter((card) => !used.has(card.id));
}

function compareArrays(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function rankHand(hand) {
  if (!hand.length) return { key: 'noHand', category: -1, tie: [], score: -100 };
  const counts = new Map();
  for (const card of hand) {
    // A is worth 1 for target sums, but 14 in poker comparisons.
    const value = card.value === 1 ? 14 : card.value;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const values = [...counts.keys()].sort((a, b) => a - b);
  const flush = hand.length === 5 && hand.every((card) => card.suit === hand[0].suit);
  const wheel = values.join(',') === '2,3,4,5,14';
  const straight = values.length === 5 && (values[4] - values[0] === 4 || wheel);
  const straightHigh = wheel ? 5 : values.at(-1);
  let key = 'highCard';
  let category = 0;
  let tie = [...values].reverse();

  if (flush && straight) {
    category = 8;
    key = straightHigh === 14 ? 'royalFlush' : 'straightFlush';
    tie = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    key = 'fourKind';
    tie = groups.map((group) => group.value);
  } else if (groups[0].count === 3 && groups[1]?.count === 2) {
    category = 6;
    key = 'fullHouse';
    tie = groups.map((group) => group.value);
  } else if (flush) {
    category = 5;
    key = 'flush';
  } else if (straight) {
    category = 4;
    key = 'straight';
    tie = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    key = 'threeKind';
    tie = groups.map((group) => group.value);
  } else if (groups[0].count === 2 && groups[1]?.count === 2) {
    category = 2;
    key = 'twoPair';
    tie = groups.map((group) => group.value);
  } else if (groups[0].count === 2) {
    category = 1;
    key = 'onePair';
    tie = groups.map((group) => group.value);
  }
  return { key, category, tie, score: category * 100 + (tie[0] ?? 0) };
}

export function compareHands(a, b) {
  return compareRanks(rankHand(a), rankHand(b));
}

export function compareRanks(first, second) {
  return first.category - second.category || compareArrays(first.tie, second.tie);
}

// Air has already moved into the pot. Return it to its owner or the winner,
// then apply calamity only to the losing player's remaining reserve.
export function settleBets({ playerAir, aiAir, playerBet, aiBet, winner, calamity }) {
  if (winner === 'tie')
    return { playerAir: playerAir + playerBet, aiAir: aiAir + aiBet, burned: 0 };
  const pot = playerBet + aiBet;
  const loss = winner === 'player' ? aiBet : playerBet;
  const reserve = winner === 'player' ? aiAir : playerAir;
  const burned = calamity ? Math.min(reserve, loss) : 0;
  return {
    playerAir: playerAir + (winner === 'player' ? pot : -burned),
    aiAir: aiAir + (winner === 'ai' ? pot : -burned),
    burned,
  };
}
