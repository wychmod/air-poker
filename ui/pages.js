import { translate } from '../i18n.js';
import {
  DIFFICULTY_KEYS,
  contractResultCopy,
  contractResultFor,
  opponentCopy,
  modeSummary,
  matchModeSummary,
} from './modes.js';
import { normalizeDifficulty } from '../game/difficulty.js';
import { comicRecapMarkup } from './recap.js';

const copy = (lang, zh, en) => (lang === 'en' ? en : zh);
const resultAssets = {
  victory: 'assets/runtime/victory.webp',
  defeat: 'assets/runtime/defeat.webp',
};

export function lessonCards(cards, extra = '') {
  return `<span class="lesson-hand ${extra}">${cards.map(([rank, suit], index) => `<span class="lesson-card ${['♥', '♦'].includes(suit) ? 'is-red' : ''}" style="--card-index:${index}"><span>${rank}<small>${suit}</small></span><b aria-hidden="true">${suit}</b></span>`).join('')}</span>`;
}

function matchSetupMarkup(view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  const setup = view.setup ?? {};
  const difficulty = normalizeDifficulty(setup.difficulty);
  return `<div class="home-setup" aria-label="${c('对局设定', 'Match setup')}">
    <div class="home-setup-head"><span>${c('选择难度', 'CHOOSE DIFFICULTY')}</span><small>${c('每局固定，打法随局势调整', 'ONE LEVEL. MANY WAYS TO PLAY.')}</small></div>
    <div class="home-opponents" role="group" aria-label="${c('选择难度', 'Choose difficulty')}">${DIFFICULTY_KEYS.map(
      (id) => {
        const opponent = opponentCopy(id, view.lang);
        return `<button type="button" class="home-opponent${difficulty === id ? ' is-active' : ''}" data-action="choose-difficulty" data-difficulty="${id}" aria-pressed="${difficulty === id}"><span class="home-opponent-index">${opponent.index}</span><strong>${opponent.name}</strong><small>${opponent.trait}</small></button>`;
      },
    ).join('')}</div>
  </div>`;
}

export function homeMarkup(_state, view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  return `<section class="manga-home" data-scene="home" aria-labelledby="homeTitle">
    <div class="home-scene" aria-hidden="true"><div class="home-scene-art"></div><div class="home-scene-art home-figure-layer home-figure-left" data-parallax="0.5"></div><div class="home-scene-art home-figure-layer home-figure-right" data-parallax="0.26"></div><div class="home-light" data-parallax="0.14"></div><svg class="home-table-line" data-motion-line data-parallax="0.2" viewBox="0 0 1000 250" preserveAspectRatio="none"><ellipse class="home-water-ring" cx="500" cy="120" rx="487" ry="108"/><ellipse class="home-table-rim" cx="500" cy="120" rx="450" ry="84"/><path d="M50 120v14c0 47 201 84 450 84s450-37 450-84v-14M78 146c58 35 220 60 422 60s364-25 422-60"/><ellipse cx="500" cy="120" rx="423" ry="70"/></svg></div>
    <div class="home-center"><p class="eyebrow">A GAME OF AIR. A TEST OF NERVE.</p>
      <h1 id="homeTitle" aria-label="${c('空气扑克', 'Air Poker')}">${c('空气<span>扑克</span>', 'Air<span>Poker</span>')}</h1><p class="home-tagline">${c('你下注的，是下一口空气。', 'Your next breath is on the table.')}</p>
      ${matchSetupMarkup(view)}
      <button class="button primary home-enter" data-action="enter-match">${c('开始对局', 'Enter the match')} <span aria-hidden="true">→</span></button>
      <div class="home-secondary"><button data-action="open-playbook">${c('了解玩法', 'How to play')}</button><span aria-hidden="true">／</span><button data-action="open-tutorial">${c('先练一次', 'Try the tutorial')}</button></div>
    </div>
    <footer class="home-foot"><div class="home-foot-copy"><p>${c('本地单人', 'SINGLE PLAYER')}<span>25 AIR × 2</span>${c('最高五轮结算', 'UP TO FIVE ROUNDS TO SETTLE.')}</p><p class="manga-credit">${translate(view.lang, 'mangaSource')}</p></div><div class="home-foot-actions">${view.hasLastRecord ? `<button data-action="previous-record">${c('最近完成局', 'Last completed match')} ↗</button>` : '<span class="home-edition">THE ABYSS / 01</span>'}<a id="homeStarLink" class="star-link" href="https://github.com/wychmod/air-poker" target="_blank" rel="noopener noreferrer" aria-label="${c('前往 GitHub 为项目点 Star（新标签页打开）', 'Star this project on GitHub (opens in a new tab)')}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.78 5.63 6.22.91-4.5 4.38 1.06 6.2L12 17.19l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg>${c('给项目点个 Star', 'Star on GitHub')}<span aria-hidden="true">↗</span></a></div></footer>
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
    <header class="narrative-heading"><p class="eyebrow">THE RULES OF SURVIVAL</p><h1 id="introductionTitle">${c('先看解说。再理解规则。', 'Watch the story. Learn the rules.')}</h1><p>${c('先看视频解说理解空气赌局，再通过下方图解熟悉本作玩法。', 'Start with the original story commentary, then explore this game’s rules in the illustrated guide below.')}</p></header>
    <section class="source-feature" aria-labelledby="sourceVideoTitle">
      <div class="source-feature-heading"><h2 id="sourceVideoTitle">${c('原作解说', 'Behind the game')}</h2><span>${c('建议先观看，再阅读下方规则', 'WATCH FIRST. THEN EXPLORE THE RULES.')}</span></div>
      <a class="source-video" href="https://www.bilibili.com/video/BV1T84y177Cz/" target="_blank" rel="noopener noreferrer" aria-labelledby="sourceVideoName sourceVideoWatch" aria-describedby="sourceVideoNotice">
        <div class="source-video-cover">
          <img src="assets/runtime/original-commentary.webp" width="865" height="540" loading="eager" decoding="async" alt="${c('视频封面：《噬谎者》空气扑克篇，水下对峙的两位赌徒', 'Video thumbnail: two gamblers face off underwater in Usogui’s Air Poker arc')}">
          <span class="source-video-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 5.5v13l10-6.5Z"/></svg></span>
          <span class="source-video-duration" aria-label="${c('时长 57 分 26 秒', 'Duration: 57 minutes, 26 seconds')}">57:26</span>
        </div>
        <div class="source-video-copy">
          <div class="source-video-kicker"><span>BILIBILI</span><span>${c('中文 · 完整解说', 'CHINESE · FULL COMMENTARY')}</span></div>
          <h3 id="sourceVideoName">${c('水下，以空气为赌注的致命扑克。', 'Underwater. Every wager is a breath.')}</h3>
          <p class="source-video-description">${c('跟随这支《噬谎者》「空气扑克」篇解说，了解原作中的规则、心理博弈与逆转。', 'Explore the rules, mind games and reversals of the original Air Poker arc in Usogui.')}</p>
          <p class="source-video-author">${c('视频作者', 'BY')}<span>浪里白朴piao</span></p>
          <div class="source-video-bottom"><span class="source-video-cta" id="sourceVideoWatch">${c('前往 B 站观看', 'Watch on Bilibili')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></span><span class="source-video-notice" id="sourceVideoNotice">${c('含剧情剧透 · 新标签页打开', 'Story spoilers · Opens in a new tab')}</span></div>
        </div>
      </a>
    </section>
    <div class="concept-grid">
      <article class="concept-panel" data-action="preview-concept" id="concept-hand-panel" tabindex="0" aria-labelledby="concept-hand-title"><div class="concept-top"><span>01</span><span>THE HAND</span></div><div class="concept-demo" data-concept="hand"><div class="concept-hand">${cards}</div><div class="sum-line">4 + 4 + 4 + 5 + 7 <b>= 24</b></div></div><h2 id="concept-hand-title">${c('数字，是目标和。', 'The number is your target.')}</h2><p>${c('挑选一张数字牌，用五张不同实体牌凑齐点数和。目标 24 可以组成三条；和的大小不代表牌型强弱。', 'Choose a target, then name five different cards that add up to it. This 24 is three of a kind. A larger total is not a stronger hand.')}</p></article>
      <article class="concept-panel" data-action="preview-concept" id="concept-bet-panel" tabindex="0" aria-labelledby="concept-bet-title"><div class="concept-top"><span>02</span><span>THE WAGER</span></div><div class="concept-demo" data-concept="bet"><div class="air-demo"><div><span class="draw-canister">AIR</span><small>${c('未开储备', 'RESERVE')}</small></div><span class="air-transfer">+1 →</span><div class="demo-pot"><b>2 → 3</b><small>${c('底池', 'POT')}</small></div></div><span class="supply-stays">◉ ${c('当前呼吸罐继续供气', 'The open can keeps supplying air')}</span></div><h2 id="concept-bet-title">${c('没开封的空气罐，才能下注。', 'Bet only your unopened cans.')}</h2><p>${c('正在供你呼吸的那一罐，不能拿来下注。双方下得一样多、底池里有 2 罐时，你最多再加 1 罐。对手跟上后，还会轮到你行动；如果双方接连选择不加注（过牌），就进入摊牌。', 'The can you are breathing from is off the table. If both players have bet the same amount and the pot holds 2 cans, you can add at most 1. If the opponent matches your bet, it is your turn again. If both players check in a row, the hands are revealed.')}</p></article>
      <article class="concept-panel" data-action="preview-concept" id="concept-risk-panel" tabindex="0" aria-labelledby="concept-risk-title"><div class="concept-top"><span>03</span><span>THE REVEAL</span></div><div class="concept-demo" data-concept="risk"><div class="risk-pair"><div class="risk-hand"><small>${c('四条 · 胜', 'Four of a kind · wins')}</small>${lessonCards(
        [
          ['4', '♠'],
          ['4', '♥'],
          ['4', '♦'],
          ['4', '♣'],
          ['8', '♠'],
        ],
      )}</div><div class="risk-hand"><small>${c('三条 · 负', 'Three of a kind · loses')}</small>${lessonCards(
        [
          ['4', '♠'],
          ['4', '♥'],
          ['4', '♦'],
          ['5', '♣'],
          ['7', '♠'],
        ],
      )}</div></div><span class="risk-caption">${c('撞牌：4♠、4♥、4♦（红框）', 'Shared cards: 4♠, 4♥, 4♦ (outlined)')}</span></div><h2 id="concept-risk-title">${c('赢的人，拿走双方的下注。', 'The winner collects both bets.')}</h2><p>${c('双方各押 6 罐，四条赢过三条。胜者收走底池里的 12 罐：拿回自己的 6 罐，赢走对手的 6 罐。', 'Each player bets 6 cans. Four of a kind beats three of a kind, so the winner collects all 12: their own 6 back, plus the opponent’s 6.')}</p><p class="risk-explanation">${c('图中两手都用了红框里的三张牌，触发「灾厄」。假设败者还剩 18 罐，就得额外放空 6 罐，这部分不归胜者。只同点数、花色不同不算撞牌；弃牌不追加这项处罚。', 'The three outlined cards appear in both hands, triggering calamity. With 18 cans left, the loser must vent another 6; the winner does not receive them. Matching ranks in different suits do not count. Folding adds no calamity penalty.')}</p></article>
    </div>
    <p class="manga-credit">${translate(view.lang, 'mangaSource')}</p>
    <footer class="narrative-footer"><button class="button secondary" data-action="open-rules">${c('查看完整规则', 'Read full rules')}</button><div><button class="button secondary" data-action="open-tutorial">${c('进入教学', 'Try the tutorial')}</button><button class="button primary" data-action="enter-match">${c('开始对局', 'Enter the match')} →</button></div></footer>
  </section>`;
}

function pokerReferenceMarkup(lang) {
  const c = (zh, en) => copy(lang, zh, en);
  const hand = (faces) =>
    lessonCards(faces.split(' ').map((face) => [face.slice(0, -1), face.slice(-1)]));
  const ranks = [
    [
      c('皇家同花顺', 'Royal flush'),
      c(
        '同花色的 10、J、Q、K、A，最大的同花顺。',
        '10, J, Q, K, A of one suit: the highest straight flush.',
      ),
      '10♠ J♠ Q♠ K♠ A♠',
    ],
    [
      c('同花顺', 'Straight flush'),
      c('同花色，且五张点数连续。', 'Five consecutive ranks, all of one suit.'),
      '5♥ 6♥ 7♥ 8♥ 9♥',
    ],
    [
      c('四条', 'Four of a kind'),
      c('四张同点数，加一张其他牌。', 'Four cards of one rank, plus one other card.'),
      '8♠ 8♥ 8♦ 8♣ K♠',
    ],
    [
      c('葫芦', 'Full house'),
      c('三张同点数，加一对。', 'Three cards of one rank, plus a pair.'),
      'Q♠ Q♥ Q♦ 3♣ 3♥',
    ],
    [
      c('同花', 'Flush'),
      c('五张同花色，点数不连续。', 'Five cards of one suit, with nonconsecutive ranks.'),
      'A♣ J♣ 8♣ 6♣ 2♣',
    ],
    [
      c('顺子', 'Straight'),
      c('五张点数连续，花色可以不同。', 'Five consecutive ranks; suits can differ.'),
      '4♠ 5♥ 6♣ 7♦ 8♠',
    ],
    [
      c('三条', 'Three of a kind'),
      c('三张同点数，加两张不同点数的单牌。', 'Three cards of one rank, plus two unpaired cards.'),
      '7♠ 7♥ 7♦ K♣ 2♠',
    ],
    [
      c('两对', 'Two pair'),
      c('两组对子，加一张单牌。', 'Two different pairs, plus one other card.'),
      'K♠ K♥ 5♦ 5♣ 2♠',
    ],
    [
      c('一对', 'One pair'),
      c('一组对子，加三张不同点数的单牌。', 'One pair, plus three unpaired cards.'),
      'J♠ J♥ 9♦ 6♣ 3♠',
    ],
    [
      c('高牌', 'High card'),
      c(
        '以上都没凑成，就从最大的一张开始比。',
        'None of the above: compare from the highest card down.',
      ),
      'A♠ J♥ 8♦ 6♣ 3♠',
    ],
  ];
  return `<section id="rule-poker" aria-labelledby="pokerReferenceTitle">
    <p class="eyebrow">07</p><h2 id="pokerReferenceTitle">${c('德州牌型速查', 'Texas Hold’em hand rankings')}</h2>
    <p class="poker-reference-intro">${c('记住五张牌的大小，就能看懂摊牌。本作沿用德州扑克的牌型比较；组牌仍要凑齐你的数字牌点数。', 'Use these five-card rankings to read a showdown. Air Poker uses the same hand rankings as Texas Hold’em; your five cards still have to add up to your target.')}</p>
    <div class="poker-ranks-heading"><strong>${c('牌型从强到弱', 'STRONGEST TO WEAKEST')}</strong><span>${c('每手均为五张牌示例', 'FIVE-CARD EXAMPLES')}</span></div>
    <ol class="poker-ranks" role="list">${ranks.map(([name, description, faces], index) => `<li><span class="poker-rank-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div class="poker-rank-copy"><h3>${name}</h3><p>${description}</p></div>${hand(faces)}</li>`).join('')}</ol>
    <div class="poker-comparisons"><h3>${c('同牌型，怎么分胜负？', 'How do you break a tie?')}</h3>
      <p>${c('单张从大到小：A、K、Q、J、10 … 2。先比组成牌型的牌：四条先比四张相同牌的点数，葫芦先比三条，两对先比大对再比小对。还是一样，就从大到小比剩下的单牌（踢脚牌）；顺子比最大的一张，同花和高牌逐张比。', 'Individual cards rank A, K, Q, J, 10 … 2, highest first. Compare the cards that make the hand first: quads by rank, full houses by the triple first, and two pairs by the higher pair then the lower. If still tied, compare the remaining cards (kickers) from highest to lowest. Straights compare their top card; flushes and high-card hands compare all five in descending order.')}</p>
      <article class="poker-comparison"><h4>${c('同是一对 A，K 踢脚赢 Q 踢脚', 'Same pair of aces: a king kicker beats a queen')}</h4><div class="poker-matchup"><figure><figcaption>${c('胜 · 先比到 K', 'WIN · K kicker')}</figcaption>${hand('A♠ A♥ K♣ 9♦ 8♠')}</figure><figure><figcaption>${c('负 · 先比到 Q', 'LOSE · Q kicker')}</figcaption>${hand('A♣ A♦ Q♠ J♥ 9♣')}</figure></div></article>
      <article class="poker-comparison"><h4>${c('A2345 是最小顺子，输给 23456', 'A2345 is the lowest straight; 23456 beats it')}</h4><div class="poker-matchup"><figure><figcaption>${c('胜 · 6 高顺子', 'WIN · Six-high straight')}</figcaption>${hand('2♠ 3♥ 4♣ 5♦ 6♠')}</figure><figure><figcaption>${c('负 · 5 高顺子', 'LOSE · Five-high straight')}</figcaption>${hand('A♣ 2♥ 3♠ 4♦ 5♣')}</figure></div><p>${c('A 通常最大，也能放在 2345 前组成最小顺子；QKA23 不能首尾相接。凑目标点数时，A 始终算 1。', 'Aces are normally high, but can precede 2345 to make the lowest straight. QKA23 cannot wrap around. For your target sum, an ace always counts as 1.')}</p></article>
      <p class="poker-suit-note">${c('花色不分大小。两手牌型和逐张点数完全一样，就是平局；例如两手都是 A2345 顺子，即使花色不同也打平。', 'Suits have no ranking. If the hand type and every compared rank match, it is a tie. For example, two A2345 straights tie even with different suits.')}</p>
    </div>
  </section>`;
}

export function rulesMarkup(lang) {
  const c = (zh, en) => copy(lang, zh, en);
  const chapters = [
    [
      'flow',
      c('回合流程', 'Round flow'),
      c(
        '双方各有 25 罐。开局打开一罐，24 罐可下注。每轮依次选数字、构造完整五张成手、交替下注、摊牌；最多五轮，然后进入耐息。对手在你选择前已经锁定自己的数字与成手。',
        'Each player starts with 25 cans, opens one, and has 24 to wager. Each round: choose a number, lock a five-card hand, alternate bets, reveal. After at most five rounds, endurance begins. The opponent locks its choice before you choose.',
      ),
    ],
    [
      'hand',
      c('数字与组牌', 'Numbers and hands'),
      c(
        '每轮选一张数字牌，用 5 张没用过的扑克牌凑出这个点数。A=1，J/Q/K=11/12/13；牌型大小按德州扑克比较，A2345 是最小顺子。数字牌不补发，前几轮双方用过的扑克牌不能再用。你有 60 秒组牌，可手选或用推荐；超时、放弃或组错都算失败。',
        'Play one number card, then pick 5 unused playing cards that add up to it. A=1, J/Q/K=11/12/13. Hands rank as in Texas Hold’em; A2345 is the lowest straight. Number cards are not replaced, and neither player can reuse cards from earlier rounds. You have 60 seconds to build your hand, by hand or with a recommendation. Running out of time, giving up or submitting an invalid hand counts as a failure.',
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
  return `<div class="full-rules"><nav aria-label="${c('规则章节', 'Rule chapters')}">${[...chapters, ['poker', c('德州牌型速查', 'Poker hand rankings')]].map(([id, title], index) => `<a href="#rule-${id}"><span>0${index + 1}</span>${title}</a>`).join('')}</nav><div class="rules-chapters">${chapters.map(([id, title, body], index) => `<section id="rule-${id}"><p class="eyebrow">0${index + 1}</p><h2>${title}</h2><p>${body}</p></section>`).join('')}${pokerReferenceMarkup(lang)}</div></div>`;
}

export function introMarkup(view) {
  const c = (zh, en) => copy(view.lang, zh, en);
  const { opponent, contract, kind } = matchModeSummary(view);
  const goalLabel = kind === 'difficulty' ? c('本档目标', 'LEVEL GOAL') : c('契约', 'CONTRACT');
  const goalDetail =
    contract.id === 'none'
      ? c('标准对局，没有额外目标。双方各 25 罐。', 'Open match, no extra goal. 25 cans each.')
      : contract.detail;
  return `<section class="match-intro" data-scene="intro"><div class="intro-slash" aria-hidden="true"></div><p class="eyebrow">FIVE TARGETS. ONE LAST BREATH.</p><div class="intro-matchup"><span>${c('你', 'YOU')}</span><em>VS</em><span>${c('对手', 'Opponent')}</span></div><p class="intro-mode"><span>${kind === 'difficulty' ? c('难度', 'DIFFICULTY') : c('对手', 'OPPONENT')} · ${opponent.name}</span><i>${goalLabel} · ${contract.latin}</i></p><p>${goalDetail}</p><button class="button secondary" data-action="skip-intro">${c('跳过表现', 'Skip intro')} →</button></section>`;
}

export function resultMarkup(state, view) {
  if (state.phase !== 'summary' || !['player', 'ai', 'tie'].includes(state.winner)) return '';
  const c = (zh, en) => copy(view.lang, zh, en);
  const record = view.matchRecord;
  const {
    opponent,
    contract,
    kind: modeKind,
  } = record ? modeSummary(record, view.lang) : matchModeSummary(view);
  const contractResult = contractResultCopy(contractResultFor(record), view.lang, modeKind);
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
  return `<section class="result-page result-${kind}" data-scene="${kind}" aria-labelledby="resultTitle"><button class="result-skip" data-action="skip-ending">${c('跳过收尾', 'Skip ending')} <span aria-hidden="true">×</span></button>
    ${kind === 'draw' ? '<div class="paper-figures" aria-hidden="true"></div><div class="draw-waterline" data-motion-line aria-hidden="true"></div>' : `<div class="result-art" aria-hidden="true" data-parallax="0.26">${kind === 'victory' ? '<svg class="victory-arc" viewBox="0 0 500 500"><path data-motion-ink d="M80 420 Q-20 180 280 50 Q450 5 440 210"/></svg>' : ''}<img src="${resultAssets[kind]}" alt="" data-motion-reveal /></div>`}
    <div class="result-copy" data-parallax="0.08"><p class="eyebrow">${kind === 'victory' ? 'THE LAST BREATH IS YOURS' : kind === 'defeat' ? 'THE ABYSS REMEMBERS' : 'A PERFECT EQUILIBRIUM'}</p><h1 id="resultTitle">${title}</h1><p class="result-tagline">${tagline}</p><p class="result-reason">${reason}</p>
      <dl class="result-facts"><div><dt>${c('完成轮次', 'Rounds completed')}</dt><dd>${state.completedRounds} / ${state.maxRounds}</dd></div><div><dt>${c('对局时长', 'Match duration')}</dt><dd>${duration}</dd></div><div><dt>${c('实际烧毁', 'Actually burned')}</dt><dd>${state.accounting?.burned ?? 0} AIR</dd></div><div><dt>${modeKind === 'difficulty' ? c('难度', 'Difficulty') : c('对手', 'Opponent')}</dt><dd data-result-mode>${opponent.name}</dd></div><div><dt>${modeKind === 'difficulty' ? c('本档目标', 'Level goal') : c('契约', 'Contract')}</dt><dd>${contract.name}</dd></div></dl>
      ${contractResult ? `<div class="result-contract${contractResult.complete ? ' is-complete' : ' is-missed'}" data-contract-result="${contractResult.id}"><span class="result-contract-stamp">${contractResult.status}</span><div><strong>${contractResult.name} · ${contractResult.latin}</strong><p>${contractResult.detail}</p><small>${contractResult.note}</small></div></div>` : ''}
      <div class="result-actions"><button class="button primary" data-action="enter-match">${kind === 'draw' ? c('再较量一局', 'Play again') : c('再来一局', 'Play again')} →</button><button class="button secondary" data-action="open-record">${c('查看复盘', 'Review match')}</button><button class="button secondary" data-action="share-result">${c('分享战报', 'Share card')}</button></div><button class="result-home" data-action="go-home">← ${c('返回首页', 'Back to home')}</button>
    </div>
  </section>${comicRecapMarkup(record, view.lang)}`;
}
