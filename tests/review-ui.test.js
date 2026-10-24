import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { isCompletedRecord } from '../game/records.js';
import { reviewEvents, reviewMarkup } from '../ui/review.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function atBet() {
  const game = createGame({ random: seeded(3), recordId: 'review-test' });
  assert.equal(game.dispatch({ type: 'choose-target', index: 0 }), true);
  assert.equal(
    game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId }),
    true,
  );
  assert.equal(game.getState().phase, 'bet');
  return game;
}
function settle(game) {
  let steps = 0;
  while (game.getState().phase === 'bet') {
    const state = game.getState();
    assert.equal(
      game.dispatch(
        state.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: state.betting.turnId }
          : { type: 'bet', action: 'fold', turnId: state.betting.turnId },
      ),
      true,
    );
    assert.ok(++steps < 100);
  }
  assert.equal(game.getState().phase, 'showdown');
}
const selection = (overrides = {}) => ({
  round: 1,
  attempt: 0,
  event: 0,
  playing: false,
  ...overrides,
});
const handsIn = (html) =>
  [...html.matchAll(/<section class="review-hand">([\s\S]*?)<\/section>/g)].map(
    (match) => match[1],
  );
const cardCount = (html) => [...html.matchAll(/class="review-card[ "]/g)].length;
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

test('active review shows five own cards and keeps unrevealed CPU cards out of its hand DOM', () => {
  const game = atBet();
  const record = game.getRecord();
  assert.equal(record.rounds[0].attempts[0].ai, null);
  for (const lang of ['zh', 'en']) {
    const html = reviewMarkup(record, { lang }, selection());
    const hands = handsIn(html);
    assert.equal(hands.length, 2);
    assert.equal(cardCount(hands[0]), 5);
    assert.equal(cardCount(hands[1]), 0);
    assert.match(hands[1], /class="review-hidden"/);
    assert.match(hands[1], lang === 'en' ? /Not revealed/ : /尚未公开/);
  }
  settle(game);
  const revealed = game.getRecord();
  assert.equal(revealed.rounds[0].attempts[0].revealed, true);
  assert.equal(cardCount(handsIn(reviewMarkup(revealed, { lang: 'en' }, selection()))[1]), 5);
  assert.equal(
    record.rounds[0].attempts[0].ai,
    null,
    'an opened snapshot stays private after the live game progresses',
  );
});

test('selected transfer shows its actual amount and all five accounts at that event', () => {
  const record = atBet().getRecord();
  const entry = record.ledger.find((item) => item.reason === 'ante' && item.from === 'player');
  const index = reviewEvents(record, 1).findIndex((event) => event.id === entry.id);
  assert.equal(entry.amount, 1);
  assert.equal(entry.after.pot, 1);
  assert.equal(record.accounts.pot, 2, 'fixture distinguishes historical and current balances');
  const html = reviewMarkup(record, { lang: 'en' }, selection({ event: index }));
  assert.match(html, /class="transfer-token">1 AIR →/);
  const accountLine = html.match(/class="review-account-line">([^<]+)<\/p>/)?.[1];
  assert.equal(
    accountLine,
    'You 23 + CPU 24 + POT 1 + OPENED CANISTERS 2 + CALAMITY BURNED 0 = 50',
  );
  assert.match(html, /Your reserve \+ CPU reserve \+ pot \+ opened \+ burned = 50 \/ 50/);
  assert.match(html, new RegExp('EVENT ' + (index + 1) + ' / '));
});

test('review event filters preserve order and distinguish global events from round events', () => {
  const game = atBet();
  settle(game);
  assert.equal(game.dispatch({ type: 'advance-round' }), true);
  const record = game.getRecord();
  const before = structuredClone(record);
  const all = reviewEvents(record, 'all');
  assert.deepEqual(all, record.events);
  assert.notEqual(all, record.events, 'filtering provides an independent event list');
  assert.ok(all.some((event) => event.round === null));
  const first = reviewEvents(record, '1');
  const second = reviewEvents(record, 2);
  assert.ok(first.length > 0);
  assert.ok(second.length > 0);
  assert.ok(first.every((event) => event.round === 1));
  assert.ok(second.every((event) => event.round === 2));
  assert.ok(first.at(-1).id < second[0].id);
  assert.deepEqual(reviewEvents(record, 99), []);
  assert.deepEqual(reviewEvents(null, 'all'), []);
  assert.deepEqual(record, before);
});

test('stored card, event and archive text is escaped in both review and full details', () => {
  const game = atBet();
  settle(game);
  game.dispatch({ type: 'elapse', sessionId: game.getState().sessionId, elapsedMs: 999999999 });
  const record = game.getRecord();
  const payload = '<img src=x onerror="throw 1">';
  record.matchId = '<x-test>';
  record.rounds[0].attempts[0].player.hand[0].rank = payload;
  record.rounds[0].attempts[0].player.hand[0].suit = '<x-suit>';
  record.events.find((event) => event.type === 'bet-action').details.paid = payload;
  const submitted = record.events.find((event) => event.type === 'hand-submitted');
  submitted.details.valid = false;
  submitted.details.reason = '<x-failure>';
  assert.equal(
    isCompletedRecord(record),
    true,
    'the storage boundary permits text fields, so rendering must escape them',
  );
  for (const lang of ['zh', 'en']) {
    const html = reviewMarkup(record, { lang }, selection());
    assert.equal(html.includes(payload), false);
    assert.equal(html.includes('<x-test>'), false);
    assert.equal(html.includes('<x-suit>'), false);
    assert.equal(html.includes('<x-failure>'), false);
    assert.match(html, /&lt;img src=x onerror=&quot;throw 1&quot;&gt;/);
    assert.match(html, /&lt;x-test&gt;/);
    assert.match(html, /&lt;x-suit&gt;/);
    assert.match(html, /&lt;x-failure&gt;/);
  }
});

test('repeated playback views, languages and event positions never mutate records or a live game', () => {
  const game = atBet();
  const state = game.getState();
  const record = freeze(game.getRecord());
  const before = structuredClone(record);
  for (const lang of ['zh', 'en']) {
    for (const event of [0, 1, 999]) {
      const view = freeze({ lang });
      const selected = freeze(selection({ event, playing: true }));
      assert.ok(reviewMarkup(record, view, selected).length > 100);
      assert.deepEqual(selected, selection({ event, playing: true }));
    }
  }
  assert.deepEqual(record, before);
  assert.deepEqual(game.getState(), state);
  assert.deepEqual(game.getRecord(), record);
  assert.match(reviewMarkup(null, { lang: 'en' }, selection()), /No match recorded yet/);
});
