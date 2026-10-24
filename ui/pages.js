const copy = (lang, zh, en) => (lang === 'en' ? en : zh);
const asset = 'assets/generated/air-poker-v2/';

export function lessonCards(cards, extra = '') {
  return `<span class="lesson-hand ${extra}">${cards.map(([rank, suit], index) => `<span class="lesson-card ${['♥', '♦'].includes(suit) ? 'is-red' : ''}" style="--card-index:${index}"><span>${rank}<small>${suit}</small></span><b aria-hidden="true">${suit}</b></span>`).join('')}</span>`;
}

export function homeMarkup(_state, view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  return `<section class="manga-home" data-scene="home" aria-labelledby="homeTitle">
    <div class="home-scene" aria-hidden="true"><div class="home-scene-art"></div><div class="home-scene-art home-figure-layer home-figure-left"></div><div class="home-scene-art home-figure-layer home-figure-right"></div><div class="home-light"></div><svg class="home-table-line" data-motion-line viewBox="0 0 1000 250" preserveAspectRatio="none"><ellipse class="home-water-ring" cx="500" cy="120" rx="487" ry="108"/><ellipse class="home-table-rim" cx="500" cy="120" rx="450" ry="84"/><path d="M50 120v14c0 47 201 84 450 84s450-37 450-84v-14M78 146c58 35 220 60 422 60s364-25 422-60"/><ellipse cx="500" cy="120" rx="423" ry="70"/></svg></div>
    <div class="home-center"><p class="eyebrow">A GAME OF AIR. A TEST OF NERVE.</p>
      <h1 id="homeTitle" aria-label="${c('空气扑克', 'Air Poker')}">${c('空气<span>扑克</span>', 'Air<span>Poker</span>')}</h1><p class="home-tagline">${c('你下注的，是下一口空气。', 'Your next breath is on the table.')}</p>
      <button class="button primary home-enter" data-action="enter-match">${c('开始对局', 'Enter the match')} <span aria-hidden="true">→</span></button>
      <div class="home-secondary"><button data-action="open-playbook">${c('了解玩法', 'How to play')}</button><span aria-hidden="true">／</span><button data-action="open-tutorial">${c('先练一次', 'Try the tutorial')}</button></div>
    </div>
    <footer class="home-foot"><p>${c('本地单人', 'SINGLE PLAYER')}<span>25 AIR × 2</span>${c('五轮后耐息', 'FIVE ROUNDS. THEN ENDURANCE.')}</p>${view.hasLastRecord ? `<button data-action="previous-record">${c('最近完成局', 'Last completed match')} ↗</button>` : '<span class="home-edition">THE ABYSS / 01</span>'}</footer>
  </section>`;
}

export function introductionMarkup(view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  const cards = lessonCards([
    ['4', '♠'],
    ['4', '♥'],
    ['4', '♦'],
    ['5', '♣'],
    ['7', '♠'],
  ]);
  return `<section class="manga-introduction narrative-page" data-scene="introduction" aria-labelledby="introductionTitle">
    <div class="paper-figures" aria-hidden="true"></div>
    <header class="narrative-heading"><p class="eyebrow">THE RULES OF SURVIVAL</p><h1 id="introductionTitle">${c('先理解目标。再承担下注。', 'Know the target. Own the risk.')}</h1><p>${c('一副共享的实体牌，五张私有的数字牌。赌桌上的筹码，是空气。', 'One shared deck. Five private targets. Every wager is air.')}</p></header>
    <div class="concept-grid">
      <article class="concept-panel"><div class="concept-top"><span>01</span><span>THE HAND</span></div><div class="concept-demo" data-concept="hand"><div class="concept-hand">${cards}</div><div class="sum-line">4 + 4 + 4 + 5 + 7 <b>= 24</b></div></div><h2>${c('数字，是目标和。', 'The number is your target.')}</h2><p>${c('挑选一张数字牌，用五张不同实体牌凑齐点数和。目标 24 可以组成三条；和的大小不代表牌型强弱。', 'Choose a target, then name five different cards that add up to it. This 24 is three of a kind. A larger total is not a stronger hand.')}</p><button class="button secondary" data-action="play-concept" data-concept="hand">${c('看演示', 'Play example')} <span aria-hidden="true">↗</span></button></article>
      <article class="concept-panel"><div class="concept-top"><span>02</span><span>THE WAGER</span></div><div class="concept-demo" data-concept="bet"><div class="air-demo"><div><span class="draw-canister">AIR</span><small>${c('未开储备', 'RESERVE')}</small></div><span class="air-transfer">+1 →</span><div class="demo-pot"><b>2 → 3</b><small>${c('底池', 'POT')}</small></div></div><span class="supply-stays">◉ ${c('当前呼吸罐继续供气', 'The open can keeps supplying air')}</span></div><h2>${c('下注，用未开储备。', 'Wager your reserve.')}</h2><p>${c('底池 2、无需跟注时，最多再加 1。当前呼吸罐不能下注。对手跟齐之后，行动继续；连续两次过牌才结束。', 'With a pot of 2 and nothing to call, you may raise by 1. Your open can cannot be wagered. A call passes the turn; two checks end betting.')}</p><button class="button secondary" data-action="play-concept" data-concept="bet">${c('看演示', 'Play example')} <span aria-hidden="true">↗</span></button></article>
      <article class="concept-panel"><div class="concept-top"><span>03</span><span>THE REVEAL</span></div><div class="concept-demo" data-concept="risk"><div class="risk-pair">${lessonCards(
        [
          ['4', '♠'],
          ['4', '♥'],
          ['4', '♦'],
          ['4', '♣'],
          ['8', '♠'],
        ],
      )}${lessonCards([
        ['4', '♠'],
        ['4', '♥'],
        ['4', '♦'],
        ['5', '♣'],
        ['7', '♠'],
      ])}</div><span class="risk-caption">${c('四条胜三条 · 同实体牌重叠', 'Four of a kind wins · physical cards overlap')}</span></div><h2>${c('摊牌，才知道代价。', 'The reveal has a price.')}</h2><p>${c('两手完整牌比较牌型。双方有效、实体重叠且分出胜负时，败者额外烧毁空气。本例双方各投 6、败方剩 18，实际烧毁 6；普通弃牌不触发灾厄。', 'Compare complete hands. If both are valid, overlap and do not tie, the loser burns reserve. Here each invested 6 and the loser has 18 left: 6 actually burns. Folding does not trigger calamity.')}</p><button class="button secondary" data-action="play-concept" data-concept="risk">${c('看演示', 'Play example')} <span aria-hidden="true">↗</span></button></article>
    </div>
    <footer class="narrative-footer"><button class="button secondary" data-action="open-rules">${c('查看完整规则', 'Read full rules')}</button><div><button class="button secondary" data-action="open-tutorial">${c('进入教学', 'Try the tutorial')}</button><button class="button primary" data-action="enter-match">${c('开始对局', 'Enter the match')} →</button></div></footer>
  </section>`;
}

export function rulesMarkup(lang) {
  const c = (zh, en) => copy(lang, zh, en);
  const chapters = [
    [
      'flow',
      c('回合流程', 'Round flow'),
      c(
        '双方各有 25 罐。开局打开一罐，24 罐可下注。每轮依次选数字、构造完整五张成手、交替下注、摊牌；最多五轮，然后进入耐息。CPU 在你选择前已经锁定自己的数字与成手。',
        'Each player starts with 25 cans, opens one, and has 24 to wager. Each round: choose a number, lock a five-card hand, alternate bets, reveal. After at most five rounds, endurance begins. The CPU locks its choice before you choose.',
      ),
    ],
    [
      'hand',
      c('数字与完整成手', 'Targets and complete hands'),
      c(
        '五张数字牌各使用一次，不补牌。实体成手必须是五张不同、未弃掉的牌，点数和等于目标；A=1，J/Q/K=11/12/13。比较通常 A 高，A2345 为五高。界面最多给出三个完整推荐，按整手选择；构造限时 60 秒。无解数字仍能选择，主动放弃或超时均记为成手失败，不消耗失败实体牌。',
        'Each of five number cards is used once. A valid hand has five different unused cards whose values sum to the target: A=1, J/Q/K=11/12/13. Aces usually compare high; A2345 is five-high. Choose an entire hand from up to three recommendations within 60 seconds. Unsolvable targets remain selectable. Giving up or timing out fails the hand without consuming its cards.',
      ),
    ],
    [
      'bet',
      c('交替下注', 'Alternating bets'),
      c(
        '首次成手锁定后双方支付底注：回合数与双方未开资源的最小值。应跟为零才能过牌；两次连续过牌结束。跟注后换对方继续。加注先跟齐，再加至少 1、至多跟齐后底池一半，且不超过双方可匹配资源。可匹配全押也受半池限制。玩家每次行动 30 秒；超时有应跟则弃牌，没有则过牌。',
        'After the first hand attempt, each pays an ante capped by the round number and both reserves. Check only when nothing is owed; two consecutive checks end betting. A call passes the turn. A raise first calls, then adds at least 1 and at most half the pot after calling, capped by matching reserves. All-in obeys the same cap. Player turns last 30 seconds: timeout folds when facing a bet, otherwise checks.',
      ),
    ],
    [
      'risk',
      c('失败、实体牌与灾厄', 'Failure, shared cards and calamity'),
      c(
        '双方有效时按牌型和踢脚牌比较；同一张点数与花色均相同的实体牌重叠且非平局，败者再烧毁 min(本轮投入，剩余未开罐)。普通弃牌、单方成手失败和牌型平局不额外烧毁。单方失败由有效方收底池；双方失败保留同数字和底池重新构造，不重复底注或下注；双方都无解则退款转耐息。',
        'Valid hands compare by poker rank and kickers. If the same physical card appears in both hands and the result is not a tie, the loser burns min(round investment, unopened reserve). Folding, one failed hand, and ties do not add a burn. One valid hand wins against a failure. Two failures retry the same targets and pot without another ante or betting round. Two unsolvable targets refund the pot and enter endurance.',
      ),
    ],
    [
      'breath',
      c('供气与耐息', 'Breathing and endurance'),
      c(
        '每罐约供气 300 秒，耗尽自动换罐，已开罐不可下注。未开储备为零并不等于死亡：当前罐继续供气，耗尽后还有 10 秒数字版缺氧宽限。五轮完成、无法匹配底注或双无解进入耐息；快进复用相同供气规则，到首次实际耗尽为止。',
        'Each can supplies approximately 300 seconds, then the next opens automatically. Open cans cannot be wagered. Zero reserve is not death: the current can keeps supplying air, followed by a 10-second digital grace period. Five rounds, no matching ante, or two unsolvable targets lead to endurance. Fast-forward uses the same breathing rules until the first actual exhaustion.',
      ),
    ],
    [
      'end',
      c('结束与账目', 'Results and accounting'),
      c(
        '真实供气与缺氧宽限结束才判定胜负；双方同刻耗尽为平局，不按余额或赢牌轮数决定。任何阶段均可能耗尽，未结算底池按实际投入退款。双方未开余额 + 底池 + 累计已开罐 + 实际烧毁 = 50。查看规则、记录、切换语言或关闭装饰动效均不暂停对局。最近完成局保存在本机；刷新不恢复未完成局。',
        'The result follows actual supply and grace exhaustion, not balances or round wins. Simultaneous exhaustion is a draw. Exhaustion can interrupt any phase; unsettled investments are refunded. Both reserves + pot + opened cans + burned cans = 50. Rules, records, language changes and motion settings do not pause the game. The last completed match is saved locally; unfinished games do not resume after refresh.',
      ),
    ],
  ];
  return `<div class="full-rules"><nav aria-label="${c('规则章节', 'Rule chapters')}">${chapters.map(([id, title], index) => `<a href="#rule-${id}"><span>0${index + 1}</span>${title}</a>`).join('')}</nav><div class="rules-chapters">${chapters.map(([id, title, body], index) => `<section id="rule-${id}"><p class="eyebrow">0${index + 1}</p><h2>${title}</h2><p>${body}</p></section>`).join('')}</div></div>`;
}

export function introMarkup(view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  return `<section class="match-intro" data-scene="intro"><div class="intro-slash" aria-hidden="true"></div><p class="eyebrow">FIVE TARGETS. ONE LAST BREATH.</p><div class="intro-matchup"><span>${c('你', 'YOU')}</span><em>VS</em><span>CPU</span></div><p>${c('双方各 25 罐。呼吸已经开始。', '25 cans each. Breathing has begun.')}</p><button class="button secondary" data-action="skip-intro">${c('跳过表现', 'Skip intro')} →</button></section>`;
}

export function resultMarkup(state, view) {
  if (state.phase !== 'summary' || !['player', 'ai', 'tie'].includes(state.winner)) return '';
  const c = (zh, en) => copy(view.lang, zh, en);
  const kind = state.winner === 'player' ? 'victory' : state.winner === 'ai' ? 'defeat' : 'draw';
  const title =
    kind === 'victory'
      ? c('胜利。', 'VICTORY.')
      : kind === 'defeat'
        ? c('本局失利。', 'DEFEAT.')
        : c('本局平局。', 'A DRAW.');
  const tagline =
    kind === 'victory'
      ? c('你留住了下一口空气。', 'You kept your next breath.')
      : kind === 'defeat'
        ? c('这一口空气，没能留到最后。', 'Your last breath came first.')
        : c('水面没有偏向任何一方。', 'The water favored neither side.');
  const reason =
    kind === 'victory'
      ? c(
          '对手的供气与 10 秒缺氧宽限先结束，你仍存活。',
          'The opponent exhausted supply and the 10-second grace period first. You survived.',
        )
      : kind === 'defeat'
        ? c(
            '你的供气与 10 秒缺氧宽限先结束，对手仍存活。',
            'You exhausted supply and the 10-second grace period first. The opponent survived.',
          )
        : c(
            '双方供气与缺氧宽限在同一时刻耗尽。',
            'Both supplies and grace periods ended at the same instant.',
          );
  const elapsed = Math.floor((state.respiration?.elapsedMs ?? 0) / 1000);
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return `<section class="result-page result-${kind}" data-scene="${kind}" aria-labelledby="resultTitle">
    ${kind === 'draw' ? '<div class="paper-figures" aria-hidden="true"></div><div class="draw-waterline" data-motion-line aria-hidden="true"></div>' : `<div class="result-art" aria-hidden="true">${kind === 'victory' ? '<svg class="victory-arc" viewBox="0 0 500 500"><path data-motion-ink d="M80 420 Q-20 180 280 50 Q450 5 440 210"/></svg>' : ''}<img src="${asset}${kind}.png" alt="" data-motion-reveal /></div>`}
    <div class="result-copy"><p class="eyebrow">${kind === 'victory' ? 'THE LAST BREATH IS YOURS' : kind === 'defeat' ? 'THE ABYSS REMEMBERS' : 'A PERFECT EQUILIBRIUM'}</p><h1 id="resultTitle">${title}</h1><p class="result-tagline">${tagline}</p><p class="result-reason">${reason}</p>
      <dl class="result-facts"><div><dt>${c('完成轮次', 'Rounds completed')}</dt><dd>${state.completedRounds} / ${state.maxRounds}</dd></div><div><dt>${c('对局时长', 'Match duration')}</dt><dd>${duration}</dd></div><div><dt>${c('实际烧毁', 'Actually burned')}</dt><dd>${state.accounting?.burned ?? 0} AIR</dd></div></dl>
      <div class="result-actions"><button class="button primary" data-action="enter-match">${kind === 'draw' ? c('再较量一局', 'Play again') : c('再来一局', 'Play again')} →</button><button class="button secondary" data-action="open-record">${c('查看复盘', 'Review match')}</button></div><button class="result-home" data-action="go-home">← ${c('返回首页', 'Back to home')}</button>
    </div>
  </section>`;
}
