import { battleMarkup, updateBattleBreathing } from './battle.js';
import { homeMarkup, introductionMarkup, rulesMarkup, resultMarkup, introMarkup } from './pages.js';
import { tutorialMarkup } from './tutorial.js';

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
      <div class="language-switch" role="group" aria-label="Language"><button data-lang="zh" aria-pressed="${view.lang === 'zh'}">中</button><button data-lang="en" aria-pressed="${view.lang === 'en'}">EN</button></div></nav>`;
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
