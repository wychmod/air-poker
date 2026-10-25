import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { card, judgeHand } from '../../game/cards.js';
import { rankHand, compareHands, settleBets } from '../../game/rules.js';
import { startBreathing, CANISTER_MS, HYPOXIA_MS } from '../../game/breathing.js';
import { createHash } from 'node:crypto';
import { ROOT, OUT } from './common.js';
export function makeFacts() {
  const lower = [card(4, 0), card(4, 1), card(4, 2), card(5, 3), card(7, 0)];
  const upper = [card(4, 0), card(4, 1), card(4, 2), card(4, 3), card(8, 0)];
  assert.ok(judgeHand(lower, 24).valid && judgeHand(upper, 24).valid);
  assert.equal(rankHand(lower).key, 'threeKind');
  assert.equal(rankHand(upper).key, 'fourKind');
  assert.ok(compareHands(upper, lower) > 0);
  const overlap = lower.filter((c) => upper.some((d) => d.id === c.id)).map((c) => c.id);
  assert.equal(overlap.length, 3);
  const settlement = settleBets({
    playerAir: 18,
    aiAir: 18,
    playerBet: 6,
    aiBet: 6,
    winner: 'player',
    calamity: true,
  });
  assert.deepEqual(settlement, { playerAir: 30, aiAir: 12, burned: 6 });
  assert.equal(settlement.playerAir + settlement.aiAir + settlement.burned + 2, 50);
  const opening = startBreathing(25, 25);
  assert.equal(opening.playerAir, 24);
  return {
    target: 24,
    lower,
    upper,
    overlap,
    settlement,
    opening: { total: 25, reserve: 24, opened: 1 },
    canisterSeconds: CANISTER_MS / 1000,
    graceSeconds: HYPOXIA_MS / 1000,
    source: 'Current game pure functions; illustrative scenario, not a recorded match',
  };
}
export async function prepare() {
  await mkdir(OUT, { recursive: true });
  const facts = makeFacts();
  await writeFile(resolve(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
  const inputs = [
    [
      'assets/generated/air-poker-v1/usogui-page-assets/manga-introduction-background.png',
      'Existing generated no-UI background; project asset',
    ],
    [
      'assets/generated/air-poker-v2/defeat.png',
      'Existing project asset copied from assets/reference/usogui-air-poker/去文字背景3.png; manga credit retained',
    ],
  ];
  const sources = await Promise.all(
    inputs.map(async ([path, credit]) => ({
      path,
      credit,
      sha256: createHash('sha256')
        .update(await readFile(resolve(ROOT, path)))
        .digest('hex'),
    })),
  );
  await writeFile(
    resolve(OUT, 'asset-sources.json'),
    JSON.stringify(
      {
        sources,
        audio: 'Original deterministic procedural score, no sampled song',
        screenshots: 'See capture-manifest.json',
        credit: '迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇',
      },
      null,
      2,
    ),
  );
  return facts;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepare();
