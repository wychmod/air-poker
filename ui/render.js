import { translate, pageCopy } from '../i18n.js';
import { rankHand, effectiveHand } from '../game/rules.js';
import { STARTING_AIR } from '../game/engine.js';

export function createRenderer(document) {
  let state;
  let view;
  let usedIds = new Set();
  const $ = (id) => document.getElementById(id);
  const t = (key, values) => translate(view.lang, key, values);
  const p = (key) => pageCopy(view.lang, key);
  const lines = (key) => t(key).split('|').join('<br>');

  function applyStaticI18n() {
    const map = {
      brandEyebrow: 'brandEyebrow',
      liveLink: 'liveLink',
      singlePlayer: 'singlePlayer',
      dossier: 'dossierLabel',
      opponent: 'opponentLabel',
      stable: 'breathStable',
      trace: 'roundTraceLabel',
      house: 'houseNoteLabel',
      houseCopy: 'houseNote',
      round: 'roundLabel',
      pot: 'potLabel',
      deck: 'deckLabel',
      remaining: 'deckRemaining',
      feed: 'feedLabel',
      discard: 'discardLabel',
      tip: 'tipText',
      rulesKicker: 'rulesKicker',
      rulesTitle: 'rulesTitle',
      rulesCopy: 'rulesCopy',
      rulesNote: 'rulesNote',
    };
    Object.entries(map).forEach(([key, id]) => {
      $(id).innerHTML = key === 'houseCopy' || key === 'tip' ? lines(key) : t(key);
    });
    $('rulesButton').title = t('rules');
    $('rulesButton').ariaLabel = t('rules');
    $('restartButton').title = t('restart');
    $('restartButton').ariaLabel = t('restart');
    $('closeRules').ariaLabel = view.lang === 'zh' ? '关闭规则' : 'CLOSE RULES';
    document.documentElement.lang = view.lang === 'zh' ? 'zh-CN' : 'en';
    document.title =
      view.lang === 'zh' ? 'AIR POKER // 水下生存局' : 'AIR POKER // UNDERWATER SURVIVAL';
    document.querySelectorAll('.lang-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.lang === view.lang);
      button.setAttribute('aria-pressed', button.dataset.lang === view.lang);
    });
  }

  function cardMarkup(c, used = usedIds.has(c.id)) {
    return /* HTML */ `<span
      title="${used ? t('usedCard') : ''}"
      class="playing-card ${c.red ? 'red' : ''} ${used ? 'used-card' : ''}"
      ><span class="rank">${c.rank}</span><span class="suit">${c.suit}</span></span
    >`;
  }

  function cardBacks() {
    return '<span class="playing-card card-back">?</span>'.repeat(5);
  }

  function renderLower() {
    return /* HTML */ `<div class="surface-instruction">
        <div>
          <span class="target-tag">${t('lowerKicker')}</span>
          <h3>${t('lowerTitle')}</h3>
        </div>
        <p>${t('lowerCopy')}</p>
      </div>
      <div class="number-row">
        ${state.targets.map((target, i) => /* HTML */ `<button class="number-card ${state.usedTargets.includes(i) ? 'used' : ''}" ${state.usedTargets.includes(i) ? 'disabled' : ''} data-action="choose-target" data-index="${i}"><span class="card-index">0${i + 1}</span><strong>${target}</strong><small>${t('available')}</small><em>${t('targetAir')}</em></button>`).join('')}
      </div>
      <div class="surface-actions">
        <span class="action-note">${t('lowerCopy')}</span
        ><button class="ghost-button" data-action="target-help">↗</button>
      </div>`;
  }

  function renderUpper() {
    return /* HTML */ `<div class="surface-instruction">
        <div>
          <span class="target-tag">TARGET ${state.playerTarget} // UPPER</span>
          <h3>${t('upperTitle')}</h3>
        </div>
        <p>${t('upperCopy')}</p>
      </div>
      <div class="candidate-grid">
        ${state.candidates
          .map(
            (candidate, i) =>
              /* HTML */ `<button
                class="candidate-card ${i === state.selectedCandidate ? 'selected' : ''}"
                data-action="select-candidate"
                data-index="${i}"
              >
                <div class="candidate-head">
                  <strong>${t(candidate.rank.key)}</strong
                  ><span>SCORE ${candidate.rank.score}</span>
                </div>
                <div class="mini-cards">${candidate.hand.map((c) => cardMarkup(c)).join('')}</div>
              </button>`,
          )
          .join('')}
      </div>
      <div class="surface-actions">
        <button class="recommend-button" data-action="recommend-hand">✦ ${t('recommend')}</button
        ><button class="primary-button" data-action="confirm-hand">${t('lock')} →</button>
      </div>`;
  }

  function renderBet() {
    return /* HTML */ `<div class="surface-instruction">
        <div>
          <span class="target-tag">${t('betKicker')}</span>
          <h3>${t('betTitle')}</h3>
        </div>
        <p>${t('betCopy')}</p>
      </div>
      <div class="bet-layout">
        <div class="locked-hand">
          <div class="hand-label">
            ${t('you')} // ${t(rankHand(effectiveHand(state.playerHand, state.discard)).key)}
          </div>
          <div class="hand-cards">${state.playerHand.map((c) => cardMarkup(c)).join('')}</div>
          <p class="action-note">
            TARGET ${state.playerTarget} · ${t('currentPot')} ${state.pot} AIR
          </p>
        </div>
        <div class="bet-panel">
          <div class="bet-panel-head">
            <span>${t('currentPot')}</span><strong>${state.pot}</strong>
          </div>
          <div class="bet-actions">
            <button class="bet-button" data-action="bet" data-bet="check">${t('check')}</button
            ><button class="bet-button" data-action="bet" data-bet="call">${t('call')}</button>
            <div class="raise-control">
              <input
                id="raiseAmount"
                type="number"
                min="1"
                max="4"
                value="2"
                aria-label="${t('raise')}"
              /><span>AIR</span
              ><button
                class="bet-button"
                data-action="bet"
                data-bet="raise"
                ${Math.min(state.playerAir, state.aiAir) <= 0 ? 'disabled' : ''}
              >
                ${t('raise')} ↗
              </button>
            </div>
            <button class="bet-button danger" data-action="bet" data-bet="fold">${t('fold')}</button
            ><button
              class="bet-button danger"
              data-action="bet"
              data-bet="all-in"
              ${Math.min(state.playerAir, state.aiAir) <= 0 ? 'disabled' : ''}
            >
              ${t('allin')}
            </button>
          </div>
          <div class="bet-timer">
            <span class="timer-ring" id="betTimer">${view.timer}</span><span>${t('timer')}</span>
          </div>
        </div>
      </div>`;
  }

  function renderShowdown() {
    const result = state.lastResult || {};
    const playerWon = result.winner === 'player';
    const tie = result.winner === 'tie';
    const title = tie ? t('resultTie') : playerWon ? t('resultWin') : t('resultLose');
    const playerCards = result.folded
      ? cardBacks()
      : state.playerHand.map((c) => cardMarkup(c)).join('');
    const continueLabel =
      state.round >= state.maxRounds || state.playerAir <= 0 || state.aiAir <= 0
        ? t('final')
        : t('next');
    return /* HTML */ `<div class="surface-instruction">
        <div>
          <span class="target-tag">${t('showdownKicker')}</span>
          <h3>${t('showdownTitle')}</h3>
        </div>
        <p>${t('showdownCopy')}</p>
      </div>
      <div class="showdown-layout">
        <div class="showdown-hand ${playerWon ? 'winner' : tie ? '' : 'loser'}">
          <div class="showdown-hand-head">
            <span
              >${t('you')} //
              ${result.folded ? t('fold') : t(result.playerRank?.key || 'noHand')}</span
            ><strong>${state.playerTarget}</strong>
          </div>
          <div class="hand-cards">${playerCards}</div>
        </div>
        <div class="showdown-vs">VS</div>
        <div class="showdown-hand ${!playerWon && !tie ? 'winner' : tie ? '' : 'loser'}">
          <div class="showdown-hand-head">
            <span>${t('cpu')} // ${t(result.aiRank?.key || 'noHand')}</span
            ><strong>${state.aiTarget}</strong>
          </div>
          <div class="hand-cards">${state.aiHand.map((c) => cardMarkup(c)).join('')}</div>
        </div>
      </div>
      <div class="result-banner ${result.calamity && !tie ? 'calamity' : ''}">
        <strong>${result.calamity && !tie ? t('calamity') : title}</strong
        ><span
          >${result.calamity && !tie ? t('calamityCopy', { n: result.overlap.length }) : tie ? t('sameHand') : t('poolDone', { n: state.playerBet + state.aiBet })}</span
        >
      </div>
      <div class="surface-actions">
        <span class="action-note">${t('showdownKicker')}</span
        ><button class="primary-button" data-action="advance-round">${continueLabel} →</button>
      </div>`;
  }

  function renderSummary() {
    const win = state.playerAir > state.aiAir;
    const tie = state.playerAir === state.aiAir;
    const verdict = tie ? t('draw') : win ? t('survivor') : t('drowned');
    const copy = tie ? t('drawCopy') : win ? t('survivorCopy') : t('drownedCopy');
    return /* HTML */ `<div class="surface-instruction">
        <div>
          <span class="target-tag">${t('summaryKicker')}</span>
          <h3>${t('summaryTitle')}</h3>
        </div>
        <p>${t('summaryCopy')}</p>
      </div>
      <div class="summary-layout">
        <div class="summary-hero ${win ? '' : 'lose'}">
          <span>FINAL VERDICT</span>
          <h3>${verdict}</h3>
          <p>${copy}</p>
        </div>
        <div class="summary-stats">
          <div class="summary-stat">
            <span>${t('finalAir')} / ${t('you')}</span
            ><strong>${Math.max(0, state.playerAir)}</strong>
          </div>
          <div class="summary-stat">
            <span>${t('finalAir')} / ${t('cpu')}</span><strong>${Math.max(0, state.aiAir)}</strong>
          </div>
          <div class="summary-stat"><span>${t('rounds')}</span><strong>${state.round}</strong></div>
          <div class="summary-stat">
            <span>${t('used')}</span><strong>${state.discard.length}</strong>
          </div>
        </div>
      </div>
      <div class="surface-actions">
        <span class="action-note">${t('summaryKicker')}</span
        ><button class="primary-button" data-action="reset-game">${t('again')} ↻</button>
      </div>`;
  }

  function renderFeed() {
    $('feedList').innerHTML = state.feed
      .map(
        (item) =>
          `<div class="feed-item"><span class="feed-time">${item.time}</span><div class="feed-message"><strong>${item.strong}</strong>${t(item.key, item.args.nameKey ? { ...item.args, name: t(item.args.nameKey) } : item.args)}</div></div>`,
      )
      .join('');
  }

  function renderTrace() {
    $('traceCount').textContent = `${String(Math.min(state.round, 5)).padStart(2, '0')} / 05`;
    $('traceList').innerHTML = Array.from({ length: 5 }, (_, i) => {
      const trace = state.traces[i];
      const label = trace
        ? trace.winner === 'player'
          ? 'YOU'
          : trace.winner === 'tie'
            ? 'DRAW'
            : 'CPU'
        : i + 1 === state.round
          ? 'LIVE'
          : 'LOCKED';
      return /* HTML */ `<div
        class="trace-row ${i + 1 === state.round ? 'active' : ''} ${trace ? 'done' : ''}"
      >
        <span class="trace-num">R${i + 1}</span><span class="trace-line"></span
        ><span>${label}</span>
      </div>`;
    }).join('');
  }

  function renderGame() {
    applyStaticI18n();
    const meta = {
      lower: ['lowerKicker', 'lowerTitle', 'lowerWait', 'waiting'],
      upper: ['upperKicker', 'upperTitle', 'locked', 'preview'],
      bet: ['betKicker', 'betTitle', 'betWait', 'call'],
      showdown: ['showdownKicker', 'showdownTitle', 'showdownWait', 'showdownWait'],
      summary: ['summaryKicker', 'summaryTitle', 'summaryTitle', 'summaryTitle'],
    }[state.phase];
    $('phaseKicker').textContent = t(meta[0]);
    $('phaseTitle').textContent = t(meta[1]);
    $('roundNumber').textContent = String(state.round).padStart(2, '0');
    $('playerStatus').textContent = t(meta[3]);
    $('aiStatus').textContent = t(meta[2]);
    $('playerTargetText').textContent =
      state.playerTarget == null
        ? `${view.lang === 'zh' ? '目标值' : 'TARGET'}: ${view.lang === 'zh' ? '未公开' : 'HIDDEN'}`
        : `TARGET: ${state.playerTarget}`;
    $('aiTargetText').textContent =
      state.aiTarget == null
        ? `${view.lang === 'zh' ? '目标值' : 'TARGET'}: ${view.lang === 'zh' ? '未公开' : 'HIDDEN'}`
        : `TARGET: ${state.aiTarget}`;
    $('playerAirText').textContent = `${t('air')} ${Math.max(0, state.playerAir)}`;
    $('aiAirText').textContent = `${t('air')} ${Math.max(0, state.aiAir)}`;
    $('playerAirMeter').style.width =
      `${Math.min(100, (Math.max(0, state.playerAir) / STARTING_AIR) * 100)}%`;
    $('aiAirMeter').style.width =
      `${Math.min(100, (Math.max(0, state.aiAir) / STARTING_AIR) * 100)}%`;
    $('potText').textContent = String(state.pot).padStart(2, '0');
    $('deckCount').textContent = state.deck;
    $('discardCount').textContent = String(state.discard.length).padStart(2, '0');
    $('breathText').textContent =
      state.phase === 'summary' ? t('summaryKicker') : t('breath', { n: 1 });
    $('playSurface').innerHTML =
      state.phase === 'lower'
        ? renderLower()
        : state.phase === 'upper'
          ? renderUpper()
          : state.phase === 'bet'
            ? renderBet()
            : state.phase === 'showdown'
              ? renderShowdown()
              : renderSummary();
    $('discardFan').innerHTML = state.discard.length
      ? state.discard
          .slice(-3)
          .map((c) => cardMarkup(c))
          .join('')
      : '<span>—</span><span>—</span><span>—</span>';
    renderTrace();
    renderFeed();
  }

  function applyPageCopy() {
    const map = {
      homeLive: 'homeLive',
      homeMode: 'homeMode',
      homeKicker: 'homeKicker',
      homeSubtitle: 'homeSubtitle',
      enter: 'enterGameLabel',
      playbook: 'playbookLabel',
      system: 'homeSystem',
      playbookKicker: 'playbookKicker',
      playbookTitle: 'playbookTitle',
      card1Title: 'playbookCard1Title',
      card1Copy: 'playbookCard1Copy',
      card2Title: 'playbookCard2Title',
      card2Copy: 'playbookCard2Copy',
      card3Title: 'playbookCard3Title',
      card3Copy: 'playbookCard3Copy',
      playbookFooter: 'playbookFooter',
      enterTable: 'playbookEnterLabel',
      close: 'closeLabel',
      introKicker: 'introKicker',
      introCopy: 'introCopy',
      introReady: 'introReady',
    };
    Object.entries(map).forEach(([key, id]) => {
      const node = $(id);
      if (node) node.textContent = p(key);
    });
  }

  return {
    render(snapshot, viewState) {
      state = snapshot;
      view = viewState;
      usedIds = new Set(
        state.phase === 'showdown'
          ? state.lastResult.usedCardIds
          : state.discard.map((card) => card.id),
      );
      applyPageCopy();
      renderGame();
      $('rulesGrid').innerHTML = [1, 2, 3, 4]
        .map((n) => /* HTML */ `<div><b>0${n}</b><span>${t(`step${n}`)}</span></div>`)
        .join('');
      document.querySelectorAll('.screen-page').forEach((page) => {
        page.classList.toggle('page-visible', page.id === `${view.screen}Screen`);
      });
      document.querySelector('.screen-stack').hidden = view.screen === 'game';
      const stage = $('tableStage');
      stage.dataset.phase = state.phase;
      stage.classList.toggle(
        'calamity-mode',
        Boolean(
          state.lastResult?.calamity &&
          state.lastResult.winner !== 'tie' &&
          state.phase === 'showdown',
        ),
      );
    },
  };
}
