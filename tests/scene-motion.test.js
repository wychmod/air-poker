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

test('motion classification preserves target position and never exposes a hidden CPU hand', () => {
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
