import { battleMarkup, updateBattleBreathing } from './battle.js';
import { homeMarkup, introductionMarkup, rulesMarkup, resultMarkup, introMarkup } from './pages.js';
import { tutorialMarkup } from './tutorial.js';
import { translate } from '../i18n.js';

const copy = (lang, zh, en) => (lang === 'en' ? en : zh);

export function createRenderer(document) {
  const content = document.getElementById('pageContent');
  let previous = null;
  function renderHeader(state, view) {
    const t = (zh, en) => copy(view.lang, zh, en);
    const battle = view.screen === 'game' && state.phase !== 'summary';
    document.getElementById('siteHeader').innerHTML = `
      <button class="brand" data-action="go-home" aria-label="${t('返回首页', 'Home')}"><span class="brand-emblem">A/P</span><span>${t('空气扑克', 'Air Poker')}<small>${t('水下生存局', 'BENEATH THE SURFACE')}</small></span></button>
      <nav aria-label="${t('主导航', 'Main navigation')}">
      ${battle ? `<button class="nav-link" data-action="open-rules">${t('规则', 'Rules')}</button><button class="nav-link" data-action="open-discard">${t('弃牌', 'Used cards')}</button><button class="nav-link" data-action="open-record">${t('记录', 'Record')}</button>` : `<button class="nav-link" data-action="open-playbook">${t('游戏介绍', 'How to play')}</button><button class="nav-link" data-action="open-tutorial">${t('新手教学', 'Practice')}</button>`}
      <button class="nav-link settings-link" data-action="open-settings" aria-label="${t('设置', 'Settings')}">${t('设置', 'Settings')}</button>
      <div class="language-switch" role="group" aria-label="Language"><button data-lang="zh" aria-pressed="${view.lang === 'zh'}">中</button><button data-lang="en" aria-pressed="${view.lang === 'en'}">EN</button></div>
      <a id="repositoryLink" class="repository-link" href="https://github.com/wychmod/air-poker" target="_blank" rel="noopener noreferrer" aria-label="${t('GitHub 仓库（新标签页打开）', 'GitHub repository (opens in a new tab)')}" title="wychmod/air-poker"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.72-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.09-1.16 3.09-1.16.62 1.55.23 2.69.12 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"/></svg><span>GitHub <span aria-hidden="true">↗</span></span></a></nav>`;
  }
  return {
    updateBreathing(snapshot) {
      updateBattleBreathing(
        document,
        snapshot,
        document.documentElement.lang === 'en' ? 'en' : 'zh',
      );
    },
    render(snapshot, view) {
      const active = document.activeElement;
      const focusKey = active?.matches('[data-action], [data-lang]') ? { ...active.dataset } : null;
      const focusId = active?.id;
      const input = document.getElementById('raiseAmount');
      const keepInput =
        previous?.sessionId === snapshot.sessionId &&
        previous?.turnId === snapshot.betting?.turnId &&
        previous?.phase === snapshot.phase;
      const inputValue = keepInput ? input?.value : null;
      const scene =
        view.screen === 'game' && snapshot.phase === 'summary'
          ? snapshot.winner === 'player'
            ? 'victory'
            : snapshot.winner === 'ai'
              ? 'defeat'
              : 'draw'
          : view.screen;
      document.documentElement.lang = view.lang === 'en' ? 'en' : 'zh-CN';
      document.title = copy(view.lang, '空气扑克 · 下一口空气', 'Air Poker · Your Next Breath');
      document.body.dataset.scene = scene;
      document.getElementById('app').dataset.scene = scene;
      const visits = document.getElementById('siteVisits');
      if (visits) {
        visits.hidden = view.screen !== 'home';
        visits.title = translate(view.lang, 'visitCountHint');
        document.getElementById('visitCountLabel').textContent = translate(view.lang, 'visitCount');
        document.getElementById('visitCountImage').alt = translate(view.lang, 'visitCount');
        for (const status of ['loading', 'local', 'unavailable']) {
          visits.querySelector(`[data-visit-status="${status}"]`).textContent = translate(
            view.lang,
            `visitCount_${status}`,
          );
        }
      }
      renderHeader(snapshot, view);
      content.innerHTML =
        view.screen === 'home'
          ? homeMarkup(snapshot, view)
          : view.screen === 'playbook'
            ? introductionMarkup(view)
            : view.screen === 'tutorial'
              ? tutorialMarkup(view.tutorial, view)
              : view.screen === 'intro'
                ? introMarkup(view)
                : snapshot.phase === 'summary'
                  ? resultMarkup(snapshot, view)
                  : battleMarkup(snapshot, view);
      document.getElementById('rulesTitle').textContent = copy(
        view.lang,
        '完整规则',
        'Complete rules',
      );
      if (previous?.lang !== view.lang)
        document.getElementById('rulesContent').innerHTML = rulesMarkup(view.lang);
      if (inputValue != null && document.getElementById('raiseAmount'))
        document.getElementById('raiseAmount').value = inputValue;
      if (active && !active.isConnected && active !== document.body) {
        const same = focusId
          ? document.getElementById(focusId)
          : focusKey
            ? [...document.querySelectorAll('[data-action], [data-lang]')].find(
                (node) =>
                  Object.entries(focusKey).every(([key, value]) => node.dataset[key] === value) &&
                  !node.disabled,
              )
            : null;
        if (same && !same.disabled) same.focus({ preventScroll: true });
        else {
          const title = content.querySelector('h1, h2');
          if (title) {
            title.tabIndex = -1;
            title.focus({ preventScroll: true });
          }
        }
      }
      previous = {
        sessionId: snapshot.sessionId,
        turnId: snapshot.betting?.turnId,
        phase: snapshot.phase,
        screen: view.screen,
        lang: view.lang,
      };
    },
  };
}
