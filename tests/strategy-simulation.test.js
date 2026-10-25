import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { makeCandidates, judgeHand } from '../game/cards.js';
import { simulateMatch, comparePolicies, seeded } from '../scripts/strategy/simulate.js';

test('isolated deal source reproduces the same deal and swapping reverses both hands', () => {
  function hands(swapSides, strategyRoll) {
    let privateTargets;
    const game = createGame({
      dealRandom: seeded(91),
      random: () => strategyRoll,
      swapSides,
      opponent: {
        choosePlay: (targets, used, discard) => {
          privateTargets = [...targets];
          targets[0] = 999;
          used.push(4);
          discard.push({ id: 'invalid' });
          return { index: 0, target: privateTargets[0], hand: null, rank: null };
        },
        chooseBet: () => ({ action: 'check' }),
      },
    });
    const state = game.getState();
    assert.deepEqual(state.discard, []);
    assert.deepEqual(state.usedTargets, []);
    game.dispatch({ type: 'choose-target', index: 0 });
    assert.equal(game.getState().aiTarget, privateTargets[0]);
    assert.equal(game.getState().aiRemaining, 4);
    return { player: state.targets, opponent: privateTargets };
  }
  const normal = hands(false, 0);
  assert.deepEqual(hands(false, 0.99), normal);
  assert.deepEqual(hands(true, 0), { player: normal.opponent, opponent: normal.player });
});

test('whole-engine simulations are deterministic, conserve AIR, and validate completed records', () => {
  const first = simulateMatch({ seed: 4 });
  assert.deepEqual(simulateMatch({ seed: 4 }), first);
  for (const opponent of ['legacy', 'passive', 'aggressive', 'random']) {
    const result = simulateMatch({ seed: 8, player: 'current', opponent, slow: true });
    assert.equal(result.balanced, true);
    assert.ok(['player', 'ai', 'tie'].includes(result.winner));
    assert.ok(result.rounds <= 5);
  }
  const report = comparePolicies('legacy', 'legacy', { seeds: 2 });
  assert.equal(report.matches, 4);
  assert.equal(report.wins + report.ties + report.losses, 4);
  assert.equal(report.allBalanced, true);
});

test('policy input mutation and retained return objects cannot modify authoritative hands or accounts', () => {
  let returned;
  let called = false;
  const game = createGame({
    random: seeded(17),
    opponent: {
      choosePlay: (targets) => {
        returned = { index: 0, target: targets[0], ...makeCandidates(targets[0])[0] };
        return returned;
      },
      chooseBet: (input) => {
        called = true;
        const action = input.options.canCall ? 'call' : 'check';
        input.hand[0].value = 999;
        input.discard.push({ id: 'fake' });
        input.options.reserve = -100;
        input.history.push({ actor: 'fake' });
        return { action };
      },
    },
  });
  const target = returned.target;
  returned.target = 999;
  returned.hand[0].value = 999;
  assert.equal(game.dispatch({ type: 'choose-target', index: 0 }), true);
  assert.equal(game.getState().aiTarget, target);
  game.dispatch({ type: 'confirm-hand', attemptId: game.getState().upper.attemptId });
  for (let step = 0; game.getState().phase === 'bet'; step++) {
    assert.ok(step < 50);
    const state = game.getState();
    assert.equal(
      game.dispatch(
        state.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: state.betting.turnId }
          : {
              type: 'bet',
              action: state.legalBets.canCall ? 'call' : 'check',
              turnId: state.betting.turnId,
            },
      ),
      true,
    );
  }
  const state = game.getState();
  assert.equal(called, true);
  assert.equal(judgeHand(state.aiHand, target).valid, true);
  assert.equal(state.accounting.balanced, true);
  assert.equal(
    state.discard.some((card) => card.id === 'fake'),
    false,
  );
  assert.equal(
    state.betting.history.some((event) => event.actor === 'fake'),
    false,
  );
});
