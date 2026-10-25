// Standalone design atlas. Fixtures illustrate the specification; no game engine is loaded.
const pages = [
  {
    id: 'p01',
    name: '首页 · 潜入前厅',
    tag: '核心 / START',
    path: '/',
    purpose: '先建立赌局的吸引力，再给玩家一个清晰的开始入口。',
    notes: [
      '唯一强主按钮是开始对局，新手教学与完整规则作为辅助入口。',
      '用 25 AIR、单人对战、最多五回合陈述真实范围；没有假联网和假继续。',
      '偏左标题和右侧空气刻度形成分镜，手机把装饰退到背景。',
    ],
  },
  {
    id: 'p02',
    name: '规则 · 空气协议',
    tag: '核心 / LEARN',
    path: '/rules',
    purpose: '通过牌面和账单，把目标值、牌型、下注与灾厄讲清。',
    notes: [
      '六章目录可点击，先给最小理解，再提供细节。',
      '目标求和与扑克比较分开，避免把数字大小当作胜负。',
      '灾厄用 25 → 19 AIR 的账单解释，胜者收到的底池与净赚分开。',
    ],
  },
  {
    id: 'p03',
    name: '教学 · 训练潜舱',
    tag: '增强 / PRACTICE',
    path: '/tutorial',
    purpose: '让新手通过三个短练习掌握操作，练习与正式牌局隔离。',
    notes: [
      '无正式胜负、无倒计时、可重置；练习不会写入正式战绩。',
      '每一步只要求理解一个概念，提示贴近卡牌和金额。',
      '教学可跳过，结束后由玩家主动进入正式对局。',
    ],
  },
  {
    id: 'p04',
    name: '对战 · 深海牌桌',
    tag: '核心 / PLAY',
    path: '/match',
    purpose: '五个状态共用一张稳定的牌桌，始终知道下一步要做什么。',
    notes: [
      '上方可切换五个子状态，展示同一回合的不同布局。',
      '空气、轮次、目标与动作位置稳定，次要记录在手机上改为浮层。',
      '此处演示 R5 的 58 点成手和空气账目；实际对局由现有引擎决定。',
    ],
  },
  {
    id: 'p05',
    name: '胜利 · 浮升',
    tag: '核心 / VICTORY',
    path: '/result/win',
    purpose: '给予胜利的情绪回报，也给出能够核查的获胜依据。',
    notes: [
      '冰青与向上的光束表达浮升，先看结果与最终空气，再看细节。',
      '胜 / 负 / 平共用账目和操作组件，避免重复三套结算逻辑。',
      '再来一局是主动作，复盘与返回首页始终可达。',
    ],
  },
  {
    id: 'p06',
    name: '失败 · 沉降',
    tag: '核心 / DEFEAT',
    path: '/result/loss',
    purpose: '让失败有解释、有下一步，而不只是一个重试按钮。',
    notes: [
      '仍有空气但五回合落后，写本局失利，不写空气耗尽。',
      '关键回合入口直接跳到复盘，展示事实，不虚构 AI 策略诊断。',
      '危险红用于结果与损失，再来一局仍保持易辨认的主按钮。',
    ],
  },
  {
    id: 'p07',
    name: '平局 · 静水',
    tag: '核心 / DRAW',
    path: '/result/draw',
    purpose: '覆盖完整的结果分支，平局不被误当成失败。',
    notes: [
      '琥珀、水平线、等长空气刻度构成悬停感。',
      '当前体验版空气相同即平局，不擅自加赛或按胜场数决胜。',
      '查看复盘保留这局的平局结果，再开一局才创建新对局。',
    ],
  },
  {
    id: 'p08',
    name: '复盘 · 深海档案',
    tag: '增强 / REVIEW',
    path: '/review',
    purpose: '通过逐轮事实和资金变化，解释每一口空气去了哪里。',
    notes: [
      '点击 R1–R5 可切换账单，示例数据逐行守恒。',
      '从不同结算页进入时，保留对应的胜 / 负 / 平示例与返回位置。',
      '正式实现需要完整回合快照；目前七条局内日志不足以支撑此页。',
    ],
  },
];

const phases = [
  ['target', '01 选择目标'],
  ['hand', '02 锁定成手'],
  ['bet', '03 空气下注'],
  ['reveal', '04 摊牌比较'],
  ['ledger', '05 回合账目'],
];
const state = {
  page: 'p01',
  width: 'desktop',
  phase: 'target',
  chapter: 0,
  tutorial: 1,
  amount: 2,
  round: 4,
  resultOrigin: 'p05',
};
const $ = (id) => document.getElementById(id);

function cards(values, used = []) {
  return /* HTML */ `<div class="hand">
    ${values
      .map((value, index) => {
        const suit = value.slice(-1);
        const rank = value.slice(0, -1);
        return /* HTML */ `<span
          class="playing-card ${['♥', '♦'].includes(suit) ? 'red' : ''} ${used.includes(index) ? 'used' : ''}"
          aria-label="${value}${used.includes(index) ? '，已用失效' : ''}"
          ><span>${rank}</span><small>${suit}</small></span
        >`;
      })
      .join('')}
  </div>`;
}

function button(label, page, kind = '') {
  return /* HTML */ `<button class="btn ${kind}" data-page="${page}">${label}</button>`;
}

function productHeader() {
  return /* HTML */ `<header class="product-header">
    <button class="product-logo" data-page="p01" aria-label="返回首页">AIR <b>POKER</b></button
    ><span class="product-meta">THE ABYSS / LOCAL SINGLE PLAYER</span>
    <div class="header-actions">
      <button class="text-link" data-info="rules">规则</button
      ><button class="tiny-outline" data-info="settings" aria-label="设置">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 18h18" />
          <circle cx="8" cy="6" r="3" fill="#030914" />
          <circle cx="16" cy="18" r="3" fill="#030914" />
        </svg>
      </button>
    </div>
  </header>`;
}

function home() {
  return /* HTML */ `<div class="scene home-scene">
    <div class="home-hero">
      <p class="page-kicker">01 / BEFORE THE DESCENT</p>
      <h3 class="home-display"><span>AIR</span><em>POKER</em></h3>
      <p class="home-statement">你下注的，<br />是下一口空气。</p>
      <p class="lede">公开目标。锁定五张。<br />用空气，承担每一次选择。</p>
      <div class="actions">
        ${button('开始对局 ↗', 'p04')}${button('先练一局', 'p03', 'secondary')}
      </div>
      <button class="text-link" data-page="p02">查看完整规则 →</button>
    </div>
    <div class="pressure-art" aria-hidden="true">
      <div class="pressure-orbit"></div>
      <strong class="big-air">25</strong><span class="unit">AIR-BIOS</span
      ><span class="depth-label">FIVE ROUNDS · ONE RESERVE</span>
    </div>
    <div class="home-facts">
      <span><strong>25</strong>初始 AIR</span><span><strong>01</strong>单人对战</span
      ><span><strong>05</strong>最多五回合</span>
    </div>
  </div>`;
}

const chapters = [
  {
    title: '一回合，四次关键决定。',
    text: '先公开目标，私下锁定成手，再用空气下注。下注结束才比较双方有效牌。',
    body: /* HTML */ `<div class="flow-row">
        <span>01 选目标</span><span>02 锁成手</span><span>03 下注</span><span>04 摊牌</span>
      </div>
      <p class="hint">成手在下注前锁定，下注后不能更换。对手的牌在摊牌前保持隐藏。</p>`,
  },
  {
    title: '24 是目标，不是战斗力。',
    text: '五张所选牌点数相加必须等于目标，真正比较的是有效牌型。A 求和按 1，通常比较大小按高牌。',
    body:
      cards(['4♠', '4♥', '4♦', '5♣', '7♠']) +
      /* HTML */ `<div class="divider"></div>
        <span class="target-pill">4 + 4 + 4 + 5 + 7 = 24</span>
        <p class="hint">这手是三条。目标更大的高牌，依然可能输给它。</p>`,
  },
  {
    title: '每笔下注，都用同一口空气。',
    text: '第 R 回合底注为 R AIR。额外加注每次 1–4 AIR，并受双方可匹配空气限制。当前体验版由对手匹配后直接摊牌。',
    body: /* HTML */ `<table class="ledger">
        <tr>
          <th>第 2 回合</th>
          <th>你的 AIR</th>
        </tr>
        <tr>
          <td>底注</td>
          <td>2</td>
        </tr>
        <tr>
          <td>本次新增</td>
          <td>2</td>
        </tr>
        <tr>
          <td>本轮总投入</td>
          <td>4</td>
        </tr>
      </table>
      <p class="hint">回合之间双方各呼吸 −1 AIR。底注、额外下注和呼吸分别记账。</p>`,
  },
  {
    title: '选中了，不代表仍然有效。',
    text: '用过牌仍可被选中，但不参与本轮牌型与灾厄。所选五张的目标点数和，仍按五张计算。',
    body:
      cards(['4♠', '4♥', '4♦', '5♣', '7♠'], [0, 1]) +
      /* HTML */ `<p class="hint">
        所选 5 张 / 有效 3 张。灰色斜线是已用失效牌；本例按三张有效牌判断。
      </p>`,
  },
  {
    title: '灾厄，额外夺走败者的下注。',
    text: '双方有效成手使用了同一张实体牌，非平局败者要再损失自己的下注额，最多扣到零。',
    body: /* HTML */ `<table class="ledger">
      <tr>
        <th>双方各投入 3 AIR</th>
        <th>你</th>
        <th>对手</th>
      </tr>
      <tr>
        <td>开始</td>
        <td>25</td>
        <td>25</td>
      </tr>
      <tr>
        <td>投入</td>
        <td>−3</td>
        <td>−3</td>
      </tr>
      <tr>
        <td>胜者收下底池</td>
        <td>0</td>
        <td>+6</td>
      </tr>
      <tr>
        <td>灾厄额外</td>
        <td class="negative">−3</td>
        <td>0</td>
      </tr>
      <tr>
        <td>结束</td>
        <td>19</td>
        <td>28</td>
      </tr>
    </table>`,
  },
  {
    title: '最多五回合，空气决定最后的结果。',
    text: '一方空气耗尽可提前结束；五回合后比较最终 AIR，相同即平局。当前体验版没有额外决胜回合。',
    body: /* HTML */ `<div class="flow-row">
        <span>29 : 13 · 你胜</span><span>13 : 29 · 你负</span><span>21 : 21 · 平局</span>
      </div>
      <p class="hint">赢一个回合，不等于赢整场。最终结果还要看整局剩下的空气。</p>`,
  },
];

function rules() {
  const chapter = chapters[state.chapter];
  return /* HTML */ `<div class="scene">
    <p class="page-kicker">02 / THE AIR PROTOCOL</p>
    <h3 class="scene-title">看懂下一口空气，如何输赢。</h3>
    <p class="lede">适用：当前体验版。先理解流程，再看清每一笔账。</p>
    <div class="rules-layout">
      <nav class="chapter-list" aria-label="规则章节">
        ${['回合流程', '数字与牌型', '空气与下注', '用过牌失效', '灾厄账目', '胜负与结束'].map((name, index) => /* HTML */ `<button data-chapter="${index}" class="${index === state.chapter ? 'active' : ''}" aria-pressed="${index === state.chapter}">0${index + 1} / ${name}</button>`).join('')}
      </nav>
      <article class="rule-example">
        <h4>${chapter.title}</h4>
        <p class="lede">${chapter.text}</p>
        ${chapter.body}
      </article>
    </div>
    <div class="divider"></div>
    <div class="actions">
      ${button('开始新手教学', 'p03')}${button('直接开始对局 →', 'p04', 'secondary')}
    </div>
  </div>`;
}

function tutorial() {
  const steps = [
    [
      '先理解目标，再判断牌型。',
      '这五张牌的点数和是 24，牌型是三条。确认锁定后，才会进入下注。',
      cards(['4♠', '4♥', '4♦', '5♣', '7♠']),
    ],
    [
      '分清新增额，和你的总投入。',
      '底注 1 AIR，额外增加 2 AIR。你与对手各投入 3 AIR，底池是 6 AIR。',
      /* HTML */ `<table class="ledger">
        <tr>
          <td>底注</td>
          <td>1 AIR</td>
        </tr>
        <tr>
          <td>新增</td>
          <td>2 AIR</td>
        </tr>
        <tr>
          <td>总投入 / 底池</td>
          <td>3 / 6 AIR</td>
        </tr>
      </table>`,
    ],
    [
      '用过牌失效，实体重叠才算灾厄。',
      '看清斜线牌。只有仍然有效的同一张实体牌，才参与双方重叠判断。',
      cards(['4♠', '4♥', '4♦', '5♣', '7♠'], [0, 1]),
    ],
    [
      '训练完成。下一口空气，由你决定。',
      '你已掌握目标、锁牌、空气账目与失效牌。练习不会计入正式战绩。',
      /* HTML */ `<div class="flow-row">
        <span>目标 ✓</span><span>锁牌 ✓</span><span>账目 ✓</span>
      </div>`,
    ],
  ];
  const current = steps[state.tutorial - 1];
  return /* HTML */ `<div class="scene">
    <p class="page-kicker">03 / TRAINING CHAMBER</p>
    <h3 class="scene-title">在下潜前，先练一次。</h3>
    <p class="lede">独立练习 / 无倒计时 / 不影响正式对局</p>
    <div class="tutorial-progress">
      ${[1, 2, 3].map((n) => /* HTML */ `<span class="${n <= state.tutorial ? 'done' : ''}"></span>`).join('')}
    </div>
    <article class="tutorial-main">
      <div class="hand-label">
        <span>LESSON ${Math.min(state.tutorial, 3)} / 3</span><span>TRAINING</span>
      </div>
      <h4 class="scene-title">${current[0]}</h4>
      <p class="lede">${current[1]}</p>
      ${current[2]}
      <p class="hint">每次只理解一个动作。随时可重练，也可以直接进入正式对局。</p>
      <div class="actions">
        ${state.tutorial < 4 ? /* HTML */ `<button class="btn" data-tutorial-next>我明白了，下一步 →</button>` : button('开始正式对局 →', 'p04')}<button
          class="text-link"
          data-tutorial-reset
        >
          重新练习
        </button>
      </div>
    </article>
    <button class="text-link" data-page="p01">返回首页</button>
  </div>`;
}

const playerHand = ['K♦', 'K♣', 'K♠', '10♥', '9♦'];
const cpuHand = ['6♥', '7♦', '8♣', '9♠', '6♦'];

function matchBody() {
  switch (state.phase) {
    case 'target':
      return /* HTML */ `<p class="page-kicker">LOWER / REVEAL A TARGET</p>
        <h4 class="scene-title">先决定，要凑多少点。</h4>
        <p class="lede">数字决定目标，牌型决定谁赢。公开后本轮不能更改。</p>
        <div class="target-row">
          ${[30, 36, 44, 51, 58].map((n) => /* HTML */ `<div class="target-card ${n === 58 ? 'selected' : ''}"><small>TARGET</small><strong>${n}</strong><small>${n === 58 ? '暂选' : '可用'}</small></div>`).join('')}
        </div>
        <div class="match-footer">
          <p class="lede">本轮底注预计各 5 AIR</p>
          <button class="btn" data-phase="hand">公开目标 58 →</button>
        </div>`;
    case 'hand':
      return /* HTML */ `<p class="page-kicker">UPPER / PRIVATE HAND</p>
        <h4 class="scene-title">五张牌，藏在你这边。</h4>
        <p class="lede">目标 58 / 对手目标 36。暂选不等于锁定。</p>
        <div class="candidates">
          <article class="candidate">
            <div><strong>三条 K</strong><span class="meta">有效 5 张 / 目标 58</span></div>
            ${cards(['K♠', 'K♥', 'K♦', '10♣', '9♠'])}
          </article>
          <article class="candidate selected">
            <div><strong>三条 K</strong><span class="meta">已暂选 · 尚未锁定</span></div>
            ${cards(playerHand)}
          </article>
          <article class="candidate">
            <div><strong>三条 J</strong><span class="meta">有效 5 张 / 目标 58</span></div>
            ${cards(['J♥', 'Q♦', 'K♣', 'J♠', 'J♦'])}
          </article>
        </div>
        <div class="match-footer">
          <p class="lede">确认后双方各投入底注 5 AIR</p>
          <button class="btn" data-phase="bet">锁定并进入下注 →</button>
        </div>`;
    case 'bet':
      return /* HTML */ `<div class="match-top">
          <p class="page-kicker">BET / AIR IS CURRENCY</p>
          <span class="timer" aria-label="剩余24秒">00:24</span>
        </div>
        <div class="locked-panel">
          <div class="hand-label"><span>已锁定 / 三条 K</span><span>有效 5 张</span></div>
          ${cards(playerHand)}
          <div class="bet-summary">
            <span>你已投入 <strong>5 AIR</strong></span
            ><span>当前底池 <strong>10 AIR</strong></span>
          </div>
          <span class="overline">本次新增</span>
          <div class="amount-control">
            <button data-amount="-1" aria-label="减少演示下注">−</button
            ><strong>${state.amount} AIR</strong
            ><button data-amount="1" aria-label="增加演示下注">＋</button>
          </div>
          <p class="lede">下注后总投入 ${5 + state.amount} AIR，剩余 ${17 - state.amount} AIR</p>
          <div class="bet-buttons">
            <button class="btn secondary" data-info="check">过牌</button
            ><button class="btn" data-phase="reveal">增加 ${state.amount} AIR →</button
            ><button class="btn danger" data-info="fold">弃牌</button
            ><button class="btn secondary" data-info="allin">押至对手上限 15 AIR</button>
          </div>
        </div>
        <p class="hint">超时将过牌。对手成手依然隐藏。此蓝图展示固定案例，不执行真实下注。</p>`;
    case 'reveal':
      return /* HTML */ `<p class="page-kicker">SHOWDOWN / EVERY CARD SPEAKS</p>
        <h4 class="scene-title">看清，这一轮为什么赢。</h4>
        <div class="reveal">
          <div class="reveal-item winner">
            <div class="hand-label">
              <span>你 / 目标 58</span><span class="positive">三条 K · 获胜</span>
            </div>
            ${cards(playerHand)}
          </div>
          <div class="reveal-item">
            <div class="hand-label"><span>对手 / 目标 36</span><span>一对 6</span></div>
            ${cards(cpuHand)}
          </div>
        </div>
        <p class="hint">三条强于一对。双方有效实体牌无重叠，本轮不发生灾厄。</p>
        <div class="actions">
          <button class="btn" data-phase="ledger">看本轮空气账目 →</button>
        </div>`;
    default:
      return /* HTML */ `<p class="page-kicker">ROUND LEDGER / AIR ACCOUNTED FOR</p>
        <h4 class="scene-title">你赢下了这一回合。</h4>
        <table class="ledger">
          <tr>
            <th>本轮账目</th>
            <th>你</th>
            <th>对手</th>
          </tr>
          <tr>
            <td>开始空气</td>
            <td>22</td>
            <td>20</td>
          </tr>
          <tr>
            <td>总投入（底注 5 + 追加 2）</td>
            <td>−7</td>
            <td>−7</td>
          </tr>
          <tr>
            <td>收到的底池</td>
            <td class="positive">+14</td>
            <td>0</td>
          </tr>
          <tr>
            <td>灾厄额外</td>
            <td>0</td>
            <td>0</td>
          </tr>
          <tr>
            <td>本轮净变化</td>
            <td class="positive">+7</td>
            <td class="negative">−7</td>
          </tr>
          <tr>
            <td>最终空气</td>
            <td>29</td>
            <td>13</td>
          </tr>
        </table>
        <p class="hint">R5 已完成。你收到的 14 AIR 包含自己的 7 AIR，净获得是 7 AIR。</p>
        <div class="actions">${button('查看最终结算 →', 'p05')}</div>`;
  }
}

function match() {
  const settled = state.phase === 'ledger';
  const betting = state.phase === 'bet';
  const air = settled
    ? [29, 13]
    : betting
      ? [17, 15]
      : state.phase === 'reveal'
        ? [15, 13]
        : [22, 20];
  const pot = betting ? 10 : state.phase === 'reveal' ? 14 : 0;
  return /* HTML */ `<div class="scene match-scene">
    <div class="match-top">
      <h3>深海牌桌。</h3>
      <span class="round-index">R05 <small>/ 05</small></span>
    </div>
    <div class="air-strip">
      <article class="air-side">
        <header>
          <span>YOU / PLAYER-01</span><strong>${air[0]} <small>AIR</small></strong>
        </header>
        <div class="air-line"><i style="width:${Math.min(100, air[0] * 4)}%"></i></div>
      </article>
      <div class="pot-center">POT<strong>${pot}</strong></div>
      <article class="air-side cpu">
        <header>
          <span>对手</span><strong>${air[1]} <small>AIR</small></strong>
        </header>
        <div class="air-line"><i style="width:${Math.min(100, air[1] * 4)}%"></i></div>
      </article>
    </div>
    <div class="match-body">
      <div class="match-main">${matchBody()}</div>
      <aside class="match-side">
        <p class="overline">ROUND TRACE</p>
        ${['你赢', '对手赢', '你赢', '对手赢', '当前'].map((text, index) => /* HTML */ `<div class="trace-item ${index === 4 ? 'live' : ''}"><span>R0${index + 1}</span><span>${text}</span></div>`).join('')}
        <div class="divider"></div>
        <button class="text-link" data-info="discard">查看弃牌 →</button
        ><button class="text-link" data-info="log">查看回合记录 →</button>
      </aside>
    </div>
  </div>`;
}

const outcomes = {
  p05: {
    className: 'win',
    word: 'SURVIVED',
    statement: '你把最后的优势，留在了自己这一侧。',
    scores: [29, 13],
    reason: '五回合结束，你剩余的 AIR 更多。',
    label: '胜利',
    highlight: 'R5 · 净获得 7 AIR',
    detail: '三条 K 胜过一对 6。关键的最后一回合，让优势留在你这边。',
    wins: 3,
  },
  p06: {
    className: 'loss',
    word: 'DEFEAT',
    statement: '这一局，空气留在了对手那边。',
    scores: [13, 29],
    reason: '五回合结束，对手剩余的 AIR 更多。',
    label: '失利',
    highlight: 'R5 · 净损失 7 AIR',
    detail: '先看有效牌型与这一轮账目，再决定下一次如何承担风险。',
    wins: 2,
  },
  p07: {
    className: 'draw',
    word: 'DRAW',
    statement: '水面没有偏向任何一边。',
    scores: [21, 21],
    reason: '双方最终空气相同，本局判定为平局。',
    label: '平局',
    highlight: '同样的空气，不同的选择。',
    detail: '当前规则没有加赛。你可以回看本局，或者再较量一次。',
    wins: 2,
  },
};

function result() {
  const value = outcomes[state.page];
  return /* HTML */ `<div class="scene result-scene ${value.className}">
    <div>
      <p class="page-kicker">MATCH CLOSED / ${value.label}</p>
      <h3 class="outcome-word">${value.word}</h3>
      <p class="result-statement">${value.statement}</p>
      <div class="score-duel">
        <div>
          <span class="side-label">YOU / FINAL AIR</span><strong>${value.scores[0]}</strong>
        </div>
        <span class="separator">${state.page === 'p07' ? '=' : ':'}</span>
        <div>
          <span class="side-label">对手 / FINAL AIR</span><strong>${value.scores[1]}</strong>
        </div>
      </div>
      <p class="end-reason">${value.reason}</p>
      <div class="result-stats">
        <div>赢得回合<strong>${value.wins} / 5</strong></div>
        <div>灾厄实际损失<strong>0 AIR</strong></div>
      </div>
      <div class="actions">
        ${button(state.page === 'p07' ? '再较量一局 ↗' : '再来一局 ↗', 'p04')}${button('查看对局复盘', 'p08', 'secondary')}
      </div>
      <button class="text-link" data-page="p01">返回首页</button>
    </div>
    <div class="result-art">
      <div class="result-highlight">
        <span class="overline">${state.page === 'p07' ? 'STILL WATER' : 'TURNING POINT'}</span
        ><strong>${value.highlight}</strong>
        <p>${value.detail}</p>
        ${state.page === 'p06' ? /* HTML */ `<button class="text-link" data-page="p08">查看失利回合 →</button>` : ''}
      </div>
    </div>
  </div>`;
}

const winRows = [
  [25, 25, 3, '你', 28, 22],
  [27, 21, 2, '对手', 25, 23],
  [24, 22, 4, '你', 28, 18],
  [27, 17, 4, '对手', 23, 21],
  [22, 20, 7, '你', 29, 13],
];
const drawRows = [
  [25, 25, 3, '你', 28, 22],
  [27, 21, 3, '对手', 24, 24],
  [23, 23, 4, '你', 27, 19],
  [26, 18, 4, '对手', 22, 22],
  [21, 21, 5, '平', 21, 21],
];

function review() {
  const origin = outcomes[state.resultOrigin];
  const rows =
    state.resultOrigin === 'p07'
      ? drawRows
      : state.resultOrigin === 'p06'
        ? winRows.map((r) => [r[1], r[0], r[2], r[3] === '你' ? '对手' : '你', r[5], r[4]])
        : winRows;
  const row = rows[state.round];
  const received = row[3] === '平' ? row[2] : row[3] === '你' ? row[2] * 2 : 0;
  const otherReceived = row[3] === '平' ? row[2] : row[3] === '对手' ? row[2] * 2 : 0;
  const line = (side) =>
    [25, ...rows.map((r) => r[side])]
      .map((air, index) => `${20 + index * 112},${123 - air * 3.2}`)
      .join(' ');
  return /* HTML */ `<div class="scene">
    <div class="review-header">
      <div>
        <p class="page-kicker">08 / MATCH ARCHIVE</p>
        <h3 class="scene-title">每一口空气，都有去向。</h3>
      </div>
      <span class="badge">本局${origin.label} / ${origin.scores.join(' : ')}</span>
    </div>
    <div class="air-chart">
      <div class="chart-legend"><span>━ 你</span><span>━ 对手</span></div>
      <svg viewBox="0 0 610 145" role="img" aria-label="演示对局每回合结束后的双方 AIR 变化">
        <g stroke="#a9becf20"><path d="M20 30H580M20 70H580M20 110H580" /></g>
        <polyline points="${line(4)}" fill="none" stroke="#60d8ff" stroke-width="3" />
        <polyline points="${line(5)}" fill="none" stroke="#ff477e" stroke-width="3" />
        <g fill="#a9becf" font-size="11" font-family="monospace">
          ${['开始', 'R1', 'R2', 'R3', 'R4', 'R5'].map((s, i) => `<text x="${14 + i * 112}" y="143">${s}</text>`).join('')}
        </g>
      </svg>
    </div>
    <div class="review-layout">
      <nav class="round-tabs" aria-label="选择复盘回合">
        ${rows.map((r, index) => /* HTML */ `<button data-round="${index}" class="${index === state.round ? 'active' : ''}">R${index + 1} / ${r[3] === '平' ? '平局' : r[3] === '你' ? '你赢' : '对手赢'}</button>`).join('')}
      </nav>
      <article class="review-detail">
        <h4>R${state.round + 1} · ${row[3] === '平' ? '双方退回本轮投入' : row[3] + '赢下本轮'}</h4>
        <p class="lede">本轮各投入 ${row[2]} AIR，灾厄额外损失 0 AIR。</p>
        <table class="ledger">
          <tr>
            <th>空气明细</th>
            <th>你</th>
            <th>对手</th>
          </tr>
          <tr>
            <td>本轮开始</td>
            <td>${row[0]}</td>
            <td>${row[1]}</td>
          </tr>
          <tr>
            <td>本轮投入</td>
            <td>−${row[2]}</td>
            <td>−${row[2]}</td>
          </tr>
          <tr>
            <td>收到 / 退回</td>
            <td>${received ? '+' + received : '0'}</td>
            <td>${otherReceived ? '+' + otherReceived : '0'}</td>
          </tr>
          <tr>
            <td>本轮结束</td>
            <td>${row[4]}</td>
            <td>${row[5]}</td>
          </tr>
        </table>
        <p class="hint">
          ${state.round === 4 ? '最终回合后不再扣呼吸成本。' : '进入下一回合前，双方再各扣 1 AIR 呼吸成本。'}这里只读记录，不重新计算牌局。
        </p>
        <div class="actions">
          ${button('返回本局结算', state.resultOrigin, 'secondary')}${button('再来一局 ↗', 'p04')}
        </div>
      </article>
    </div>
  </div>`;
}

function render() {
  const page = pages.find((value) => value.id === state.page);
  $('pageNumber').textContent = `${page.id.toUpperCase()} / ${page.tag}`;
  $('pageTitle').textContent = page.name;
  $('pagePurpose').textContent = page.purpose;
  $('previewPath').textContent = 'air-poker.local/#' + page.path;
  $('pageNotes').innerHTML = page.notes.map((note) => `<li>${note}</li>`).join('');
  $('pageNav').innerHTML = pages
    .map(
      (item, index) =>
        /* HTML */ `<button
          class="nav-item"
          data-page="${item.id}"
          ${item.id === state.page ? 'aria-current="page"' : ''}
        >
          <span>0${index + 1}</span>
          <div><strong>${item.name.split(' · ')[0]}</strong><small>${item.tag}</small></div>
        </button>`,
    )
    .join('');
  $('phaseNav').innerHTML =
    state.page === 'p04'
      ? phases
          .map(
            ([id, name]) =>
              /* HTML */ `<button data-phase="${id}" aria-pressed="${state.phase === id}">
                ${name}
              </button>`,
          )
          .join('')
      : '';
  const content =
    state.page === 'p01'
      ? home()
      : state.page === 'p02'
        ? rules()
        : state.page === 'p03'
          ? tutorial()
          : state.page === 'p04'
            ? match()
            : state.page === 'p08'
              ? review()
              : result();
  $('mock').innerHTML = productHeader() + content;
  $('frame').classList.toggle('mobile', state.width === 'mobile');
  document
    .querySelectorAll('[data-width]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.width === state.width)),
    );
}

function navigate(id) {
  if (!pages.some((page) => page.id === id)) return;
  if (id === 'p08' && outcomes[state.page]) state.resultOrigin = state.page;
  if (id === 'p04' && state.page !== 'p04') {
    state.phase = 'target';
    state.amount = 2;
  }
  state.page = id;
  location.hash = id;
  render();
}

const info = {
  rules: [
    '局内规则，不打断原阶段。',
    '目标只决定五张所选牌的点数和。有效牌型决定输赢。下注前锁定，下注后不能换牌。',
    '<p>正式局中打开规则不会暂停倒计时；完整内容见规则页。</p>',
  ],
  settings: [
    '设置',
    '正式设计提供语言、减少动态效果等真实可用的偏好。设置不改变牌局或重置倒计时。',
    '<p>本蓝图已尊重系统减少动态效果。音效未接入前，产品不出现虚假的音量开关。</p>',
  ],
  discard: [
    '共享弃牌区',
    '正式页按实体牌展示已用牌，可按花色、点数查看；不会把牌从弃牌区移回。',
    cards(['4♠', '4♥', '4♦', '5♣', '7♠'], [0, 1, 2, 3, 4]),
  ],
  log: [
    '回合记录',
    '这里查看已完成回合与当前已公开事件，不能提前读取对手的暗牌。',
    '<p>完整对局结束后，使用复盘页查看完整快照与账目。</p>',
  ],
  fold: [
    '放弃本回合？',
    '你已投入底注 5 AIR。弃牌可能仍承担灾厄额外损失；它不等于结束整局。',
    '<p>正式实现：默认安全项是继续决策，确认时再次验证当前阶段与剩余时间。</p>',
  ],
  allin: [
    '按对手上限匹配',
    '你当前 17 AIR，对手 15 AIR。实际可匹配上限为 15 AIR，操作后你剩余 2 AIR。',
    '<p>该动作不产生边池。界面应展示实际投入，而非声称消耗你的全部 17 AIR。</p>',
  ],
  check: [
    '过牌',
    '当前体验版会进入摊牌，不追加 AIR；本轮之前投入的底注依然在底池中。',
    '<p>蓝图中的摊牌和账单为固定“新增 2 AIR”示例，可通过上方子状态查看。</p>',
  ],
};

function openInfo(name) {
  const value = info[name];
  if (!value) return;
  $('dialogBody').innerHTML = `<h3>${value[0]}</h3><p>${value[1]}</p>${value[2]}`;
  $('infoDialog').showModal();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) {
    $('infoDialog').close();
    return;
  }
  if (button.dataset.page) {
    navigate(button.dataset.page);
    return;
  }
  if (button.dataset.phase) {
    // The ledger and reveal use the same fixed 2 AIR example, not a second rules engine.
    if (['reveal', 'ledger'].includes(button.dataset.phase)) state.amount = 2;
    state.phase = button.dataset.phase;
    render();
    return;
  }
  if (button.dataset.width) {
    state.width = button.dataset.width;
    render();
    return;
  }
  if (button.dataset.chapter !== undefined) {
    state.chapter = Number(button.dataset.chapter);
    render();
    return;
  }
  if (button.hasAttribute('data-tutorial-next')) {
    state.tutorial = Math.min(4, state.tutorial + 1);
    render();
    return;
  }
  if (button.hasAttribute('data-tutorial-reset')) {
    state.tutorial = 1;
    render();
    return;
  }
  if (button.dataset.amount) {
    state.amount = Math.min(4, Math.max(1, state.amount + Number(button.dataset.amount)));
    render();
    return;
  }
  if (button.dataset.round !== undefined) {
    state.round = Number(button.dataset.round);
    render();
    return;
  }
  if (button.dataset.info) openInfo(button.dataset.info);
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (pages.some((page) => page.id === id) && id !== state.page) {
    state.page = id;
    render();
  }
});
const initial = location.hash.slice(1);
if (pages.some((page) => page.id === initial)) state.page = initial;
render();
