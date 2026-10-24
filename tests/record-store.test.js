import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { createRecordStore, RECORD_STORAGE_KEY } from '../browser/record-store.js';

function completed() {
  const game = createGame({ random: () => 0.5 });
  game.dispatch({ type: 'elapse', sessionId: game.getState().sessionId, elapsedMs: 999999999 });
  return game.getRecord();
}
test('only completed records are saved; reading and restarting cannot mutate the stored record', () => {
  const values = new Map();
  let writes = 0;
  const store = createRecordStore({
    storage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes++;
        values.set(key, value);
      },
    }),
  });
  assert.equal(store.load().status, 'empty');
  assert.equal(store.save(createGame().getRecord()), false);
  assert.equal(writes, 0);
  const record = completed();
  assert.equal(store.save(record), true);
  assert.equal(writes, 1);
  const loaded = store.load();
  assert.equal(loaded.status, 'saved');
  assert.deepEqual(loaded.record, record);
  loaded.record.accounts.player = 99;
  assert.deepEqual(store.load().record, record);
  assert.ok(values.has(RECORD_STORAGE_KEY));
});
test('storage denial, quota errors, malformed JSON and unsupported versions degrade without throwing', () => {
  const denial = createRecordStore({
    storage: () => {
      throw new Error('denied');
    },
  });
  assert.equal(denial.load().status, 'unavailable');
  assert.equal(denial.save(completed()), false);
  const quota = createRecordStore({
    storage: () => ({
      setItem() {
        throw new Error('quota');
      },
    }),
  });
  assert.equal(quota.save(completed()), false);
  for (const raw of ['{bad', '{}', JSON.stringify({ ...completed(), schemaVersion: 99 })]) {
    const store = createRecordStore({ storage: () => ({ getItem: () => raw }) });
    assert.equal(store.load().record, null);
  }
});
