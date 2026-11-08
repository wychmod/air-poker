import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { shareSummary, shareCopy, shareImageSvg, shareCoverSvg } from '../ui/share.js';
import { contractCopy, contractResultCopy, opponentCopy } from '../ui/modes.js';
import { completedMatch } from './fixtures/completed-match.js';

test('sharing rejects unfinished, damaged and unsupported records', () => {
  assert.equal(shareSummary(null), null);
  assert.equal(shareSummary(createGame({ random: () => 0.5 }).getRecord()), null);
  const record = completedMatch('ai');
  assert.equal(shareSummary({ ...record, schemaVersion: 99 }), null);
  record.ledger[0].amount++;
  assert.equal(shareSummary(record), null);
});

test('share cards use validated completed facts, reconstruct trends, and exclude private game detail', () => {
  for (const outcome of ['player', 'ai', 'tie']) {
    const record = completedMatch(outcome);
    const before = structuredClone(record);
    // Derived cached display totals are not the authority for the image.
    record.totals.player.burned = 9999;
    const model = shareSummary(record);
    assert.equal(model.winner, outcome);
    assert.equal(model.burned, record.accounts.burned);
    assert.equal(model.rounds, record.result.completedRounds);
    assert.deepEqual(model.points[0], { round: 0, player: 24, ai: 24 });
    for (const point of model.points.slice(1)) {
      assert.deepEqual(
        { player: point.player, ai: point.ai },
        record.rounds[point.round - 1].airAfter,
      );
    }
    assert.deepEqual(
      Object.keys(model).sort(),
      [
        'burned',
        'calamities',
        'comic',
        'elapsedMs',
        'finalAir',
        'points',
        'rounds',
        'winner',
      ].sort(),
    );
    const finalRound = record.rounds.filter((round) => round.status === 'settled').at(-1);
    assert.deepEqual(
      model.comic.final.hand,
      (finalRound?.attempts.at(-1)?.player.hand ?? []).map(({ rank, suit }) => ({ rank, suit })),
    );
    assert.deepEqual(model.comic.final.finalAir, record.result.finalAir);
    assert.equal(model.comic.final.winner, outcome);
    assert.equal(model.comic.final.settlement, finalRound?.settlement?.winner ?? null);
    assert.equal(model.comic.wager, null);
    assert.equal(model.comic.turn?.action ?? null, outcome === 'ai' ? 'fold' : null);
    for (const lang of ['zh', 'en']) {
      const svg = shareImageSvg(model, lang);
      assert.match(svg, /width="1080" height="1440"/);
      for (const title of ['THE BIGGEST WAGER', 'THE OTHER DECISION', 'THE LAST BREATH'])
        assert.ok(svg.includes(title));
      assert.ok(svg.includes(lang === 'zh' ? '噬谎者' : 'USOGUI'));
      assert.ok(svg.includes(lang === 'zh' ? '未开空气储备' : 'UNOPENED AIR'));
      assert.ok(!svg.includes(record.matchId));
      assert.ok(!svg.includes('9999'));
      assert.ok(shareCopy(model, lang).url.startsWith('https://wychmod.github.io/air-poker/'));
    }
    record.totals.player.burned = before.totals.player.burned;
    assert.deepEqual(record, before);
  }
});

test('share comic uses the largest public bet and the next decisive action', () => {
  const record = structuredClone(completedMatch('player'));
  const wager = record.rounds[1].actions.find(
    (action) => action.actor === 'player' && action.action === 'check',
  );
  Object.assign(wager, { action: 'raise', paid: 7, raised: 6, pot: wager.pot + 7 });
  const turn = record.rounds[3].actions.find(
    (action) => action.actor === 'player' && action.action === 'check',
  );
  Object.assign(turn, {
    action: 'call',
    paid: 4,
    called: 4,
    toCall: 4,
    pot: turn.pot + 4,
  });
  record.rounds[0].targets.ai.value = 987654;
  record.rounds[0].attempts[0].ai.hand = record.rounds[0].attempts[0].ai.hand.map((card) => ({
    ...card,
    rank: 'ZZ',
  }));

  const model = shareSummary(record);
  assert.ok(model);
  assert.deepEqual(model.comic.wager, {
    round: 2,
    action: 'raise',
    paid: 7,
    raised: 6,
    target: record.rounds[1].targets.player.value,
    pot: wager.pot,
  });
  assert.deepEqual(model.comic.turn, { round: 4, action: 'call', paid: 4, toCall: 4 });

  const svg = shareImageSvg(model, 'zh');
  assert.ok(svg.includes('R02 · 加注'));
  assert.ok(svg.includes('R04 · 决定'));
  assert.ok(svg.includes('当时底池 '));
  assert.ok(!svg.includes('987654'));
  assert.ok(!svg.includes('ZZ'));
});

test('share card names a failed final hand instead of claiming it was never recorded', () => {
  const record = structuredClone(completedMatch('player'));
  const finalRound = record.rounds.filter((round) => round.status === 'settled').at(-1);
  const attempt = finalRound.attempts.at(-1);
  attempt.player = { valid: false, reason: 'wrong-sum', hand: null };

  const model = shareSummary(record);
  assert.ok(model);
  assert.equal(model.comic.final.failed, true);
  assert.equal(model.comic.final.round, finalRound.number);
  assert.equal(model.comic.final.hand.length, 0);
  for (const lang of ['zh', 'en']) {
    const svg = shareImageSvg(model, lang);
    assert.ok(svg.includes(lang === 'zh' ? '最终成手失败' : 'FINAL HAND FAILED'));
    assert.ok(!svg.includes(lang === 'zh' ? '未记录最终成手' : 'NO FINAL HAND RECORDED'));
  }
});

test('share card invitation is an open challenge in both languages', () => {
  const model = shareSummary(completedMatch('player'));
  for (const lang of ['zh', 'en']) {
    const svg = shareImageSvg(model, lang);
    assert.ok(svg.includes(lang === 'zh' ? '欢迎你来挑战。' : 'COME TAKE THE CHALLENGE.'));
    assert.ok(!svg.includes(lang === 'zh' ? '敢坐下' : 'YOUR SEAT IS WAITING'));
  }
});

test('share card can carry the recorded opponent and contract result', () => {
  const model = shareSummary(completedMatch('player'));
  const meta = {
    opponent: opponentCopy('abyss', 'zh'),
    contract: contractCopy('no-fold', 'zh'),
    contractResult: contractResultCopy(
      { id: 'no-fold', complete: false, stats: { folds: 2 } },
      'zh',
    ),
  };
  const zh = shareImageSvg(model, 'zh', meta);
  assert.ok(zh.includes('对手 · 深渊 / THE ABYSS'));
  assert.ok(zh.includes('契约 · 不弃之誓 / NEVER FOLD · 未达成'));

  const enMeta = {
    opponent: opponentCopy('abyss', 'en'),
    contract: contractCopy('no-fold', 'en'),
    contractResult: contractResultCopy(
      { id: 'no-fold', complete: false, stats: { folds: 2 } },
      'en',
    ),
  };
  const en = shareImageSvg(model, 'en', enMeta);
  assert.ok(en.includes('OPPONENT · The Abyss / THE ABYSS'));
  assert.ok(en.includes('CONTRACT · Never-fold vow / NEVER FOLD · MISSED'));
});

test('share card labels new difficulties separately while keeping legacy personas intact', () => {
  const model = shareSummary(completedMatch('player'));
  const hard = opponentCopy('hard', 'en');
  const hardSvg = shareImageSvg(model, 'en', {
    kind: 'difficulty',
    opponent: hard,
    contract: contractCopy('perfect', 'en'),
    contractResult: contractResultCopy({ id: 'perfect', complete: true }, 'en', 'difficulty'),
  });
  assert.ok(hardSvg.includes('DIFFICULTY · Hard / HARD'));
  assert.ok(hardSvg.includes('LEVEL GOAL · Clean sweep / CLEAN SWEEP · COMPLETE'));

  const legacy = opponentCopy('mirror', 'en');
  const legacySvg = shareImageSvg(model, 'en', { kind: 'persona', opponent: legacy });
  assert.ok(legacySvg.includes('OPPONENT · The Mirror / THE MIRROR'));
});

test('share cover is a standalone bilingual SVG without remote resources', () => {
  for (const lang of ['zh', 'en']) {
    const svg = shareCoverSvg(lang);
    assert.match(svg, /width="1200" height="630"/);
    assert.ok(svg.includes(lang === 'zh' ? '空气扑克' : 'AIR POKER'));
    assert.doesNotMatch(svg, /<image|<script|foreignObject/);
  }
});
