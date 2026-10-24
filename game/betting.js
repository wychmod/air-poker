export const otherPlayer = (actor) => (actor === 'player' ? 'ai' : 'player');

export function getBetOptions(state, actor) {
  const validActor = actor === 'player' || actor === 'ai';
  const active = validActor && state.phase === 'bet' && state.betting?.turn === actor;
  const ownBet = validActor ? state[`${actor}Bet`] : 0;
  const ownAir = validActor ? state[`${actor}Air`] : 0;
  const opponent = otherPlayer(actor);
  const opponentBet = validActor ? state[`${opponent}Bet`] : 0;
  const opponentAir = validActor ? state[`${opponent}Air`] : 0;
  const toCall = Math.max(0, opponentBet - ownBet);
  const matchedLimit = Math.min(ownBet + ownAir, opponentBet + opponentAir);
  const maxRaise = Math.max(
    0,
    Math.min(Math.floor((state.pot + toCall) / 2), matchedLimit - Math.max(ownBet, opponentBet)),
  );
  const allInCost = Math.max(0, matchedLimit - ownBet);
  return {
    active: Boolean(active),
    toCall,
    minRaise: 1,
    maxRaise,
    matchedLimit,
    allInCost,
    reserve: ownAir,
    potAfterCall: state.pot + toCall,
    canCheck: Boolean(active && toCall === 0),
    canCall: Boolean(active && toCall > 0 && toCall <= ownAir),
    canRaise: Boolean(active && maxRaise >= 1),
    canFold: Boolean(active),
    canAllIn: Boolean(active && allInCost > 0 && allInCost - toCall <= maxRaise),
  };
}

// Pure transition: money is escrowed on each action, never auto-matched.
export function applyBetAction(state, actor, action, amount) {
  const options = getBetOptions(state, actor);
  if (!options.active) return null;
  let paid = 0;
  let raised = 0;
  let checks = 0;
  if (action === 'check' && options.canCheck) checks = state.betting.checks + 1;
  else if (action === 'call' && options.canCall) paid = options.toCall;
  else if (
    action === 'raise' &&
    options.canRaise &&
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= options.maxRaise
  ) {
    raised = amount;
    paid = options.toCall + raised;
  } else if (action === 'all-in' && options.canAllIn) {
    paid = options.allInCost;
    raised = paid - options.toCall;
  } else if (action !== 'fold' || !options.canFold) return null;

  const next = {
    ...state,
    [`${actor}Air`]: state[`${actor}Air`] - paid,
    [`${actor}Bet`]: state[`${actor}Bet`] + paid,
    pot: state.pot + paid,
  };
  const event = {
    actor,
    action,
    paid,
    raised,
    called: options.toCall,
    pot: next.pot,
    turnId: state.betting.turnId,
  };
  const matchedAllIn = next.playerBet === next.aiBet && Math.min(next.playerAir, next.aiAir) === 0;
  const outcome =
    action === 'fold' ? 'fold' : checks >= 2 || matchedAllIn ? 'showdown' : 'continue';
  next.betting = {
    ...state.betting,
    turn: outcome === 'continue' ? otherPlayer(actor) : null,
    checks,
    turnId: state.betting.turnId + 1,
    history: [...state.betting.history, event],
  };
  return { state: next, outcome, foldedBy: action === 'fold' ? actor : null, event };
}
