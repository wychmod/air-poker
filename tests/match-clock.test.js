import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchClock } from '../browser/match-clock.js';

test('absolute breathing time survives renders and background, and old sessions cannot pulse', () => {
  let time = 100;
  let sequence = 0;
  const tasks = new Map();
  const all = [];
  const pulses = [];
  const clock = createMatchClock({
    now: () => time,
    schedule: (fn) => {
      tasks.set(++sequence, fn);
      all.push(fn);
      return sequence;
    },
    cancel: (id) => tasks.delete(id),
    onPulse: (action) => pulses.push(action),
  });
  const snapshot = { sessionId: 1, phase: 'lower', respiration: { elapsedMs: 0 } };
  clock.sync(snapshot);
  time += 10000;
  clock.flush();
  assert.equal(pulses.at(-1).elapsedMs, 10000);
  clock.sync({ ...snapshot, phase: 'bet' });
  time += 5000;
  clock.flush();
  assert.equal(pulses.at(-1).elapsedMs, 15000);
  clock.suspend();
  const old = all.at(-1);
  time += 400000;
  old();
  assert.equal(pulses.at(-1).elapsedMs, 15000);
  clock.sync(snapshot);
  assert.equal(pulses.at(-1).elapsedMs, 415000);
  clock.clear();
  clock.sync({ ...snapshot, sessionId: 2 });
  const count = pulses.length;
  old();
  assert.equal(pulses.length, count);
  time += 1000;
  clock.flush();
  assert.deepEqual(pulses.at(-1), { type: 'elapse', sessionId: 2, elapsedMs: 1000 });
  clock.sync({ ...snapshot, phase: 'summary' });
  for (const callback of all) callback();
  assert.equal(tasks.size, 0);
});

test('a pulse reaching terminal state cancels scheduling even when restoring a background clock', () => {
  let callback;
  let time = 0;
  let pending = 0;
  const clock = createMatchClock({
    now: () => time,
    schedule: (fn) => {
      callback = fn;
      pending++;
      return 1;
    },
    cancel: () => {
      pending--;
    },
    onPulse: () => clock.sync({ phase: 'summary' }),
  });
  clock.sync({ phase: 'endurance', sessionId: 9, respiration: { elapsedMs: 0 } });
  clock.suspend();
  time = 1000000;
  clock.sync({ phase: 'endurance', sessionId: 9, respiration: { elapsedMs: 0 } });
  callback();
  assert.equal(pending, 0);
});
