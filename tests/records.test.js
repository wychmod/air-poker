import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { airTotals, isCompletedRecord } from '../game/records.js';
import { CANISTER_MS } from '../game/breathing.js';
import { recordMarkup } from '../ui/record.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function choose(game, last = false) {
  const available = game.getState().targetPlayable;
  game.dispatch({
    type: 'choose-target',
    index: last ? available.lastIndexOf(true) : available.indexOf(true),
  });
}
function lock(game, type = 'confirm-hand') {
  game.dispatch({ type, attemptId: game.getState().upper.attemptId });
}
function pass(game, fold = false) {
  let steps = 0;
  while (game.getState().phase === 'bet') {
    const state = game.getState();
    game.dispatch(
      state.betting.turn === 'ai'
        ? { type: 'cpu-bet', turnId: state.betting.turnId }
        : {
            type: 'bet',
            action: fold ? 'fold' : state.legalBets.canCall ? 'call' : 'check',
            turnId: state.betting.turnId,
          },
    );
    assert.ok(++steps < 100);
  }
}
function audit(game) {
  const record = game.getRecord(),
    state = game.getState();
  const accounts = { player: 25, ai: 25, pot: 0, breathing: 0, burned: 0 };
  for (const entry of record.ledger) {
    assert.deepEqual(entry.before, accounts);
    accounts[entry.from] -= entry.amount;
    accounts[entry.to] += entry.amount;
    assert.deepEqual(entry.after, accounts);
    assert.ok(Object.values(accounts).every((value) => Number.isSafeInteger(value) && value >= 0));
    assert.equal(
      Object.values(accounts).reduce((a, b) => a + b),
      50,
    );
  }
  assert.deepEqual(record.accounts, accounts);
  assert.equal(accounts.player, state.playerAir);
  assert.equal(accounts.ai, state.aiAir);
  assert.equal(accounts.pot, state.pot);
  assert.equal(accounts.breathing, state.breathSpent);
  assert.equal(record.accounting.balanced, true);
  assert.equal(record.totals.player.net, state.playerAir - 25);
  assert.equal(record.totals.ai.net, state.aiAir - 25);
  assert.deepEqual(
    record.events.map((event) => event.id),
    record.events.map((_, i) => i + 1),
  );
  assert.ok(
    record.events.every((event, i) => i === 0 || event.elapsedMs >= record.events[i - 1].elapsedMs),
  );
  return record;
}

test('full records preserve all rounds, real stakes and calamity, independently of the seven-item feed', () => {
  const game = createGame({ random: seeded(1) });
  for (let round = 1; round <= 5; round++) {
    choose(game, true);
    lock(game);
    pass(game);
    audit(game);
    const record = game.getRecord(),
      settled = record.rounds.at(-1);
    assert.equal(settled.status, 'settled');
    assert.equal(settled.airAfter.player - settled.airBefore.player, settled.totals.player.net);
    assert.equal(settled.airAfter.ai - settled.airBefore.ai, settled.totals.ai.net);
    assert.equal(
      settled.settlement.pot,
      settled.settlement.committed.player + settled.settlement.committed.ai,
    );
    assert.equal(settled.attempts[0].player.hand.length, 5);
    assert.ok(settled.actions.length > 0);
    game.dispatch({ type: 'advance-round' });
  }
  game.dispatch({ type: 'fast-forward', sessionId: game.getState().sessionId });
  const record = audit(game);
  assert.equal(record.rounds.length, 5);
  assert.equal(record.result.completedRounds, 5);
  assert.ok(record.events.length > game.getState().feed.length);
  assert.equal(
    record.accounts.burned,
    record.rounds.reduce((sum, round) => sum + round.settlement.burned, 0),
  );
  assert.equal(isCompletedRecord(record), true);
  const old = structuredClone(record);
  game.reset();
  assert.deepEqual(record, old);
  assert.notEqual(game.getRecord().matchId, old.matchId);
  assert.equal(game.getRecord().rounds.length, 1);
});

test('records hide pending CPU hands, return independent snapshots, and ignore rejected actions', () => {
  const game = createGame({ random: seeded(3) });
  choose(game);
  lock(game);
  const record = game.getRecord();
  assert.equal(record.rounds[0].attempts[0].ai, null);
  assert.equal(Object.hasOwn(record, 'aiTargets'), false);
  record.accounts.player = -1;
  record.rounds[0].attempts[0].player.hand[0].value = 99;
  assert.equal(game.getRecord().accounts.player, game.getState().playerAir);
  const before = game.getRecord();
  for (const action of [
    { type: 'confirm-hand', attemptId: 1 },
    { type: 'bet', action: 'raise', amount: 999, turnId: game.getState().betting.turnId },
  ]) {
    assert.equal(game.dispatch(action), false);
    assert.deepEqual(game.getRecord(), before);
  }
  pass(game, true);
  assert.ok(game.getRecord().rounds[0].attempts[0].ai.hand);
  assert.equal(isCompletedRecord(game.getRecord()), false);
});

test('retry and impossible rounds retain all attempts without repeating money or completed rounds', () => {
  for (const seed of [1, 98]) {
    const game = createGame({ random: seeded(seed) });
    for (let round = 1; round <= 5; round++) {
      choose(game, seed === 1);
      lock(game, seed === 1 && round === 5 ? 'fail-hand' : 'confirm-hand');
      pass(game);
      if (round < 5) game.dispatch({ type: 'advance-round' });
    }
    if (seed === 1) {
      const before = audit(game);
      assert.equal(before.rounds[4].attempts.length, 2);
      assert.equal(before.rounds[4].attempts[0].player.reason, 'forfeited');
      assert.equal(before.rounds[4].attempts[1].ai, null);
      lock(game);
      const after = audit(game);
      assert.equal(after.rounds[4].attempts[1].ai.valid, false);
      assert.equal(after.ledger.filter((e) => e.round === 5 && e.reason === 'ante').length, 2);
      assert.equal(after.rounds[4].settlement.reason, 'hand-failure');
    } else {
      const record = audit(game);
      assert.equal(record.rounds[4].status, 'void');
      assert.equal(record.result, null);
      assert.equal(record.ledger.filter((e) => e.reason === 'deadlock-refund').length, 2);
      assert.equal(record.rounds.filter((r) => r.status === 'settled').length, 4);
    }
  }
});

test('breathing openings have exact timestamps and long jumps produce the same facts as short steps', () => {
  const games = [createGame({ random: seeded(7) }), createGame({ random: seeded(7) })];
  for (const game of games) choose(game);
  const sessionId = games[0].getState().sessionId;
  games[0].dispatch({ type: 'elapse', sessionId, elapsedMs: 999999999 });
  for (let elapsedMs = 1000; games[1].getState().phase !== 'summary'; elapsedMs += 1000)
    games[1].dispatch({ type: 'elapse', sessionId, elapsedMs });
  assert.deepEqual(audit(games[0]), audit(games[1]));
  const record = games[0].getRecord();
  for (const entry of record.ledger.filter((e) => e.reason === 'breathing'))
    assert.equal(entry.elapsedMs % CANISTER_MS, 0);
  assert.equal(record.events.filter((e) => e.type === 'match-ended').length, 1);
  assert.equal(isCompletedRecord(record), true);
});

test('timeouts and unplayed rounds preserve actual completion counts and terminal facts', () => {
  const game = createGame({ random: seeded(2) });
  choose(game);
  const state = game.getState();
  // A long jump processes construction timeout and real betting before death.
  game.dispatch({ type: 'elapse', sessionId: state.sessionId, elapsedMs: 999999999 });
  const record = audit(game);
  assert.equal(record.status, 'completed');
  assert.equal(record.result.elapsedMs, game.getState().respiration.elapsedMs);
  assert.equal(record.rounds[0].attempts[0].player.reason, 'timeout');
  const idle = createGame({ random: seeded(2) });
  idle.dispatch({ type: 'elapse', sessionId: idle.getState().sessionId, elapsedMs: 999999999 });
  const idleRecord = audit(idle);
  assert.equal(idleRecord.rounds[0].status, 'interrupted');
  assert.equal(idleRecord.result.completedRounds, 0);
  assert.equal(isCompletedRecord(idleRecord), true);
});

test('calamity and unequal folded stakes use actual payouts and separately tracked burns', () => {
  const reasons = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const game = createGame({ random: seeded(seed) });
    while (game.getState().phase === 'lower') {
      choose(game);
      lock(game);
      pass(game, seed % 2 === 0);
      const record = audit(game),
        round = record.rounds.at(-1);
      if (round.settlement) {
        const settlement = round.settlement;
        assert.equal(settlement.received.player + settlement.received.ai, settlement.pot);
        assert.equal(
          record.accounts.burned,
          record.rounds.reduce((sum, r) => sum + (r.settlement?.burned ?? 0), 0),
        );
        for (const entry of record.ledger) reasons.add(entry.reason);
      }
      if (game.getState().phase !== 'showdown') break;
      game.dispatch({ type: 'advance-round' });
    }
  }
  assert.ok(reasons.has('payout'));
  assert.ok(reasons.has('calamity'));
});

test('corrupt versions, transfers and balances cannot be accepted as completed records', () => {
  const game = createGame({ random: seeded(2) });
  game.dispatch({ type: 'elapse', sessionId: game.getState().sessionId, elapsedMs: 999999999 });
  const original = audit(game);
  for (const corrupt of [
    (r) => (r.schemaVersion = 99),
    (r) => (r.ledger[0].amount = 9),
    (r) => (r.accounts.player = 1),
    (r) => (r.events[0].elapsedMs = -1),
    (r) => (r.rounds[0].attempts = 'bad'),
    (r) => (r.result.completedRounds = 4),
    (r) => (r.elapsedMs = 1),
    (r) => (r.events[0].round = '<img src=x>'),
    (r) => (r.rules.maxRounds = '<img src=x>'),
  ]) {
    const record = structuredClone(original);
    corrupt(record);
    assert.equal(isCompletedRecord(record), false);
  }
  assert.equal(isCompletedRecord(null), false);
  assert.equal(airTotals(original).player.breathing, 25);
});

test('stored card and event text is escaped and damaged settlement cards are rejected', () => {
  const game = createGame({ random: seeded(1) });
  choose(game);
  lock(game);
  pass(game, true);
  game.dispatch({ type: 'elapse', sessionId: game.getState().sessionId, elapsedMs: 999999999 });
  const record = game.getRecord();
  const damaged = structuredClone(record);
  damaged.rounds[0].settlement.overlap = [null];
  assert.equal(isCompletedRecord(damaged), false);
  const damagedActions = structuredClone(record);
  damagedActions.rounds[0].actions = [null];
  assert.equal(isCompletedRecord(damagedActions), false);
  const payload = '<img src=x onerror="throw 1">';
  record.rounds[0].attempts[0].player.hand[0].rank = payload;
  record.events.find((e) => e.type === 'bet-action').details.paid = payload;
  assert.equal(isCompletedRecord(record), true);
  for (const lang of ['zh', 'en']) {
    const html = recordMarkup(record, lang);
    assert.ok(html.includes('&lt;img src=x'));
    assert.equal(html.includes(payload), false);
  }
});

test('death during failed-hand retries refunds the unsettled pot once and keeps the round unfinished', () => {
  const game = createGame({ random: seeded(1) });
  for (let round = 1; round <= 5; round++) {
    choose(game, true);
    lock(game, round === 5 ? 'fail-hand' : 'confirm-hand');
    pass(game);
    if (round < 5) game.dispatch({ type: 'advance-round' });
  }
  assert.equal(game.getState().upper.retry, true);
  game.dispatch({ type: 'elapse', sessionId: game.getState().sessionId, elapsedMs: 999999999 });
  const record = audit(game);
  assert.equal(record.rounds[4].status, 'interrupted');
  assert.equal(record.result.completedRounds, 4);
  assert.equal(record.ledger.filter((e) => e.reason === 'termination-refund').length, 2);
  assert.ok(record.rounds[4].attempts.length > 2);
  assert.equal(record.accounts.pot, 0);
  assert.equal(isCompletedRecord(record), true);
});
