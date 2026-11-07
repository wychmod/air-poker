import { evaluateContract, isContractId } from '../game/contracts.js';
import { DIFFICULTY_IDS, normalizeDifficulty, isDifficultyId } from '../game/difficulty.js';
const pick = (lang, zh, en) => (lang === 'en' ? en : zh);
const DEFAULT_OPPONENT = 'analyst';
const isOpponentKey = (value) => Object.hasOwn(OPPONENT_COPY, value);

export const DIFFICULTY_COPY = Object.freeze({
  beginner: Object.freeze({
    index: '01',
    zh: Object.freeze({
      name: '新手',
      latin: 'BEGINNER',
      trait: '当前牌力 · 标准对局',
      read: '侧重当前牌力，下注压力较低；没有额外目标。',
    }),
    en: Object.freeze({
      name: 'Beginner',
      latin: 'BEGINNER',
      trait: 'Current hand · Open match',
      read: 'Focuses on the current hand with lighter pressure and no extra goal.',
    }),
  }),
  medium: Object.freeze({
    index: '02',
    zh: Object.freeze({
      name: '中等',
      latin: 'MEDIUM',
      trait: '规划后手 · 逆风翻盘',
      read: '兼顾后续构牌、费用与灾厄；目标是在曾经落后后夺冠。',
    }),
    en: Object.freeze({
      name: 'Medium',
      latin: 'MEDIUM',
      trait: 'Plan ahead · Comeback goal',
      read: 'Balances future hands, price and calamity; win after trailing at a round end.',
    }),
  }),
  hard: Object.freeze({
    index: '03',
    zh: Object.freeze({
      name: '困难',
      latin: 'HARD',
      trait: '适应下注 · 全胜压制',
      read: '结合本局公开行动调整判断；目标是赢下每个已结算回合并最终夺冠。',
    }),
    en: Object.freeze({
      name: 'Hard',
      latin: 'HARD',
      trait: 'Adapt to bets · Clean sweep goal',
      read: 'Adapts to your public actions; win every settled round and the match.',
    }),
  }),
});
export const DIFFICULTY_KEYS = DIFFICULTY_IDS;
const DIFFICULTY_CONTRACT = Object.freeze({
  beginner: 'none',
  medium: 'comeback',
  hard: 'perfect',
});

export const OPPONENT_COPY = Object.freeze({
  analyst: Object.freeze({
    index: '01',
    zh: Object.freeze({
      name: '精密',
      latin: 'THE ANALYST',
      trait: '价值下注 · 少冒险',
      read: '按牌力与赔率行动。',
    }),
    en: Object.freeze({
      name: 'The Analyst',
      latin: 'THE ANALYST',
      trait: 'Value first. Few risks.',
      read: 'Acts on hand strength and price.',
    }),
  }),
  abyss: Object.freeze({
    index: '02',
    zh: Object.freeze({
      name: '深渊',
      latin: 'THE ABYSS',
      trait: '持续施压 · 少弃牌',
      read: '被加注后仍会继续反击。',
    }),
    en: Object.freeze({
      name: 'The Abyss',
      latin: 'THE ABYSS',
      trait: 'Relentless pressure. Fewer folds.',
      read: 'Keeps raising when you raise at it.',
    }),
  }),
  mirror: Object.freeze({
    index: '03',
    zh: Object.freeze({
      name: '镜像',
      latin: 'THE MIRROR',
      trait: '回应下注 · 顺势反击',
      read: '你越激进，它越倾向反击。',
    }),
    en: Object.freeze({
      name: 'The Mirror',
      latin: 'THE MIRROR',
      trait: 'Answers your public bets.',
      read: 'The more you press, the more it answers.',
    }),
  }),
});

export const CONTRACT_COPY = Object.freeze({
  none: Object.freeze({
    zh: Object.freeze({ name: '无契约', latin: 'OPEN TABLE', detail: '标准对局，没有额外约束。' }),
    en: Object.freeze({
      name: 'No contract',
      latin: 'OPEN TABLE',
      detail: 'A standard match with no extra condition.',
    }),
  }),
  'no-fold': Object.freeze({
    zh: Object.freeze({ name: '不弃之誓', latin: 'NEVER FOLD', detail: '全程不弃牌并最终夺冠。' }),
    en: Object.freeze({
      name: 'Never-fold vow',
      latin: 'NEVER FOLD',
      detail: 'Win without folding once.',
    }),
  }),
  comeback: Object.freeze({
    zh: Object.freeze({
      name: '逆风翻盘',
      latin: 'COMEBACK',
      detail: '曾在回合结束时落后，最终夺冠。',
    }),
    en: Object.freeze({
      name: 'Comeback',
      latin: 'COMEBACK',
      detail: 'Win after trailing at the end of a round.',
    }),
  }),
  perfect: Object.freeze({
    zh: Object.freeze({
      name: '全胜压制',
      latin: 'CLEAN SWEEP',
      detail: '赢下每个已结算回合，并最终夺冠。',
    }),
    en: Object.freeze({
      name: 'Clean sweep',
      latin: 'CLEAN SWEEP',
      detail: 'Win every settled round and the match.',
    }),
  }),
});

export const OPPONENT_KEYS = Object.freeze(Object.keys(OPPONENT_COPY));
export const CONTRACT_KEYS = Object.freeze(Object.keys(CONTRACT_COPY));

export function opponentCopy(id = DEFAULT_OPPONENT, lang = 'zh') {
  if (isDifficultyId(id)) {
    const meta = DIFFICULTY_COPY[id];
    return { id, index: meta.index, ...(lang === 'en' ? meta.en : meta.zh) };
  }
  const key = isOpponentKey(id) ? id : DEFAULT_OPPONENT;
  const meta = OPPONENT_COPY[key];
  return { id: key, index: meta.index, ...(lang === 'en' ? meta.en : meta.zh) };
}

export function contractCopy(id = 'none', lang = 'zh') {
  const key = isContractId(id) ? id : 'none';
  const meta = CONTRACT_COPY[key];
  return { id: key, ...(lang === 'en' ? meta.en : meta.zh) };
}

export function contractForDifficulty(id) {
  return DIFFICULTY_CONTRACT[normalizeDifficulty(id)];
}

export function contractResultFor(record) {
  return evaluateContract(record);
}

export function contractResultCopy(result, lang = 'zh', kind = 'persona') {
  if (!result) return null;
  const detail = contractCopy(result.id, lang);
  if (result.complete)
    return {
      ...detail,
      complete: true,
      status: pick(lang, '达成', 'COMPLETE'),
      note:
        kind === 'difficulty'
          ? pick(lang, '本档目标达成 · 已记录', 'Level goal complete · recorded')
          : pick(lang, '契约完成 · 已盖章', 'Contract complete · sealed'),
    };
  const stats = result.stats ?? {};
  let note;
  if (result.id === 'no-fold')
    note = pick(
      lang,
      `弃牌 ${stats.folds ?? 0} 次`,
      `${stats.folds ?? 0} fold${stats.folds === 1 ? '' : 's'}`,
    );
  else if (result.id === 'comeback')
    note = pick(
      lang,
      `最大落后 ${stats.largestDeficit ?? 0} AIR`,
      `Largest deficit ${stats.largestDeficit ?? 0} AIR`,
    );
  else
    note = pick(
      lang,
      `赢下 ${stats.roundsWon ?? 0} / ${stats.settledRounds ?? 0} 轮`,
      `Won ${stats.roundsWon ?? 0} / ${stats.settledRounds ?? 0} rounds`,
    );
  return { ...detail, complete: false, status: pick(lang, '未达成', 'MISSED'), note };
}

export function modeSummary(record, lang = 'zh') {
  const opponent = opponentCopy(record?.mode?.opponent, lang);
  const contract = contractCopy(record?.mode?.contract, lang);
  return {
    opponent,
    contract,
    kind: isDifficultyId(record?.mode?.opponent) ? 'difficulty' : 'persona',
  };
}

export function matchModeSummary(view) {
  const mode =
    view.matchMode ??
    (view.setup?.difficulty
      ? {
          opponent: view.setup.difficulty,
          contract: contractForDifficulty(view.setup.difficulty),
        }
      : view.setup);
  return modeSummary({ mode }, view.lang);
}
