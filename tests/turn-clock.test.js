import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnClock } from '../browser/turn-clock.js';

function fixture() {
  let time = 0,
    sequence = 0;
  const tasks = new Map(),
    callbacks = [];
  const ticks = [],
    expired = [],
    cpu = [],
    upper = [];
  const clock = createTurnClock({
    now: () => time,
    schedule(callback, delay) {
      const id = ++sequence;
      tasks.set(id, { callback, at: time + delay });
      callbacks.push(callback);
      return id;
    },
    cancel(id) {
      tasks.delete(id);
    },
    onTick: (value) => ticks.push(value),
    onPlayerTimeout: (id) => expired.push(id),
    onCpuTurn: (id) => cpu.push(id),
    onUpperTimeout: (id) => upper.push(id),
  });
  function advance(amount) {
    const target = time + amount;
    let count = 0;
    while (true) {
      const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      tasks.delete(next[0]);
      time = next[1].at;
      next[1].callback();
      assert.ok(++count < 10000);
    }
    time = target;
  }
  return {
    clock,
    ticks,
    expired,
    cpu,
    upper,
    callbacks,
    tasks,
    advance,
    jump: (amount) => {
      time += amount;
    },
  };
}
const turn = (id, actor = 'player') => ({ phase: 'bet', betting: { turnId: id, turn: actor } });

test('each new player turn gets 30 seconds, while same-turn renders do not extend it', () => {
  const f = fixture();
  f.clock.sync(turn(1));
  assert.equal(f.ticks.at(-1), 30);
  f.advance(10000);
  f.clock.sync(turn(1));
  assert.equal(f.ticks.at(-1), 20);
  f.advance(19999);
  assert.deepEqual(f.expired, []);
  f.advance(1);
  assert.deepEqual(f.expired, [1]);
  f.clock.sync(turn(1));
  f.advance(60000);
  assert.deepEqual(f.expired, [1]);
  f.clock.sync(turn(2));
  assert.equal(f.ticks.at(-1), 30);
  f.advance(30000);
  assert.deepEqual(f.expired, [1, 2]);
});

test('CPU thinking uses its own delay and does not consume the following player turn', () => {
  const f = fixture();
  f.clock.sync(turn(8, 'ai'));
  assert.equal(f.ticks.at(-1), null);
  f.advance(599);
  assert.deepEqual(f.cpu, []);
  f.advance(1);
  assert.deepEqual(f.cpu, [8]);
  f.clock.sync(turn(9));
  assert.equal(f.ticks.at(-1), 30);
  f.advance(1000);
  assert.equal(f.ticks.at(-1), 29);
  assert.deepEqual(f.expired, []);
});

test('suspending and restoring keeps the original deadline and expires once', () => {
  const f = fixture();
  f.clock.sync(turn(4));
  f.advance(5000);
  f.clock.suspend();
  f.jump(40000);
  assert.deepEqual(f.expired, []);
  f.clock.sync(turn(4));
  assert.deepEqual(f.expired, [4]);
  f.clock.sync(turn(4));
  f.advance(1000);
  assert.deepEqual(f.expired, [4]);
  const cpu = fixture();
  cpu.clock.sync(turn(5, 'ai'));
  cpu.clock.suspend();
  cpu.jump(1000);
  cpu.clock.sync(turn(5, 'ai'));
  assert.deepEqual(cpu.cpu, [5]);
});

test('cancelled callbacks cannot change a reset game, new turn or resumed clock', () => {
  const f = fixture();
  f.clock.sync(turn(1));
  const old = f.callbacks[0];
  f.clock.clear();
  f.clock.sync(turn(2));
  old();
  assert.deepEqual(f.expired, []);
  assert.equal(f.tasks.size, 1);
  const beforeSuspend = f.callbacks.at(-1);
  f.clock.suspend();
  f.jump(1000);
  f.clock.sync(turn(2));
  beforeSuspend();
  assert.equal(f.tasks.size, 1);
  f.clock.sync({ phase: 'showdown' });
  f.advance(90000);
  for (const callback of f.callbacks) callback();
  assert.deepEqual(f.expired, []);
  assert.deepEqual(f.cpu, []);
});

test('expiration may synchronously switch to the next actor without scheduling the old turn', () => {
  let time = 0;
  let callback;
  let scheduled = 0;
  const clock = createTurnClock({
    now: () => time,
    schedule: (fn) => {
      callback = fn;
      scheduled++;
      return scheduled;
    },
    cancel: () => {},
    onPlayerTimeout: () => clock.sync(turn(2, 'ai')),
    onCpuTurn: () => {},
  });
  clock.sync(turn(1));
  time = 30000;
  callback();
  assert.equal(scheduled, 2);
  time = 30600;
  callback();
  assert.equal(scheduled, 2);
});

test('construction uses its remaining engine deadline and does not collide with a betting ID', () => {
  const f = fixture();
  const upper = {
    phase: 'upper',
    upper: { attemptId: 1, deadlineMs: 60000 },
    respiration: { elapsedMs: 20000 },
  };
  f.clock.sync(upper);
  assert.equal(f.ticks.at(-1), 40);
  f.advance(10000);
  f.clock.sync(upper);
  assert.equal(f.ticks.at(-1), 30);
  f.advance(30000);
  assert.deepEqual(f.upper, [1]);
  f.clock.sync(turn(1));
  assert.equal(f.ticks.at(-1), 30);
  f.advance(30000);
  assert.deepEqual(f.expired, [1]);
});
