import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { DEFAULT_OPPONENT, OPPONENT_IDS, createOpponent, isOpponentId } from '../game/opponents.js';

const seeded = (initial) => {
  let seed = initial;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const options = (overrides = {}) => ({
  active: true,
  toCall: 0,
  minRaise: 1,
  maxRaise: 3,
  matchedLimit: 12,
  allInCost: 5,
  reserve: 10,
  potAfterCall: 4,
  canCheck: true,
  canCall: false,
  canRaise: true,
  canFold: true,
  canAllIn: false,
  ...overrides,
});

const legal = (decision, opts) => {
  if (!decision) return true;
  if (decision.action === 'check') return opts.canCheck === true;
  if (decision.action === 'call') return opts.canCall === true;
  if (decision.action === 'fold') return opts.canFold === true;
  if (decision.action === 'all-in') return opts.canAllIn === true;
  if (decision.action === 'raise')
    return (
      opts.canRaise === true &&
      Number.isInteger(decision.amount) &&
      decision.amount >= 1 &&
      decision.amount <= opts.maxRaise
    );
  return false;
};

function publicInput() {
  const game = createGame({ random: () => 0.41 });
  game.dispatch({ type: 'choose-target', index: 0 });
  const state = game.getState();
  return {
    hand: state.candidates[0].hand,
    opponentTarget: state.playerTarget,
    discard: state.discard,
    options: options(),
    history: [],
  };
}

test('opponent ids are explicit and unknown ids fall back to the analyst', () => {
  assert.deepEqual(OPPONENT_IDS, ['analyst', 'abyss', 'mirror']);
  assert.equal(DEFAULT_OPPONENT, 'analyst');
  assert.equal(isOpponentId('mirror'), true);
  assert.equal(isOpponentId('Mirror'), false);
  assert.equal(createOpponent('unknown').id, 'analyst');
  assert.equal(createOpponent().id, 'analyst');
  for (const id of OPPONENT_IDS) {
    const opponent = createOpponent(id);
    assert.equal(opponent.id, id);
    assert.equal(typeof opponent.choosePlay, 'function');
    assert.equal(typeof opponent.chooseBet, 'function');
  }
});

test('every persona only returns legal betting actions across edge options', () => {
  const base = publicInput();
  const matrix = [
    options(),
    options({ toCall: 4, canCheck: false, canCall: true, maxRaise: 0, canRaise: false }),
    options({ toCall: 8, canCheck: false, canCall: false, canRaise: false, canFold: true }),
    options({ toCall: 2, canCheck: false, canCall: true, maxRaise: 6, canAllIn: true }),
    options({ reserve: 0, toCall: 0, maxRaise: 0, canRaise: false, canCheck: true }),
  ];
  for (const id of OPPONENT_IDS) {
    const opponent = createOpponent(id);
    for (const opts of matrix) {
      for (const history of [[], [{ actor: 'player', action: 'raise', raised: 3 }]]) {
        for (let seed = 1; seed <= 40; seed++) {
          const input = { ...base, options: { ...opts }, history };
          const decision = opponent.chooseBet(input, seeded(seed));
          assert.ok(
            legal(decision, opts),
            `${id} returned ${JSON.stringify(decision)} for ${JSON.stringify(opts)}`,
          );
        }
      }
    }
  }
});

test('betting decisions are deterministic and never mutate accepted input', () => {
  for (const id of OPPONENT_IDS) {
    const opponent = createOpponent(id);
    const input = {
      ...publicInput(),
      options: options({ toCall: 3, canCheck: false, canCall: true, maxRaise: 5 }),
      history: [{ actor: 'player', action: 'raise', raised: 2 }],
    };
    const snapshot = structuredClone(input);
    const first = opponent.chooseBet(input, seeded(9));
    assert.deepEqual(input, snapshot, `${id} mutated its input`);
    const second = opponent.chooseBet(structuredClone(snapshot), seeded(9));
    assert.deepEqual(first, second);
  }
});

test('personas cannot see extra hidden fields in the same public decision', () => {
  for (const id of OPPONENT_IDS) {
    const opponent = createOpponent(id);
    const base = { ...publicInput(), options: options({ maxRaise: 4 }) };
    const clean = opponent.chooseBet(structuredClone(base), seeded(31));
    const poisoned = opponent.chooseBet(
      {
        ...structuredClone(base),
        aiHand: [{ rank: 'A', suit: '♠', id: '1-0' }],
        deck: [{ rank: 'K', suit: '♠', id: '13-0' }],
        opponentHand: [{ rank: 'K', suit: '♦', id: '13-1' }],
      },
      seeded(31),
    );
    assert.deepEqual(poisoned, clean);
  }
});

test('the abyss and mirror use distinct policies while the analyst keeps the base model', () => {
  assert.notEqual(createOpponent('analyst').chooseBet, createOpponent('abyss').chooseBet);
  assert.notEqual(createOpponent('analyst').chooseBet, createOpponent('mirror').chooseBet);
  assert.notEqual(createOpponent('abyss').chooseBet, createOpponent('mirror').chooseBet);
});
