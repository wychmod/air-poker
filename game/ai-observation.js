const actions = new Set(['check', 'call', 'raise', 'all-in', 'fold']);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
export const MAX_BET_OBSERVATIONS = 64;

// Only accepted, public betting facts belong here. Never retain an engine snapshot.
export function makeBetObservation(before, options, event, timedOut = false) {
  return {
    sessionId: before.sessionId,
    round: before.round,
    attemptId: before.attemptId,
    turnId: event.turnId,
    actor: event.actor,
    action: event.action,
    paid: event.paid,
    raised: event.raised,
    toCallBefore: options.toCall,
    maxRaiseBefore: options.maxRaise,
    canContinueBefore: Boolean(options.canCall || options.canAllIn),
    timedOut: Boolean(timedOut),
  };
}

export function appendBetObservation(observations, observation) {
  if (
    observations.some(
      (entry) => entry.sessionId === observation.sessionId && entry.turnId === observation.turnId,
    )
  )
    return observations;
  return [...observations, observation].slice(-MAX_BET_OBSERVATIONS);
}

const metric = (prior) => ({ count: 0, opportunities: 0, prior });

export function summarizePublicActions(observations = []) {
  const result = {
    samples: 0,
    aggression: metric(0.3),
    continue: metric(0.65),
    fold: metric(0.35),
    check: metric(0.7),
  };
  const seen = new Set();
  for (const entry of observations) {
    if (
      !entry ||
      entry.actor !== 'player' ||
      entry.timedOut ||
      !actions.has(entry.action) ||
      !['sessionId', 'turnId', 'toCallBefore', 'maxRaiseBefore', 'raised'].every((key) =>
        integer(entry[key]),
      )
    )
      continue;
    const id = entry.sessionId + ':' + entry.turnId;
    if (seen.has(id)) continue;
    seen.add(id);
    result.samples++;
    if (entry.maxRaiseBefore >= 1) {
      result.aggression.opportunities++;
      result.aggression.count += Number(
        ['raise', 'all-in'].includes(entry.action) && entry.raised > 0,
      );
    }
    if (entry.toCallBefore > 0 && entry.canContinueBefore === true) {
      result.continue.opportunities++;
      result.fold.opportunities++;
      result.continue.count += Number(['call', 'raise', 'all-in'].includes(entry.action));
      result.fold.count += Number(entry.action === 'fold');
    } else if (entry.toCallBefore === 0) {
      result.check.opportunities++;
      result.check.count += Number(entry.action === 'check');
    }
  }
  for (const key of ['aggression', 'continue', 'fold', 'check']) {
    const value = result[key];
    value.rate = (value.count + 6 * value.prior) / (value.opportunities + 6);
    value.confidence = Math.min(value.opportunities / 12, 1);
  }
  return result;
}
