import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/engine.js';
import { createDeck, judgeHand } from '../game/cards.js';
import { getBetOptions, applyBetAction } from '../game/betting.js';
import { advanceBreathing, startBreathing } from '../game/breathing.js';
import { compareHands, rankHand, settleBets } from '../game/rules.js';
import { introductionMarkup, resultMarkup } from '../ui/pages.js';
import { createTutorial, tutorialAction, tutorialMarkup } from '../ui/tutorial.js';

const view = { lang: 'zh' };
function immutableAction(state, action, data) {
  const before = structuredClone(state);
  Object.freeze(state.seen);
  Object.freeze(state);
  const next = tutorialAction(state, action, data);
  assert.deepEqual(state, before, 'an exercise must not mutate the prior view snapshot');
  assert.notEqual(next, state);
  assert.notEqual(next.seen, state.seen);
  return next;
}
function readHands(html) {
  const deck = createDeck();
  const faces = [
    ...html.matchAll(/class="lesson-card [^"]*"[^>]*><span>([^<]+)<small>([^<]+)<\/small>/g),
  ].map((match) => {
    const physical = deck.find((card) => card.rank === match[1] && card.suit === match[2]);
    assert.ok(physical, 'every illustrated face must be a real physical card');
    return physical;
  });
  assert.equal(faces.length % 5, 0, 'examples show complete five-card hands');
  return Array.from({ length: faces.length / 5 }, (_, index) =>
    faces.slice(index * 5, index * 5 + 5),
  );
}

test('tutorial requires actual lesson actions, preserves snapshots and never touches a live game', () => {
  const game = createGame({ random: () => 0.41 });
  const gameBefore = game.getState();
  const recordBefore = game.getRecord();
  let state = createTutorial();
  state = immutableAction(state, 'tutorial-next');
  assert.equal(state.step, 0);
  state = immutableAction(state, 'tutorial-select', { index: '0' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false);
  state = immutableAction(state, 'tutorial-target', { value: '30' });
  assert.equal(state.error, true);
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false);
  state = immutableAction(state, 'tutorial-target', { value: '24' });
  state = immutableAction(state, 'tutorial-select', { index: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, true);
  state = immutableAction(state, 'tutorial-next');
  assert.equal(state.step, 1);
  state = immutableAction(state, 'tutorial-call');
  assert.equal(state.paid, 2);
  state = immutableAction(state, 'tutorial-next');
  for (const scenario of ['failure', 'failure', 'fold'])
    state = immutableAction(state, 'tutorial-scenario', { scenario });
  assert.equal(state.complete, false, 'replaying one scenario does not count as another');
  state = immutableAction(state, 'tutorial-scenario', { scenario: 'calamity' });
  assert.equal(state.complete, true);
  state = immutableAction(state, 'tutorial-next');
  for (let index = 0; index < 3; index += 1) state = immutableAction(state, 'tutorial-breathe');
  state = immutableAction(state, 'tutorial-next');
  assert.equal(state.step, 4);
  assert.match(tutorialMarkup(state, view), /data-action="enter-match"/);
  assert.deepEqual(game.getState(), gameBefore);
  assert.deepEqual(game.getRecord(), recordBefore);
  assert.deepEqual(immutableAction(state, 'tutorial-restart'), createTutorial());
});

test('illustrated candidate and introduction hands obey the real five-card and rank rules in both languages', () => {
  for (const lang of ['zh', 'en']) {
    const candidates = readHands(tutorialMarkup(createTutorial(), { lang }));
    assert.equal(candidates.length, 2);
    for (const hand of candidates) assert.equal(judgeHand(hand, 24).valid, true);
    assert.equal(rankHand(candidates[0]).key, 'threeKind');
    assert.equal(rankHand(candidates[1]).key, 'highCard');
    assert.ok(compareHands(candidates[0], candidates[1]) > 0);
    const introduction = readHands(introductionMarkup({ lang }));
    assert.equal(introduction.length, 3);
    for (const hand of introduction) assert.equal(judgeHand(hand, 24).valid, true);
    assert.ok(compareHands(introduction[1], introduction[2]) > 0);
  }
});

test('every practice wager agrees with the engine half-pot cap, payment and next actor', () => {
  const fixture = {
    phase: 'bet',
    playerAir: 22,
    aiAir: 20,
    playerBet: 2,
    aiBet: 4,
    pot: 6,
    betting: { turn: 'player', turnId: 1, checks: 0, history: [] },
  };
  const options = getBetOptions(fixture, 'player');
  assert.equal(options.toCall, 2);
  assert.equal(options.maxRaise, 4);
  for (const increment of [0, 1, 2, 4]) {
    let lesson = { ...createTutorial(), step: 1 };
    if (increment)
      lesson = immutableAction(lesson, 'tutorial-increment', { value: String(increment) });
    lesson = immutableAction(lesson, increment ? 'tutorial-raise' : 'tutorial-call');
    const actual = applyBetAction(fixture, 'player', increment ? 'raise' : 'call', increment);
    assert.equal(lesson.paid, actual.event.paid);
    assert.equal(actual.state.betting.turn, 'ai');
    assert.equal(actual.outcome, 'continue');
    for (const lang of ['zh', 'en']) {
      const html = tutorialMarkup(lesson, { lang });
      assert.ok(html.includes(`<b>${actual.state.playerAir}<small> AIR</small></b>`));
      assert.ok(html.includes(`<b>${actual.state.pot}<small> AIR</small></b>`));
    }
  }
  const initial = { ...createTutorial(), step: 1 };
  assert.equal(immutableAction(initial, 'tutorial-increment', { value: '99' }).increment, 2);
});

test('calamity example has genuine physical overlap and burns only the actual rule amount', () => {
  for (const lang of ['zh', 'en']) {
    let lesson = { ...createTutorial(), step: 2 };
    lesson = immutableAction(lesson, 'tutorial-scenario', { scenario: 'calamity' });
    const html = tutorialMarkup(lesson, { lang });
    const [winner, loser] = readHands(html);
    assert.equal(judgeHand(winner, 24).valid, true);
    assert.equal(judgeHand(loser, 24).valid, true);
    assert.equal(rankHand(winner).key, 'fourKind');
    assert.equal(rankHand(loser).key, 'threeKind');
    assert.ok(compareHands(winner, loser) > 0);
    assert.deepEqual(
      winner
        .filter((card) => loser.some((other) => other.id === card.id))
        .map((card) => card.rank + card.suit),
      ['4♠', '4♥', '4♦'],
    );
    const settled = settleBets({
      playerAir: 18,
      aiAir: 18,
      playerBet: 6,
      aiBet: 6,
      winner: 'player',
      calamity: true,
    });
    assert.equal(settled.burned, 6);
    assert.equal(settled.playerAir + settled.aiAir + settled.burned + 2, 50);
    assert.match(html, /6 AIR/);
    for (const scenario of ['failure', 'fold']) {
      lesson = immutableAction(lesson, 'tutorial-scenario', { scenario });
      assert.match(tutorialMarkup(lesson, { lang }), /: 0 AIR/);
    }
    const reset = immutableAction(lesson, 'tutorial-reset');
    assert.equal(reset.step, 2);
    assert.deepEqual(reset.seen, []);
    assert.equal(reset.complete, false);
  }
});

test('breathing exercise distinguishes zero reserve, supply and grace using real breathing boundaries', () => {
  let actual = advanceBreathing(startBreathing(2, 25), 295000);
  let lesson = { ...createTutorial(), step: 3 };
  assert.equal(actual.playerAir, 1);
  assert.equal(actual.respiration.player.remainingMs, 5000);
  for (const [index, duration] of [5000, 300000, 10000].entries()) {
    actual = advanceBreathing(actual, duration);
    lesson = immutableAction(lesson, 'tutorial-breathe');
    assert.equal(lesson.complete, actual.drowned.includes('player'));
    assert.equal(actual.playerAir, 0);
    const expectedSupply = index === 0 ? '05:00' : '00:00';
    for (const lang of ['zh', 'en'])
      assert.ok(tutorialMarkup(lesson, { lang }).includes(`<dd>${expectedSupply}</dd>`));
    if (index < 2) assert.equal(lesson.complete, false);
  }
  assert.equal(actual.respiration.player.shortageMs, 10000);
  assert.equal(lesson.complete, true);
});

test('result screens require an explicit terminal winner and show recorded facts in both languages', () => {
  const fixture = {
    phase: 'summary',
    winner: null,
    playerAir: 0,
    aiAir: 0,
    completedRounds: 3,
    maxRounds: 5,
    respiration: { elapsedMs: 723000 },
    accounting: { burned: 7 },
  };
  for (const lang of ['zh', 'en']) {
    assert.equal(resultMarkup(fixture, { lang }), '', 'null must never become a draw');
    assert.equal(resultMarkup({ ...fixture, phase: 'endurance', winner: 'tie' }, { lang }), '');
    for (const [winner, scene] of [
      ['player', 'victory'],
      ['ai', 'defeat'],
      ['tie', 'draw'],
    ]) {
      const html = resultMarkup({ ...fixture, winner }, { lang });
      assert.ok(html.includes(`data-scene="${scene}"`));
      assert.match(html, /3 \/ 5/);
      assert.match(html, /12:03/);
      assert.match(html, /7 AIR/);
      assert.match(html, /data-action="open-record"/);
    }
  }
});
