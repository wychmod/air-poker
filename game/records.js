export const RECORD_VERSION = 1;
export const RULES_VERSION = 'digital-survival-1';
const actors = ['player', 'ai'];
const accounts = ['player', 'ai', 'pot', 'breathing', 'burned'];
const clone = (value) => structuredClone(value);
const airOf = (state) => ({ player: state.playerAir, ai: state.aiAir });
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const cardShape = (card) =>
  card &&
  typeof card.id === 'string' &&
  typeof card.rank === 'string' &&
  typeof card.suit === 'string';

export function accountingSummary(record) {
  const total = Object.values(record.accounts).reduce((sum, value) => sum + value, 0);
  return {
    ...record.accounts,
    initialTotal: record.initialAir.player + record.initialAir.ai,
    accountedTotal: total,
    balanced: total === record.initialAir.player + record.initialAir.ai,
  };
}

export function airTotals(record, round = undefined) {
  const totals = Object.fromEntries(
    actors.map((actor) => [
      actor,
      { ante: 0, bet: 0, received: 0, refunded: 0, breathing: 0, burned: 0, net: 0 },
    ]),
  );
  for (const entry of record.ledger) {
    if (round !== undefined && entry.round !== round) continue;
    for (const actor of actors) {
      const next = totals[actor];
      if (entry.from === actor) {
        next.net -= entry.amount;
        if (entry.to === 'breathing') next.breathing += entry.amount;
        else if (entry.to === 'burned') next.burned += entry.amount;
        else next[entry.reason === 'ante' ? 'ante' : 'bet'] += entry.amount;
      }
      if (entry.to === actor) {
        next.net += entry.amount;
        next[entry.reason === 'payout' ? 'received' : 'refunded'] += entry.amount;
      }
    }
  }
  return totals;
}

// Facts only: the engine remains the sole owner of game decisions and balances.
export function createRecorder({ matchId, initialAir, rules }) {
  const record = {
    schemaVersion: RECORD_VERSION,
    rulesVersion: RULES_VERSION,
    matchId,
    initialAir: { player: initialAir, ai: initialAir },
    rules: clone(rules),
    status: 'active',
    accounts: { player: initialAir, ai: initialAir, pot: 0, breathing: 0, burned: 0 },
    events: [],
    ledger: [],
    rounds: [],
    result: null,
  };
  const current = (state) => {
    const round = record.rounds.at(-1);
    return round?.number === state.round && ['choosing', 'active'].includes(round.status)
      ? round
      : null;
  };
  function event(state, type, details = {}, elapsedMs = state.respiration.elapsedMs) {
    const entry = {
      id: record.events.length + 1,
      elapsedMs,
      round: current(state)?.number ?? null,
      type,
      details: clone(details),
    };
    record.events.push(entry);
    return entry.id;
  }
  function transfer(state, reason, from, to, amount, elapsedMs, details = {}) {
    if (amount === 0) return;
    if (
      !integer(amount) ||
      !accounts.includes(from) ||
      !accounts.includes(to) ||
      from === to ||
      record.accounts[from] < amount
    )
      throw new Error('Invalid AIR transfer');
    const before = { ...record.accounts };
    record.accounts[from] -= amount;
    record.accounts[to] += amount;
    const id = event(state, 'air-transfer', { reason, from, to, amount, ...details }, elapsedMs);
    record.ledger.push({
      id,
      elapsedMs: record.events.at(-1).elapsedMs,
      round: record.events.at(-1).round,
      reason,
      from,
      to,
      amount,
      before,
      after: { ...record.accounts },
    });
  }
  function closeRound(state, status, reason) {
    const round = current(state);
    if (!round) return;
    event(state, 'round-ended', { status, reason });
    Object.assign(round, {
      status,
      reason,
      endedAtMs: state.respiration.elapsedMs,
      airAfter: airOf(state),
      discardAfter: state.discard.map((card) => card.id),
    });
  }
  return {
    event,
    transfer,
    openRound(state) {
      record.rounds.push({
        number: state.round,
        status: 'choosing',
        startedAtMs: state.respiration.elapsedMs,
        airBefore: airOf(state),
        discardBefore: state.discard.map((card) => card.id),
        targets: null,
        attempts: [],
        actions: [],
        settlement: null,
        endedAtMs: null,
        airAfter: null,
        discardAfter: null,
      });
      event(state, 'round-started');
    },
    chooseTargets(state, playerIndex, aiIndex) {
      const round = current(state);
      round.status = 'active';
      round.firstBettor = state.firstBettor;
      round.targets = {
        player: { index: playerIndex, value: state.playerTarget },
        ai: { index: aiIndex, value: state.aiTarget },
      };
      event(state, 'targets-revealed', round.targets);
    },
    startAttempt(state, aiHand) {
      current(state).attempts.push({
        id: state.upper.attemptId,
        number: state.upper.attempt,
        startedAtMs: state.respiration.elapsedMs,
        deadlineMs: state.upper.deadlineMs,
        submittedAtMs: null,
        player: null,
        ai: { valid: Boolean(aiHand), reason: aiHand ? null : 'no-solution', hand: clone(aiHand) },
        revealed: false,
      });
      event(state, 'attempt-started', {
        attemptId: state.upper.attemptId,
        number: state.upper.attempt,
      });
    },
    lockAttempt(state) {
      const attempt = current(state).attempts.at(-1);
      attempt.player = {
        valid: Boolean(state.playerHand),
        reason: state.upper.playerReason,
        hand: clone(state.playerHand),
      };
      attempt.submittedAtMs = state.respiration.elapsedMs;
      event(state, 'hand-submitted', {
        attemptId: attempt.id,
        valid: attempt.player.valid,
        reason: attempt.player.reason,
      });
    },
    revealAttempt(state) {
      current(state).attempts.at(-1).revealed = true;
      event(state, 'attempt-revealed', { attemptId: state.upper.attemptId });
    },
    bet(state, action, timedOut) {
      const entry = {
        ...action,
        called: Math.min(action.called, action.paid),
        toCall: action.called,
        timedOut,
        elapsedMs: state.respiration.elapsedMs,
      };
      current(state).actions.push(clone(entry));
      event(state, 'bet-action', entry);
    },
    settle(state, settlement) {
      current(state).settlement = clone(settlement);
      closeRound(state, 'settled', settlement.reason);
    },
    closeRound,
    breathing(before, state) {
      const openings = actors
        .flatMap((actor) =>
          Array.from(
            { length: state.respiration[actor].opened - before.respiration[actor].opened },
            (_, index) => ({
              actor,
              elapsedMs:
                before.respiration.elapsedMs +
                before.respiration[actor].remainingMs +
                index * rules.canisterMs,
            }),
          ),
        )
        .sort(
          (a, b) => a.elapsedMs - b.elapsedMs || actors.indexOf(a.actor) - actors.indexOf(b.actor),
        );
      for (const opening of openings)
        transfer(state, 'breathing', opening.actor, 'breathing', 1, opening.elapsedMs);
    },
    finish(state) {
      closeRound(state, 'interrupted', state.endReason);
      record.status = 'completed';
      record.result = {
        winner: state.winner,
        reason: state.endReason,
        enduranceReason: state.enduranceReason,
        completedRounds: state.completedRounds,
        elapsedMs: state.respiration.elapsedMs,
        finalAir: airOf(state),
        respiration: clone(state.respiration),
        discard: clone(state.discard),
      };
      event(state, 'match-ended', { winner: state.winner, reason: state.endReason });
    },
    summary: () => accountingSummary(record),
    snapshot(state) {
      const snapshot = clone(record);
      snapshot.elapsedMs = state.respiration.elapsedMs;
      snapshot.totals = airTotals(snapshot);
      snapshot.accounting = accountingSummary(snapshot);
      for (const round of snapshot.rounds) {
        round.totals = airTotals(snapshot, round.number);
        for (const attempt of round.attempts)
          if (!attempt.revealed && snapshot.status !== 'completed') attempt.ai = null;
      }
      return snapshot;
    },
  };
}

// Stored records are data, never trusted HTML or executable game state.
export function isCompletedRecord(record) {
  try {
    if (
      record.schemaVersion !== RECORD_VERSION ||
      record.rulesVersion !== RULES_VERSION ||
      record.status !== 'completed' ||
      typeof record.matchId !== 'string' ||
      !record.matchId.length ||
      !record.result ||
      !Array.isArray(record.events) ||
      !Array.isArray(record.ledger) ||
      !Array.isArray(record.rounds) ||
      record.rounds.length > 5 ||
      record.rules?.maxRounds !== 5 ||
      !actors.every(
        (actor) => record.initialAir[actor] === 25 && integer(record.result.finalAir[actor]),
      ) ||
      !['player', 'ai', 'tie'].includes(record.result.winner) ||
      !integer(record.result.completedRounds) ||
      !integer(record.result.elapsedMs) ||
      record.elapsedMs !== record.result.elapsedMs
    )
      return false;
    const balances = { ...record.initialAir, pot: 0, breathing: 0, burned: 0 };
    let previousTime = 0;
    for (const [index, entry] of record.events.entries()) {
      if (
        entry.id !== index + 1 ||
        !integer(entry.elapsedMs) ||
        entry.elapsedMs < previousTime ||
        entry.elapsedMs > record.result.elapsedMs ||
        (entry.round !== null &&
          (!integer(entry.round) || entry.round < 1 || entry.round > record.rounds.length)) ||
        typeof entry.type !== 'string' ||
        !entry.details ||
        typeof entry.details !== 'object'
      )
        return false;
      previousTime = entry.elapsedMs;
    }
    const transfers = record.events.filter((entry) => entry.type === 'air-transfer');
    if (transfers.length !== record.ledger.length) return false;
    for (const [index, entry] of record.ledger.entries()) {
      const fact = transfers[index];
      if (
        entry.id !== fact.id ||
        entry.elapsedMs !== fact.elapsedMs ||
        entry.round !== fact.round ||
        !accounts.includes(entry.from) ||
        !accounts.includes(entry.to) ||
        entry.from === entry.to ||
        !integer(entry.amount) ||
        entry.amount === 0 ||
        !['reason', 'from', 'to', 'amount'].every((key) => entry[key] === fact.details[key]) ||
        !accounts.every((key) => balances[key] === entry.before[key]) ||
        balances[entry.from] < entry.amount
      )
        return false;
      balances[entry.from] -= entry.amount;
      balances[entry.to] += entry.amount;
      if (!accounts.every((key) => balances[key] === entry.after[key])) return false;
    }
    if (
      !accounts.every(
        (key) => integer(record.accounts[key]) && balances[key] === record.accounts[key],
      ) ||
      !actors.every((actor) => balances[actor] === record.result.finalAir[actor]) ||
      balances.pot !== 0 ||
      record.rounds.filter((round) => round.status === 'settled').length !==
        record.result.completedRounds
    )
      return false;
    for (const [index, round] of record.rounds.entries()) {
      if (
        round.number !== index + 1 ||
        !['settled', 'void', 'interrupted'].includes(round.status) ||
        !Array.isArray(round.attempts) ||
        !Array.isArray(round.actions) ||
        !integer(round.startedAtMs) ||
        !integer(round.endedAtMs) ||
        round.startedAtMs > round.endedAtMs ||
        round.endedAtMs > record.result.elapsedMs ||
        !actors.every(
          (actor) => integer(round.airBefore?.[actor]) && integer(round.airAfter?.[actor]),
        ) ||
        !Array.isArray(round.discardBefore) ||
        !Array.isArray(round.discardAfter)
      )
        return false;
      if (
        round.targets &&
        (!actors.every(
          (actor) => integer(round.targets[actor]?.value) && integer(round.targets[actor]?.index),
        ) ||
          !actors.includes(round.firstBettor))
      )
        return false;
      if (
        round.status === 'settled' &&
        (!round.settlement ||
          !['player', 'ai', 'tie'].includes(round.settlement.winner) ||
          !actors.every(
            (actor) =>
              integer(round.settlement.committed?.[actor]) &&
              integer(round.settlement.received?.[actor]),
          ) ||
          !integer(round.settlement.burned) ||
          !Array.isArray(round.settlement.overlap) ||
          !round.settlement.overlap.every(cardShape))
      )
        return false;
      for (const action of round.actions) {
        if (
          !actors.includes(action.actor) ||
          !['check', 'call', 'raise', 'fold', 'all-in'].includes(action.action) ||
          !['paid', 'called', 'toCall', 'raised', 'pot', 'turnId', 'elapsedMs'].every((key) =>
            integer(action[key]),
          ) ||
          action.elapsedMs < round.startedAtMs ||
          action.elapsedMs > round.endedAtMs ||
          typeof action.timedOut !== 'boolean'
        )
          return false;
      }
      for (const actor of actors) {
        const rank = round.settlement?.[`${actor}Rank`];
        if (
          rank &&
          (typeof rank.key !== 'string' || !Array.isArray(rank.tie) || !rank.tie.every(integer))
        )
          return false;
      }
      for (const attempt of round.attempts) {
        if (!integer(attempt.id) || !integer(attempt.number) || !integer(attempt.startedAtMs))
          return false;
        for (const actor of actors) {
          const info = attempt[actor];
          if (info == null) {
            if (actor === 'ai') return false;
            else continue;
          }
          if (typeof info.valid !== 'boolean' || (info.valid && !Array.isArray(info.hand)))
            return false;
          const hand = info.hand;
          if (
            hand !== null &&
            hand !== undefined &&
            (!Array.isArray(hand) || hand.length !== 5 || !hand.every(cardShape))
          )
            return false;
        }
      }
    }
    return accountingSummary(record).balanced;
  } catch {
    return false;
  }
}
