import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { classifyMotion, createSceneMotion } from '../browser/scene-motion.js';

const seeded = (initial) => {
  let seed = initial;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};
const start = () => createGame({ random: seeded(12) });
const choose = (game) => game.dispatch({ type: 'choose-target', index: 0 });
const lock = (game) =>
  game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId });

test('motion classification preserves target position and never exposes a hidden opponent hand', () => {
  const game = start();
  const before = game.getState();
  choose(game);
  const after = game.getState();
  assert.deepEqual(classifyMotion(before, after), [
    { type: 'target', index: 0, value: before.targets[0] },
  ]);
  assert.equal(after.aiHand, null);
  assert.deepEqual(classifyMotion(after, structuredClone(after)), []);
  game.reset();
  assert.deepEqual(classifyMotion(after, game.getState()), []);
});

test('accepted hand lock animates exact ante while breathing is not a payment', () => {
  const game = start();
  let before = game.getState();
  game.dispatch({ type: 'elapse', sessionId: before.sessionId, elapsedMs: 300001 });
  let after = game.getState();
  assert.equal(after.playerAir, before.playerAir - 1);
  assert.deepEqual(classifyMotion(before, after), []);
  choose(game);
  before = game.getState();
  lock(game);
  after = game.getState();
  const effects = classifyMotion(before, after);
  assert.equal(effects.find((event) => event.type === 'lock').index, before.selectedCandidate);
  assert.deepEqual(effects.find((event) => event.type === 'payment').payments, [
    { actor: 'player', amount: 1, ante: true },
    { actor: 'ai', amount: 1, ante: true },
  ]);
  assert.equal(
    effects.some((event) => event.type === 'reveal'),
    false,
  );
});

test('payment uses accepted paid fact including call, once, despite settlement balances', () => {
  const game = start();
  choose(game);
  lock(game);
  let sawPayment = false;
  for (let i = 0; i < 100 && game.getState().phase === 'bet'; i++) {
    const before = game.getState();
    if (before.betting.turn === 'ai')
      game.dispatch({ type: 'cpu-bet', turnId: before.betting.turnId });
    else
      game.dispatch({
        type: 'bet',
        action: before.legalBets.canRaise ? 'raise' : before.legalBets.canCall ? 'call' : 'check',
        amount: 1,
        turnId: before.betting.turnId,
      });
    const after = game.getState();
    const accepted = after.betting.history.at(-1);
    const effects = classifyMotion(before, after);
    const payment = effects.find((event) => event.type === 'payment');
    if (accepted.paid) {
      sawPayment = true;
      assert.deepEqual(payment.payments, [
        { actor: accepted.actor, amount: accepted.paid, turnId: accepted.turnId },
      ]);
    } else assert.equal(payment, undefined);
    assert.deepEqual(classifyMotion(after, structuredClone(after)), []);
    assert.equal(
      effects.some((event) => event.type === 'reveal'),
      after.phase === 'showdown',
    );
  }
  assert.equal(sawPayment, true);
});

test('folds, ties, zero burn and a new terminal state cannot invent calamity effects', () => {
  const before = { sessionId: 1, round: 1, phase: 'bet', betting: { history: [] } };
  for (const result of [
    { calamity: true, folded: true, winner: 'ai', burned: 2 },
    { calamity: true, folded: false, winner: 'tie', burned: 2 },
    { calamity: true, folded: false, winner: 'ai', burned: 0 },
  ])
    assert.equal(
      classifyMotion(before, { ...before, phase: 'showdown', lastResult: result }).some(
        (event) => event.type === 'burn',
      ),
      false,
    );
  assert.deepEqual(classifyMotion(before, { ...before, phase: 'summary' }), []);
  const after = {
    ...before,
    phase: 'showdown',
    lastResult: { calamity: true, folded: false, winner: 'ai', burned: 3 },
  };
  assert.deepEqual(
    classifyMotion(before, after).find((event) => event.type === 'burn'),
    { type: 'burn', amount: 3 },
  );
});

test('scene lifecycle honors reduced motion, one frame loop, visibility and destroy', () => {
  const frames = new Map();
  let nextFrame = 0;
  let entrances = 0;
  const media = Object.assign(new EventTarget(), { matches: false });
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => media,
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const document = Object.assign(new EventTarget(), {
    defaultView: win,
    documentElement: { dataset: {} },
    hidden: false,
  });
  const scene = {
    animate() {
      entrances++;
      return { finished: Promise.resolve(), cancel() {} };
    },
  };
  const root = {
    ownerDocument: document,
    dataset: {},
    querySelector: (selector) => (selector === '[data-scene]' ? scene : null),
    querySelectorAll: () => [],
  };
  const motion = createSceneMotion({ root });
  const state = { sessionId: 1, round: 1, phase: 'lower', usedTargets: [] };
  motion.update(state, { screen: 'home', lang: 'zh' });
  motion.update(structuredClone(state), { screen: 'home', lang: 'en' });
  assert.equal(entrances, 1, 'language does not replay the scene entrance');
  assert.equal(frames.size, 1, 'updates do not multiply frame loops');
  motion.setEnabled(false);
  assert.equal(frames.size, 0);
  assert.equal(document.documentElement.dataset.motion, 'off', 'dialogs share the preference');
  motion.setEnabled(true);
  assert.equal(frames.size, 1);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 0, 'system reduced motion overrides enabled preference');
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 1);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 0);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 1);
  motion.suspend();
  assert.equal(frames.size, 0);
  motion.resume();
  motion.update(state, { screen: 'game', lang: 'en' });
  assert.equal(entrances, 1, 'resume does not replay a skipped scene');
  assert.equal(frames.size, 1);
  motion.destroy();
  assert.equal(frames.size, 0);
  assert.equal(root.dataset.motion, 'off');
  assert.equal(document.documentElement.dataset.motion, 'off');
  media.dispatchEvent(new Event('change'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 0, 'disposed listeners cannot restart a loop');
});

// These nodes only model the browser surfaces used by card feedback and flight.
function cardMotionFixture() {
  const selectors = new Map();
  const lists = new Map();
  const played = [];
  const copies = [];
  const media = Object.assign(new EventTarget(), { matches: false });
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => media,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });
  const document = Object.assign(new EventTarget(), {
    defaultView: win,
    documentElement: { dataset: {} },
    hidden: false,
    body: { append: (node) => copies.push(node) },
  });
  const root = {
    ownerDocument: document,
    dataset: {},
    querySelector: (selector) => selectors.get(selector) ?? null,
    querySelectorAll: (selector) => lists.get(selector) ?? [],
  };
  const cardNode = (id, area, left, top) => ({
    dataset: { cardId: id },
    textContent: id,
    area,
    style: {},
    classList: { add() {} },
    getBoundingClientRect: () => ({ left, top, width: 40, height: 60 }),
    cloneNode: () => cardNode(id, area, left, top),
    querySelectorAll: () => [],
    removeAttribute(name) {
      if (name === 'data-card-id') delete this.dataset.cardId;
    },
    setAttribute() {},
    remove() {},
    animate(frames, options) {
      played.push({ node: this, frames, options });
      return { finished: Promise.resolve(), cancel() {} };
    },
  });
  function showDraft(ids) {
    const nodes = ids.map((id, index) => cardNode(id, 'draft', index * 50, 100));
    lists.set('[data-hand-draft] [data-card-id]', nodes);
    for (const node of nodes)
      selectors.set('[data-hand-draft] [data-card-id="' + node.dataset.cardId + '"]', node);
    return nodes;
  }
  function showPool(ids) {
    for (const id of ids)
      selectors.set('[data-hand-pool] [data-card-id="' + id + '"]', cardNode(id, 'pool', 0, 300));
  }
  const motion = createSceneMotion({ root });
  return { motion, selectors, lists, played, copies, cardNode, showDraft, showPool };
}

test('editing a free hand animates only newly selected slots and removed cards in the pool', () => {
  const game = start();
  choose(game);
  const state = game.getState();
  const fixture = cardMotionFixture();
  const { motion, played } = fixture;
  fixture.showPool(['1-0', '2-0', '3-0']);
  fixture.showDraft(['1-0', '2-0']);
  motion.update(state, { screen: 'game', lang: 'zh', handDraft: { cardIds: ['1-0', '2-0'] } });
  assert.equal(played.length, 0);
  fixture.showDraft(['1-0', '3-0']);
  motion.update(structuredClone(state), {
    screen: 'game',
    lang: 'zh',
    handDraft: { cardIds: ['1-0', '3-0'] },
  });
  assert.deepEqual(
    played.map(({ node }) => [node.area, node.textContent]),
    [
      ['draft', '3-0'],
      ['pool', '2-0'],
    ],
  );
  assert.deepEqual(game.getState(), state, 'decorative feedback never changes the match');
  motion.destroy();
});

test('language redraw and disabling motion never replay draft selection feedback', () => {
  const game = start();
  choose(game);
  const state = game.getState();
  const fixture = cardMotionFixture();
  const { motion, played, copies } = fixture;
  fixture.showPool(['1-0', '2-0']);
  fixture.showDraft([]);
  motion.update(state, { screen: 'game', lang: 'zh', handDraft: { cardIds: [] } });
  fixture.showDraft(['1-0']);
  motion.update(structuredClone(state), {
    screen: 'game',
    lang: 'zh',
    handDraft: { cardIds: ['1-0'] },
  });
  assert.equal(played.length, 1);
  fixture.showDraft(['1-0']);
  motion.update(structuredClone(state), {
    screen: 'game',
    lang: 'en',
    handDraft: { cardIds: ['1-0'] },
  });
  assert.equal(played.length, 1, 'a fresh language render does not select the card again');
  motion.setEnabled(false);
  fixture.showDraft(['2-0']);
  motion.update(structuredClone(state), {
    screen: 'game',
    lang: 'en',
    handDraft: { cardIds: ['2-0'] },
  });
  assert.equal(played.length, 1, 'disabled feedback neither adds nor removes cards visually');
  assert.equal(copies.length, 0);
  motion.setEnabled(true);
  motion.update(structuredClone(state), {
    screen: 'game',
    lang: 'en',
    handDraft: { cardIds: ['2-0'] },
  });
  assert.equal(played.length, 1, 'reenabling does not replay edits made while motion was disabled');
  motion.destroy();
});

test('locking a manual hand flies the actual draft faces to matching physical-card destinations', () => {
  const game = createGame({ random: seeded(1) });
  choose(game);
  const before = game.getState();
  const hand = before.candidates[0].hand.map((card) =>
    card.value === 1 ? { ...card, suit: '♣', id: '1-3' } : card,
  );
  assert.ok(
    !before.candidates.some((candidate) => candidate.hand.some((card) => card.id === '1-3')),
  );
  const fixture = cardMotionFixture();
  const { motion, played, copies, cardNode } = fixture;
  const sources = fixture.showDraft(hand.map((card) => card.id));
  const recommended = {
    dataset: { candidateIndex: '0' },
    querySelectorAll: () =>
      before.candidates[0].hand.map((card, index) =>
        cardNode(card.id, 'recommendation', 800 + index * 50, 500),
      ),
  };
  fixture.lists.set('[data-candidate-index]', [recommended]);
  motion.update(before, {
    screen: 'game',
    lang: 'zh',
    handDraft: { cardIds: hand.map((card) => card.id) },
  });
  motion.capture();
  assert.equal(
    game.dispatch({
      type: 'submit-hand',
      attemptId: before.upper.attemptId,
      hand,
    }),
    true,
  );
  const after = game.getState();
  assert.equal(after.phase, 'bet');
  fixture.showDraft([]);
  const destinations = [...hand]
    .reverse()
    .map((card, index) => cardNode(card.id, 'player', 300 + index * 70, 200));
  fixture.selectors.set('[data-hand="player"]', {
    querySelectorAll: () => destinations,
  });
  motion.update(after, { screen: 'game', lang: 'zh', handDraft: null });
  assert.equal(copies.length, 5);
  assert.deepEqual(
    copies.map((copy) => copy.textContent).sort(),
    hand.map((card) => card.id).sort(),
  );
  assert.ok(
    copies.every((copy) => copy.area === 'draft'),
    'recommendations must not supply flight faces',
  );
  assert.equal(played.length, 5);
  for (const { node, frames } of played) {
    const from = sources
      .find((source) => source.textContent === node.textContent)
      .getBoundingClientRect();
    const to = destinations
      .find((destination) => destination.textContent === node.textContent)
      .getBoundingClientRect();
    assert.equal(node.style.left, from.left + 'px');
    assert.equal(node.style.top, from.top + 'px');
    assert.equal(
      frames.at(-1).transform,
      'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) scale(1)',
      'each face lands at its own ID even when destination order differs',
    );
  }
  motion.update(structuredClone(after), { screen: 'game', lang: 'en', handDraft: null });
  assert.equal(played.length, 5, 'language changes do not replay a committed hand');
  assert.deepEqual(game.getState(), after);
  motion.destroy();
});
