import { lessonCards } from './pages.js';
import { translate } from '../i18n.js';
import { createDeck } from '../game/cards.js';
import { editHandDraft, getDraftStatus } from './hand-builder.js';
import { practiceEditorMarkup } from './battle.js';

const copy = (lang, zh, en) => (lang === 'en' ? en : zh);
const hands = [
  [
    ['4', '♠'],
    ['4', '♥'],
    ['4', '♦'],
    ['5', '♣'],
    ['7', '♠'],
  ],
  [
    ['2', '♠'],
    ['3', '♥'],
    ['4', '♦'],
    ['7', '♣'],
    ['8', '♠'],
  ],
];

const practiceDeck = createDeck();
function practiceState(tutorial) {
  return {
    phase: 'upper',
    sessionId: 0,
    upper: { attemptId: 1 },
    playerTarget: tutorial.target ?? 24,
    discard: [practiceDeck.find((card) => card.id === '7-1')],
    candidates: hands.map((hand) => ({
      hand: hand.map(([rank, suit]) =>
        practiceDeck.find((card) => card.rank === rank && card.suit === suit),
      ),
    })),
  };
}

// A guided example has no game reference, clock, persistence or dispatch capability.
export function createTutorial() {
  return {
    step: 0,
    target: null,
    complete: false,
    error: false,
    increment: 2,
    paid: 0,
    scenario: null,
    seen: [],
    breath: 0,
    edited: false,
    draft: { sessionId: 0, attemptId: 1, cardIds: [], suit: 'all', candidateIndex: null },
  };
}

export function tutorialAction(current, action, data = {}) {
  const state = { ...current, seen: [...current.seen] };
  if (action === 'tutorial-restart') return createTutorial();
  if (action === 'tutorial-reset') return { ...createTutorial(), step: current.step };
  if (action === 'tutorial-next' && state.complete)
    return { ...createTutorial(), step: Math.min(4, state.step + 1) };
  if (state.complete && action !== 'tutorial-scenario') return state;
  if (state.step === 0) {
    if (action === 'tutorial-target') {
      state.target = Number(data.value);
      state.error = state.target !== 24;
    }
    if (state.target === 24) {
      const actual = practiceState(state);
      if (action === 'tutorial-select' && ['0', '1'].includes(data.index)) {
        state.draft = editHandDraft(actual, state.draft, 'select-candidate', {
          ...data,
          attempt: '1',
        });
        state.edited = false;
      }
      const edit = action.slice('tutorial-'.length);
      if (['toggle-hand-card', 'filter-hand-suit', 'clear-hand'].includes(edit)) {
        const next = editHandDraft(actual, state.draft, edit, data);
        if (next !== state.draft && edit === 'toggle-hand-card') state.edited = true;
        state.draft = next;
      }
      if (action === 'tutorial-lock' && state.edited && getDraftStatus(actual, state.draft).valid)
        state.complete = true;
    }
  }
  if (state.step === 1) {
    if (action === 'tutorial-increment' && [1, 2, 4].includes(Number(data.value)))
      state.increment = Number(data.value);
    if (action === 'tutorial-call' || action === 'tutorial-raise') {
      state.paid = action === 'tutorial-call' ? 2 : 2 + state.increment;
      state.complete = true;
    }
  }
  if (
    state.step === 2 &&
    action === 'tutorial-scenario' &&
    ['failure', 'fold', 'calamity'].includes(data.scenario)
  ) {
    state.scenario = data.scenario;
    if (!state.seen.includes(data.scenario)) state.seen.push(data.scenario);
    state.complete = state.seen.length === 3;
  }
  if (state.step === 3 && action === 'tutorial-breathe') {
    state.breath = Math.min(3, state.breath + 1);
    state.complete = state.breath === 3;
  }
  return state;
}

function handExercise(state, c, _opponent, lang) {
  const actual = practiceState(state);
  const status = getDraftStatus(actual, state.draft);
  const examples =
    '<div class="lesson-candidates">' +
    hands
      .map(
        (hand, index) =>
          '<button class="lesson-candidate' +
          (state.target === 24 && state.draft.candidateIndex === index ? ' is-selected' : '') +
          '" data-action="tutorial-select" data-index="' +
          index +
          '" aria-pressed="' +
          (state.target === 24 && state.draft.candidateIndex === index) +
          '" ' +
          (state.target !== 24 || state.complete ? 'disabled' : '') +
          '>' +
          lessonCards(hand) +
          '<span><b>' +
          (index === 0
            ? c('三条示例', 'Three-of-a-kind example')
            : c('高牌示例', 'High-card example')) +
          '</b><small>' +
          c('填入后，试着换一张', 'Fill, then edit a card') +
          '</small></span></button>',
      )
      .join('') +
    '</div>';
  const intro =
    '<div class="tutorial-targets" aria-label="' +
    c('选择练习目标', 'Choose the practice target') +
    '">' +
    [24, 30]
      .map(
        (value) =>
          '<button class="lesson-number" data-action="tutorial-target" data-value="' +
          value +
          '" aria-pressed="' +
          (state.target === value) +
          '" ' +
          (state.complete ? 'disabled' : '') +
          '><small>' +
          c('目标', 'TARGET') +
          '</small><b>' +
          value +
          '</b></button>',
      )
      .join('') +
    '</div><p class="lesson-hint">' +
    (state.error
      ? c(
          '本课练习目标 24；选回 24 后，用五张未用牌完成。',
          'This exercise uses 24. Choose 24 and build five unused cards.',
        )
      : c(
          '选择 24，亲手添牌、移除或换牌。可先填入示例；7♥ 在练习中已用。',
          'Choose 24, then add, remove or replace cards. You can fill an example first; 7♥ is already used in this exercise.',
        )) +
    '</p>';
  if (state.complete)
    return (
      intro +
      '<div class="lesson-feedback">✓ ' +
      c(
        '你已亲手编辑并锁定合法成手：五张未用实体牌，点数和 24。',
        'You edited and locked a valid hand: five unused cards totaling 24.',
      ) +
      '</div>'
    );
  return (
    intro +
    examples +
    (state.target === 24
      ? '<p class="lesson-hint">' +
        c(
          '试着用 4♠、4♥、4♦、5♣、8♠ 组出 25，再把 8♠ 换成 7♠，观察提示如何变化。',
          'Try 4♠, 4♥, 4♦, 5♣, 8♠ for 25. Replace 8♠ with 7♠ and watch the sum become 24.',
        ) +
        '</p>' +
        practiceEditorMarkup(actual, state.draft, lang).replaceAll(
          'data-action="',
          'data-action="tutorial-',
        ) +
        '<div class="tutorial-practice-actions"><span>' +
        c('点数和 / 目标', 'SUM / TARGET') +
        ' <b>' +
        status.sum +
        ' / 24</b></span><button class="button primary" data-action="tutorial-lock" ' +
        (!status.valid || !state.edited ? 'disabled' : '') +
        '>' +
        c('完成组牌练习', 'Lock practice hand') +
        ' →</button></div>'
      : '')
  );
}

function betExercise(state, c) {
  const pay = 2 + state.increment;
  return `<div class="lesson-accounts"><div><span>${c('你的未开储备', 'YOUR RESERVE')}</span><b>${22 - state.paid}<small> AIR</small></b></div><span class="lesson-payment ${state.complete ? 'is-paid' : ''}">${state.complete ? `−${state.paid} →` : '→'}</span><div><span>${c('底池', 'POT')}</span><b>${6 + state.paid}<small> AIR</small></b></div></div>
    <p class="lesson-hint">${c('本轮你已投 2，对手已投 4。需要跟齐 2；跟齐后底池 8，最多再加 4。', 'You invested 2 and your opponent 4. Call 2; the pot after calling is 8, so the maximum raise increment is 4.')}</p>
    <div class="lesson-raise-options"><span>${c('再加金额', 'Raise increment')}</span>${[1, 2, 4].map((n) => `<button class="button secondary ${state.increment === n ? 'is-selected' : ''}" data-action="tutorial-increment" data-value="${n}" aria-pressed="${state.increment === n}" ${state.complete ? 'disabled' : ''}>${n}</button>`).join('')}</div>
    <p class="lesson-equation">${c('应跟', 'Call')} <b>2</b> + ${c('再加', 'Raise')} <b>${state.increment}</b> = ${c('本次支付', 'Pay')} <strong>${pay} AIR</strong></p><p>${c('若加注，支付后未开储备', 'Reserve after this raise')}: <b>${22 - pay} AIR</b></p>
    ${state.complete ? `<div class="lesson-feedback">✓ ${c(`实际支付 ${state.paid} AIR，轮到对手。跟注并不直接结束下注。正式局只接受当前行动方的合法操作。`, `Paid ${state.paid} AIR. It is now the opponent’s turn. Calling does not itself end betting. The real game only accepts legal actions from the current actor.`)}</div>` : `<div class="lesson-actions"><button class="button secondary" data-action="tutorial-call">${c('跟注', 'Call')} · 2 AIR</button><button class="button primary" data-action="tutorial-raise">${c('加注', 'Raise')} · ${pay} AIR →</button></div>`}`;
}

function riskExercise(state, c, opponentName) {
  const names = {
    failure: c('成手失败', 'Failed hand'),
    fold: c('普通弃牌', 'Fold'),
    calamity: c('重叠灾厄', 'Calamity'),
  };
  let scene = `<p class="lesson-hint">${c('依次查看三个情景，分清“输掉底池”与“额外烧毁”。', 'Explore all three cases. Losing the pot and burning extra reserve are different events.')}</p>`;
  if (state.scenario === 'failure')
    scene = `<div class="risk-film"><span class="failure-stamp">${c('构造失败', 'HAND FAILED')}</span><div>${lessonCards(hands[0])}</div><p>${c('例：你主动放弃，对手有效。对手收底池；你的失败牌不消耗，也不追加烧毁。双方都失败则保留底池重做。', 'You give up the hand; the opponent has a valid hand and collects the pot. Your failed cards are not consumed and no extra air burns. Two failures keep the pot and retry.')}</p><strong>${c('额外烧毁', 'Extra burned')}: 0 AIR</strong></div>`;
  if (state.scenario === 'fold')
    scene = `<div class="risk-film"><span class="failure-stamp">${c('停止下注', 'FOLD')}</span><div class="fold-arrow">${c('底池', 'POT')} → ${opponentName}</div><p>${c('例：你在下注时弃牌，对手收实际底池。双方已经合法锁定的实体牌仍进入公共弃牌，但不追加灾厄。', 'You fold during betting; the opponent receives the actual pot. Both valid locked hands enter the shared discard pile, but there is no extra calamity burn.')}</p><strong>${c('额外烧毁', 'Extra burned')}: 0 AIR</strong></div>`;
  if (state.scenario === 'calamity')
    scene = `<div class="risk-film"><div class="calamity-hands"><div><small>${c('四条 · 胜', 'Four of a kind · wins')}</small>${lessonCards(
      [
        ['4', '♠'],
        ['4', '♥'],
        ['4', '♦'],
        ['4', '♣'],
        ['8', '♠'],
      ],
    )}</div><div><small>${c('三条 · 负', 'Three of a kind · loses')}</small>${lessonCards(hands[0])}</div></div><p>${c('4♠、4♥、4♦ 是双方使用的相同实体牌。双方有效且分出胜负，触发灾厄。假设各投 6、各剩 18，底池 12 给胜方，败方再烧 min(6,18)=6。', 'The shared 4♠, 4♥ and 4♦ are identical physical cards. Both hands are valid and do not tie: calamity. If each invested 6 and has 18 left, the winner receives the pot of 12 and the loser burns min(6,18)=6.')}</p><strong class="burned-copy">${c('实际烧毁', 'Actually burned')}: 6 AIR</strong></div>`;
  return `<div class="risk-tabs">${Object.entries(names)
    .map(
      ([key, label]) =>
        `<button class="button secondary ${state.scenario === key ? 'is-selected' : ''}" data-action="tutorial-scenario" data-scenario="${key}" aria-pressed="${state.scenario === key}">${state.seen.includes(key) ? '✓ ' : ''}${label}</button>`,
    )
    .join(
      '',
    )}</div>${scene}${state.complete ? `<div class="lesson-feedback">✓ ${c('三个情景已看完。只有符合条件的实体重叠才额外烧毁，而且只记实际损失。', 'All three cases explored. Only qualifying overlap burns extra air, and only the actual loss is recorded.')}</div>` : ''}`;
}

function breathExercise(state, c) {
  const stage = state.breath;
  const reserve = stage === 0 ? 1 : 0;
  const supply = stage === 0 ? '00:05' : stage === 1 ? '05:00' : '00:00';
  const text = [
    c(
      '还剩一罐未开储备，当前罐还能呼吸 5 秒。推进 5 秒，观察自动开罐。',
      'One unopened can remains; the current can has 5 seconds. Advance 5 seconds to see the next can open.',
    ),
    c(
      '最后一罐已打开：未开储备 0，但你仍有 300 秒供气。零储备不等于死亡。',
      'The last can has opened. Reserve is 0, but 300 seconds of air remain. Zero reserve is not death.',
    ),
    c(
      '供气已耗尽，进入 10 秒缺氧宽限。此时仍未到耗尽判定。',
      'Supply has ended. The 10-second grace period begins; exhaustion has not yet been declared.',
    ),
    c(
      '缺氧宽限结束，才达到实际耗尽。正式局按真实时间推进；这里的按钮只推进练习。',
      'Only after the grace period ends is exhaustion reached. Real matches use real time; this button advances only the exercise.',
    ),
  ][stage];
  return `<div class="breath-lesson"><div class="lesson-canister ${stage >= 2 ? 'is-empty' : ''}" aria-hidden="true"><i></i><span>AIR</span></div><dl><div><dt>${c('未开储备', 'Unopened reserve')}</dt><dd>${reserve}</dd></div><div><dt>${c('当前供气', 'Current supply')}</dt><dd>${supply}</dd></div><div><dt>${c('缺氧宽限', 'Grace period')}</dt><dd>${stage === 2 ? '00:10' : stage === 3 ? '00:00' : '—'}</dd></div></dl></div><p class="lesson-hint">${text}</p>${stage < 3 ? `<button class="button primary" data-action="tutorial-breathe">${c('推进练习时间', 'Advance practice time')} · +${stage === 0 ? '5' : stage === 1 ? '300' : '10'}s →</button>` : `<div class="lesson-feedback">✓ ${c('你已区分未开储备、当前供气与缺氧宽限。', 'You can now distinguish reserve, current supply and grace.')}</div>`}`;
}

export function tutorialMarkup(state, view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  const titles = [
    c('选一个目标，锁一整手牌。', 'Choose a target. Lock a whole hand.'),
    c('看清这一次，要付多少。', 'Know exactly what you will pay.'),
    c('不是每次失败，都会烧毁。', 'Not every loss burns extra air.'),
    c('零储备，不是最后一口气。', 'Zero reserve is not your last breath.'),
  ];
  if (state.step === 4)
    return `<section class="tutorial-page tutorial-complete" data-scene="tutorial"><div class="tutorial-art" aria-hidden="true"></div><div class="tutorial-workspace"><p class="eyebrow">FOUR LESSONS. YOUR FIRST MATCH.</p><h1>${c('准备好，入场。', 'You are ready. Take your seat.')}</h1><p>${c('你已经练过：', 'You have practiced:')}</p><ul class="lesson-checklist">${titles.map((title) => `<li>✓ ${title}</li>`).join('')}</ul><div class="lesson-actions"><button class="button primary" data-action="enter-match">${c('开始正式对局', 'Start a real match')} →</button><button class="button secondary" data-action="tutorial-restart">${c('再练一次', 'Practice again')}</button></div></div></section>`;
  const exercises = [handExercise, betExercise, riskExercise, breathExercise];
  return `<section class="tutorial-page" data-scene="tutorial"><div class="tutorial-art" aria-hidden="true"></div><div class="tutorial-workspace"><header class="tutorial-heading"><p class="eyebrow">PRACTICE ${String(state.step + 1).padStart(2, '0')} / 04</p><div class="lesson-progress" aria-label="${c('练习进度', 'Practice progress')}">${[0, 1, 2, 3].map((n) => `<span class="${n <= state.step ? 'is-active' : ''}"></span>`).join('')}</div><h1>${titles[state.step]}</h1><p>${c('独立练习 · 不计入正式对局', 'Isolated practice · never affects match records')}</p></header><div class="tutorial-exercise">${exercises[state.step](state, c, translate(view.lang, 'cpu'), view.lang)}</div><footer class="tutorial-footer"><button class="button secondary" data-action="tutorial-reset">${c('重练这一项', 'Retry this lesson')}</button>${state.complete ? `<button class="button primary" data-action="tutorial-next">${state.step === 3 ? c('完成教学', 'Finish tutorial') : c('下一项练习', 'Next lesson')} →</button>` : `<span>${c('完成当前操作后继续', 'Complete the action to continue')}</span>`}</footer></div></section>`;
}
