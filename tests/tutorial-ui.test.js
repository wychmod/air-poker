import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/engine.js';
import { createDeck, judgeHand } from '../game/cards.js';
import { getBetOptions, applyBetAction } from '../game/betting.js';
import { advanceBreathing, startBreathing } from '../game/breathing.js';
import { compareHands, rankHand, settleBets } from '../game/rules.js';
import { introductionMarkup, resultMarkup, rulesMarkup } from '../ui/pages.js';
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
  assert.equal(state.target, 30);
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false);
  state = immutableAction(state, 'tutorial-target', { value: '24' });
  state = immutableAction(state, 'tutorial-select', { index: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, true, 'a valid example can be locked directly');
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

test('valid practice examples enable locking immediately without manual edits', () => {
  for (const target of [24, 30]) {
    for (const index of [0, 1]) {
      let state = immutableAction(createTutorial(), 'tutorial-target', { value: String(target) });
      state = immutableAction(state, 'tutorial-select', { index: String(index) });
      for (const lang of ['zh', 'en']) {
        const html = tutorialMarkup(state, { lang });
        const status = html.match(/data-hand-status>([^<]*)/)[1];
        assert.match(status, /可锁定|Ready to lock/);
        const hint = html.match(/id="tutorialLockHint"[^>]*>([^<]*)/)[1];
        assert.match(hint, lang === 'zh' ? /条件已满足/ : /Ready to finish/);
        assert.doesNotMatch(
          html,
          /请先移除|手动编辑|Remove a selected card first|Edit a card first/,
        );
        assert.doesNotMatch(html.match(/data-action="tutorial-lock"[^>]*>/)[0], /disabled/);
        assert.match(html, lang === 'zh' ? /教学预设：7♥/ : /Practice setup: 7♥/);
      }
      assert.equal(immutableAction(state, 'tutorial-lock').complete, true);
      state = immutableAction(state, 'tutorial-filter-hand-suit', { suit: '0', attempt: '1' });
      assert.equal(immutableAction(state, 'tutorial-lock').complete, true);
      const card = state.draft.cardIds.at(-1);
      state = immutableAction(state, 'tutorial-toggle-hand-card', { card, attempt: '1' });
      assert.equal(immutableAction(state, 'tutorial-lock').complete, false);
      state = immutableAction(state, 'tutorial-toggle-hand-card', { card, attempt: '1' });
      for (const lang of ['zh', 'en']) {
        const html = tutorialMarkup(state, { lang });
        assert.match(html.match(/data-hand-status>([^<]*)/)[1], /可锁定|Ready to lock/);
        assert.doesNotMatch(html.match(/data-action="tutorial-lock"[^>]*>/)[0], /disabled/);
      }
      assert.equal(immutableAction(state, 'tutorial-lock').complete, true);
    }
  }
});

test('target 30 practice rejects wrong sums and used cards, then locks the corrected hand', () => {
  let state = immutableAction(createTutorial(), 'tutorial-target', { value: '30' });
  state = immutableAction(state, 'tutorial-select', { index: '0' });
  assert.equal(state.draft.cardIds.length, 5, 'target 30 must have usable examples');
  state = immutableAction(state, 'tutorial-clear-hand', { attempt: '1' });
  for (const card of ['6-0', '6-1', '6-2', '5-3', '8-0'])
    state = immutableAction(state, 'tutorial-toggle-hand-card', { card, attempt: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false, '31 does not match target 30');
  state = immutableAction(state, 'tutorial-toggle-hand-card', { card: '8-0', attempt: '1' });
  state = immutableAction(state, 'tutorial-toggle-hand-card', { card: '7-1', attempt: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false, 'used 7♥ cannot complete a hand even with the right sum');
  state = immutableAction(state, 'tutorial-toggle-hand-card', { card: '7-1', attempt: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, false, 'four cards cannot complete the exercise');
  state = immutableAction(state, 'tutorial-toggle-hand-card', { card: '7-0', attempt: '1' });
  state = immutableAction(state, 'tutorial-lock');
  assert.equal(state.complete, true);
  for (const lang of ['zh', 'en'])
    assert.match(tutorialMarkup(state, { lang }), /(?:点数和|totaling) 30/);
  assert.equal(immutableAction(state, 'tutorial-next').step, 1);
});

test('switching practice targets clears the draft but repeated selection preserves it', () => {
  let state = immutableAction(createTutorial(), 'tutorial-target', { value: '24' });
  state = immutableAction(state, 'tutorial-select', { index: '0' });
  state = immutableAction(state, 'tutorial-toggle-hand-card', { card: '7-0', attempt: '1' });
  state = immutableAction(state, 'tutorial-filter-hand-suit', { suit: '2', attempt: '1' });
  const repeated = immutableAction(state, 'tutorial-target', { value: '24' });
  assert.deepEqual(repeated.draft, state.draft);
  state = immutableAction(state, 'tutorial-target', { value: '30' });
  assert.deepEqual(state.draft.cardIds, []);
  assert.equal(state.draft.candidateIndex, null);
  assert.equal(state.draft.suit, 'all');
  state = immutableAction(state, 'tutorial-select', { index: '1' });
  assert.equal(state.draft.cardIds.length, 5);
  assert.deepEqual(immutableAction(state, 'tutorial-target', { value: '99' }), state);
  state = immutableAction(state, 'tutorial-target', { value: '24' });
  assert.deepEqual(state.draft.cardIds, []);
  assert.equal(state.draft.candidateIndex, null);
  assert.equal(immutableAction(state, 'tutorial-lock').complete, false);
});

test('illustrated candidate and introduction hands obey the real five-card and rank rules in both languages', () => {
  for (const lang of ['zh', 'en']) {
    for (const target of [24, 30]) {
      const state = immutableAction(createTutorial(), 'tutorial-target', { value: String(target) });
      const candidates = readHands(tutorialMarkup(state, { lang }));
      assert.equal(candidates.length, 2);
      for (const hand of candidates) {
        assert.equal(judgeHand(hand, target).valid, true);
        assert.equal(
          hand.some((card) => card.id === '7-1'),
          false,
        );
      }
      assert.equal(rankHand(candidates[0]).key, 'threeKind');
      assert.equal(rankHand(candidates[1]).key, 'highCard');
      assert.ok(compareHands(candidates[0], candidates[1]) > 0);
    }
    const introduction = readHands(introductionMarkup({ lang }));
    assert.equal(introduction.length, 3);
    for (const hand of introduction) assert.equal(judgeHand(hand, 24).valid, true);
    assert.ok(compareHands(introduction[1], introduction[2]) > 0);
  }
});

test('full-rules poker examples match the real ranking order, kicker and ace-low comparisons', () => {
  const expected = [
    'royalFlush',
    'straightFlush',
    'fourKind',
    'fullHouse',
    'flush',
    'straight',
    'threeKind',
    'twoPair',
    'onePair',
    'highCard',
  ];
  for (const lang of ['zh', 'en']) {
    const hands = readHands(rulesMarkup(lang));
    assert.equal(hands.length, 14);
    for (const hand of hands)
      assert.equal(
        judgeHand(
          hand,
          hand.reduce((sum, card) => sum + card.value, 0),
        ).valid,
        true,
      );
    assert.deepEqual(
      hands.slice(0, 10).map((hand) => rankHand(hand).key),
      expected,
    );
    for (let index = 0; index < 9; index += 1)
      assert.ok(compareHands(hands[index], hands[index + 1]) > 0);
    const [kingKicker, queenKicker, sixHigh, wheel] = hands.slice(10);
    assert.equal(rankHand(kingKicker).key, 'onePair');
    assert.equal(rankHand(queenKicker).key, 'onePair');
    assert.equal(rankHand(kingKicker).tie[0], rankHand(queenKicker).tie[0]);
    assert.ok(compareHands(kingKicker, queenKicker) > 0);
    assert.equal(rankHand(sixHigh).key, 'straight');
    assert.equal(rankHand(wheel).key, 'straight');
    assert.deepEqual(rankHand(wheel).tie, [5]);
    assert.ok(compareHands(sixHigh, wheel) > 0);
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
