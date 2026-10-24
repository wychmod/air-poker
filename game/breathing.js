export const CANISTER_MS = 300000;
export const HYPOXIA_MS = 10000;

const emptySupply = () => ({ remainingMs: 0, shortageMs: 0, opened: 0 });

export function timeToDrowning(air, supply) {
  return supply.remainingMs + air * CANISTER_MS + HYPOXIA_MS - (air > 0 ? 0 : supply.shortageMs);
}

function consume(air, supply, elapsed) {
  const next = { ...supply };
  let spent = 0;
  // At most 50 whole canisters exist; never iterate once per millisecond.
  while (true) {
    if (next.remainingMs === 0 && air > 0) {
      air--;
      spent++;
      next.opened++;
      next.remainingMs = CANISTER_MS;
      next.shortageMs = 0;
    }
    if (elapsed === 0) break;
    if (next.remainingMs === 0) {
      next.shortageMs = Math.min(HYPOXIA_MS, next.shortageMs + elapsed);
      break;
    }
    const used = Math.min(elapsed, next.remainingMs);
    next.remainingMs -= used;
    elapsed -= used;
  }
  return { air, supply: next, spent };
}

export function startBreathing(playerAir, aiAir) {
  return advanceBreathing(
    {
      playerAir,
      aiAir,
      breathSpent: 0,
      respiration: { elapsedMs: 0, player: emptySupply(), ai: emptySupply() },
    },
    0,
  );
}

export function advanceBreathing(state, duration) {
  if (!Number.isSafeInteger(duration) || duration < 0) throw new RangeError('Invalid duration');
  const respiration = state.respiration;
  const elapsed = Math.min(
    duration,
    timeToDrowning(state.playerAir, respiration.player),
    timeToDrowning(state.aiAir, respiration.ai),
  );
  const player = consume(state.playerAir, respiration.player, elapsed);
  const ai = consume(state.aiAir, respiration.ai, elapsed);
  return {
    playerAir: player.air,
    aiAir: ai.air,
    breathSpent: state.breathSpent + player.spent + ai.spent,
    respiration: {
      elapsedMs: respiration.elapsedMs + elapsed,
      player: player.supply,
      ai: ai.supply,
    },
    drowned: ['player', 'ai'].filter(
      (actor) => (actor === 'player' ? player : ai).supply.shortageMs >= HYPOXIA_MS,
    ),
  };
}
