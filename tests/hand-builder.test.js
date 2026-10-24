import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { editHandDraft, getDraftCards, getDraftStatus, syncHandDraft } from '../ui/hand-builder.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function setup() {
  const game = createGame({ random: seeded(1) });
  assert.equal(game.dispatch({ type: 'choose-target', index: 0 }), true);
  const state = game.getState();
  return { game, state, draft: syncHandDraft(state, null) };
}

function edit(state, draft, action, data = {}) {
  return editHandDraft(state, draft, action, { attempt: String(state.upper.attemptId), ...data });
}

function fill(state, draft, ids) {
  for (const card of ids) draft = edit(state, draft, 'toggle-hand-card', { card });
  return draft;
}

test('free selection supports removal and replacement, limits the draft to five, and clears it', () => {
  const { state, draft: empty } = setup();
  assert.deepEqual(empty.cardIds, []);
  const ids = ['1-3', '10-0', '10-1', '10-2', '10-3'];
  let draft = fill(state, empty, ids);
  assert.deepEqual(draft.cardIds, ids);
  assert.deepEqual(empty.cardIds, []);
  assert.equal(getDraftStatus(state, draft).valid, true);
  assert.equal(getDraftStatus(state, draft).complete, true);
  assert.equal(getDraftStatus(state, draft).sum, state.playerTarget);
  assert.strictEqual(edit(state, draft, 'toggle-hand-card', { card: '2-0' }), draft);
  draft = edit(state, draft, 'toggle-hand-card', { card: '1-3' });
  assert.equal(draft.cardIds.length, 4);
  assert.equal(getDraftStatus(state, draft).complete, false);
  assert.equal(getDraftStatus(state, draft).reason, 'incomplete');
  draft = edit(state, draft, 'toggle-hand-card', { card: '1-2' });
  assert.deepEqual(draft.cardIds, ['10-0', '10-1', '10-2', '10-3', '1-2']);
  assert.equal(getDraftStatus(state, draft).valid, true);
  const cleared = edit(state, draft, 'clear-hand');
  assert.deepEqual(cleared.cardIds, []);
  assert.equal(cleared.candidateIndex, null);
  assert.equal(draft.cardIds.length, 5);
});

test('a recommendation fills an editable draft and manual changes release the recommendation', () => {
  const { state, draft: empty } = setup();
  let draft = edit(state, empty, 'select-candidate', { index: '1' });
  assert.equal(draft.candidateIndex, 1);
  assert.deepEqual(
    draft.cardIds,
    state.candidates[1].hand.map((card) => card.id),
  );
  assert.equal(getDraftStatus(state, draft).valid, true);
  draft = edit(state, draft, 'toggle-hand-card', { card: '1-1' });
  assert.equal(draft.candidateIndex, null);
  assert.equal(draft.cardIds.length, 4);
  draft = edit(state, draft, 'toggle-hand-card', { card: '1-3' });
  assert.equal(getDraftStatus(state, draft).valid, true);
  assert.ok(draft.cardIds.includes('1-3'));
  assert.ok(!draft.cardIds.includes('1-1'));
  assert.strictEqual(edit(state, draft, 'select-candidate', { index: '99' }), draft);
  assert.strictEqual(edit(state, draft, 'select-candidate', { index: '1.5' }), draft);
});

test('used physical cards remain selectable and report used-card without resolving the game', () => {
  const { game, state, draft: empty } = setup();
  const before = game.getState();
  const record = game.getRecord();
  const used = state.candidates[0].hand.find((card) => card.id === '1-0');
  const withDiscard = { ...state, discard: [used] };
  const draft = fill(withDiscard, empty, ['1-0', '10-0', '10-1', '10-2', '10-3']);
  assert.ok(draft.cardIds.includes('1-0'));
  const status = getDraftStatus(withDiscard, draft);
  assert.equal(status.complete, true);
  assert.equal(status.sum, withDiscard.playerTarget);
  assert.equal(status.valid, false);
  assert.equal(status.reason, 'used-card');
  assert.deepEqual(game.getState(), before);
  assert.deepEqual(game.getRecord(), record);
});

test('suit filters preserve selected cards and recommendation ownership', () => {
  const { state, draft: empty } = setup();
  const recommended = edit(state, empty, 'select-candidate', { index: '0' });
  const cards = getDraftCards(state, recommended);
  let draft = recommended;
  for (const suit of ['0', '1', '2', '3', 'all']) {
    draft = edit(state, draft, 'filter-hand-suit', { suit });
    assert.equal(draft.suit, suit);
    assert.equal(draft.candidateIndex, 0);
    assert.deepEqual(getDraftCards(state, draft), cards);
  }
  assert.strictEqual(edit(state, draft, 'filter-hand-suit', { suit: '4' }), draft);
  assert.strictEqual(edit(state, draft, 'filter-hand-suit', { suit: '' }), draft);
});

test('rerendering the same attempt preserves the draft and all local edits preserve the deadline', () => {
  const { game, state, draft: empty } = setup();
  const before = game.getState();
  const record = game.getRecord();
  let draft = fill(state, empty, ['1-3', '10-0']);
  draft = edit(state, draft, 'filter-hand-suit', { suit: '3' });
  const rerendered = syncHandDraft(structuredClone(state), draft);
  assert.strictEqual(rerendered, draft);
  assert.deepEqual(rerendered.cardIds, ['1-3', '10-0']);
  assert.equal(rerendered.suit, '3');
  getDraftStatus(state, draft);
  getDraftCards(state, draft);
  assert.equal(game.getState().upper.deadlineMs, before.upper.deadlineMs);
  assert.deepEqual(game.getState(), before);
  assert.deepEqual(game.getRecord(), record);
});

test('new sessions or attempts clear drafts and stale or out-of-phase edits are inert', () => {
  const { state, draft: empty } = setup();
  let draft = edit(state, empty, 'select-candidate', { index: '0' });
  draft = edit(state, draft, 'filter-hand-suit', { suit: '2' });
  const nextAttempt = { ...state, upper: { ...state.upper, attemptId: state.upper.attemptId + 1 } };
  const nextSession = { ...state, sessionId: state.sessionId + 1 };
  for (const next of [nextAttempt, nextSession]) {
    const fresh = syncHandDraft(next, draft);
    assert.deepEqual(fresh.cardIds, []);
    assert.equal(fresh.suit, 'all');
    assert.equal(fresh.candidateIndex, null);
    assert.equal(fresh.sessionId, next.sessionId);
    assert.equal(fresh.attemptId, next.upper.attemptId);
    assert.deepEqual(getDraftCards(next, draft), []);
    assert.strictEqual(edit(next, draft, 'clear-hand'), draft);
  }
  const fresh = syncHandDraft(nextAttempt, draft);
  for (const action of ['toggle-hand-card', 'select-candidate', 'clear-hand', 'filter-hand-suit']) {
    assert.strictEqual(
      editHandDraft(nextAttempt, fresh, action, {
        attempt: String(state.upper.attemptId),
        card: '1-0',
        index: '0',
        suit: '1',
      }),
      fresh,
    );
  }
  const betting = { ...state, phase: 'bet' };
  assert.equal(syncHandDraft(betting, draft), null);
  assert.deepEqual(getDraftCards(betting, draft), []);
  assert.strictEqual(edit(betting, draft, 'clear-hand'), draft);
  assert.strictEqual(edit(state, draft, 'unknown-action'), draft);
  assert.strictEqual(edit(state, draft, 'toggle-hand-card', { card: '52-0' }), draft);
});

test('draft card snapshots do not expose mutable shared cards, candidates, or selection arrays', () => {
  const { state, draft: empty } = setup();
  const before = structuredClone(state);
  const draft = edit(state, empty, 'select-candidate', { index: '0' });
  const expected = getDraftCards(state, draft);
  const cards = getDraftCards(state, draft);
  cards[0].value = 99;
  cards[0].id = 'fake-card';
  cards.splice(1);
  assert.deepEqual(getDraftCards(state, draft), expected);
  const status = getDraftStatus(state, draft);
  status.hand[0].suit = '?';
  status.hand.length = 0;
  assert.deepEqual(getDraftCards(state, draft), expected);
  assert.deepEqual(state, before);
  assert.equal(draft.cardIds.length, 5);
  assert.equal(getDraftStatus(state, draft).valid, true);
});
