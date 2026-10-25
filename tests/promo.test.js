import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFacts } from '../scripts/promo/prepare.js';
import { SCENES, CAPTIONS, DURATION, sceneAt, toSrt } from '../promo/timeline.js';
import { settleBets } from '../game/rules.js';
import { judgeHand } from '../game/cards.js';
import { startServer } from '../scripts/promo/server.js';
test('promotional example is legal and never equates overlapping ranks with identical cards', () => {
  const facts = makeFacts();
  assert.equal(
    facts.lower.reduce((sum, c) => sum + c.value, 0),
    24,
  );
  assert.equal(
    facts.upper.reduce((sum, c) => sum + c.value, 0),
    24,
  );
  assert.equal(facts.overlap.length, 3);
  assert.equal(judgeHand(facts.lower, 24, facts.upper).valid, false);
  assert.equal(facts.settlement.aiAir, 12);
  assert.equal(
    settleBets({
      playerAir: 18,
      aiAir: 2,
      playerBet: 6,
      aiBet: 6,
      winner: 'player',
      calamity: true,
    }).burned,
    2,
  );
  assert.deepEqual(facts.opening, { total: 25, reserve: 24, opened: 1 });
});
test('all frames and subtitle cues fit the 72-second continuous timeline; cuts rebase subtitles', () => {
  let end = 0;
  for (const s of SCENES) {
    assert.equal(s.start, end);
    assert.ok(s.end > s.start);
    end = s.end;
  }
  assert.equal(end, DURATION);
  let last = 0;
  for (const [a, b] of CAPTIONS) {
    assert.equal(a, last);
    assert.ok(b > a);
    last = b;
  }
  assert.equal(last, DURATION);
  assert.equal(sceneAt(34.999).id, 'bet');
  assert.equal(sceneAt(35).id, 'calamity');
  const sub = toSrt(36, 40);
  assert.match(sub, /00:00:00,000 --> 00:00:02,500/);
  assert.match(sub, /00:00:02,500 --> 00:00:04,000/);
  assert.ok(!sub.includes('押上未来'));
});
test('production preview serves selected resources and rejects encoded traversal', async () => {
  const server = await startServer();
  try {
    assert.equal((await fetch(server.url + '/promo/')).status, 200);
    assert.equal((await fetch(server.url + '/game/rules.js')).status, 200);
    assert.equal((await fetch(server.url + '/promo/..%2fpackage.json')).status, 404);
    assert.equal((await fetch(server.url + '/.git/config')).status, 404);
    assert.equal(
      (await fetch(server.url + '/promo/node_modules/playwright/package.json')).status,
      404,
    );
  } finally {
    await server.close();
  }
});
