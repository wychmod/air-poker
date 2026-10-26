import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.js';
import { shareSummary, shareCopy, shareImageSvg, shareCoverSvg } from '../ui/share.js';
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
      ['burned', 'calamities', 'elapsedMs', 'finalAir', 'points', 'rounds', 'winner'].sort(),
    );
    for (const lang of ['zh', 'en']) {
      const svg = shareImageSvg(model, lang);
      assert.match(svg, /width="1080" height="1440"/);
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

test('share cover is a standalone bilingual SVG without remote resources', () => {
  for (const lang of ['zh', 'en']) {
    const svg = shareCoverSvg(lang);
    assert.match(svg, /width="1200" height="630"/);
    assert.ok(svg.includes(lang === 'zh' ? '空气扑克' : 'AIR POKER'));
    assert.doesNotMatch(svg, /<image|<script|foreignObject/);
  }
});
