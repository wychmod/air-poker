import { BET_SECONDS, UPPER_SECONDS, createGame } from './game/engine.js';
import { createTurnClock } from './browser/turn-clock.js';
import { createMatchClock } from './browser/match-clock.js';
import { createRecordStore } from './browser/record-store.js';
import { createSceneMotion } from './browser/scene-motion.js';
import { createVisitCounter } from './browser/visit-counter.js';
import { createShareExporter } from './browser/share.js';
import { shareSummary, shareCopy, shareImageSvg } from './ui/share.js';
import { isLanguage, translate } from './i18n.js';
import { createRenderer } from './ui/render.js';
import { cardMarkup, updateBetPreview } from './ui/battle.js';
import { createTutorial, tutorialAction } from './ui/tutorial.js';
import { reviewMarkup, reviewEvents } from './ui/review.js';
import { syncHandDraft, editHandDraft, getDraftStatus } from './ui/hand-builder.js';

function stored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function persist(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences remain usable in memory. */
  }
}
const $ = (id) => document.getElementById(id);
let game = null;
const currentState = () => game?.getState() ?? { phase: 'idle', sessionId: 0 };
const renderer = createRenderer(document);
const visitCounter = createVisitCounter({ root: $('siteVisits') });
const motion = createSceneMotion({ root: $('app'), canvas: $('sceneCanvas') });
const defaultLanguage = document.documentElement.lang === 'en' ? 'en' : 'zh';
const savedLanguage = stored('air-poker-lang', defaultLanguage);
const view = {
  lang: isLanguage(savedLanguage) ? savedLanguage : defaultLanguage,
  screen: 'home',
  timer: BET_SECONDS,
  selectedTarget: null,
  handDraft: null,
  tutorial: createTutorial(),
  motionEnabled: stored('air-poker-motion', 'on') !== 'off',
  hasLastRecord: false,
};
motion.setEnabled(view.motionEnabled);
const c = (zh, en) => (view.lang === 'en' ? en : zh);
let introHandle = null;
let toastHandle = null;
let reviewHandle = null;
let conceptHandle = null;
let lastScreen = 'home';
const recordStore = createRecordStore();
const savedRecord = recordStore.load();
let lastRecord = savedRecord.record;
let storageStatus = savedRecord.status;
let savedSession = null;
let matchStarted = false;
let abandoned = false;
let shownRecord = null;
let recordSource = 'current';
let review = { round: 'all', event: 0, attempt: 0, playing: false };
let pendingNavigation = null;
let utility = 'settings';
const returnActions = new Map();

function activeMatch() {
  return matchStarted && !abandoned && currentState().phase !== 'summary';
}
function liveClocks() {
  const text = activeMatch()
    ? c('对局继续', 'Match continues') +
      (['upper', 'bet'].includes(currentState().phase) && view.timer != null
        ? ' · ' + view.timer + 's'
        : '')
    : '';
  document.querySelectorAll('.live-clock').forEach((node) => {
    node.textContent = text;
  });
}
function render() {
  const snapshot = currentState();
  view.handDraft = syncHandDraft(snapshot, view.handDraft);
  if (matchStarted && snapshot.phase === 'summary' && savedSession !== snapshot.sessionId) {
    lastRecord = game.getRecord();
    storageStatus = recordStore.save(lastRecord) ? 'saved' : 'memory';
    savedSession = snapshot.sessionId;
  }
  view.hasLastRecord = Boolean(lastRecord);
  view.roundRecord =
    snapshot.phase === 'showdown'
      ? game.getRecord().rounds.find((round) => round.number === snapshot.round)
      : null;
  motion.capture(snapshot, view);
  renderer.render(snapshot, view);
  updateBetPreview(document, snapshot, view.lang);
  motion.update(snapshot, view);
  liveClocks();
}
function openDialog(id) {
  const dialog = $(id);
  if (dialog.open) return;
  returnActions.set(id, {
    action: document.activeElement?.dataset?.action,
    id: document.activeElement?.id,
    element: document.activeElement,
  });
  dialog.showModal();
  liveClocks();
}
function restoreDialogFocus(id) {
  const ref = returnActions.get(id);
  const target = ref?.element?.isConnected
    ? ref.element
    : ref?.id
      ? $(ref.id)
      : ref?.action
        ? document.querySelector('[data-action="' + ref.action + '"]')
        : null;
  if (target && !target.disabled) target.focus({ preventScroll: true });
  else $('pageContent').focus({ preventScroll: true });
}
function closeDialog(id) {
  $(id).close();
}
function stopReview() {
  clearTimeout(reviewHandle);
  reviewHandle = null;
  review.playing = false;
}
function renderRecord() {
  const focused = document.activeElement;
  const focusData = focused?.closest('#recordContent') ? { ...focused.dataset } : null;
  const focusId = focused?.id;
  const listScroll = document.querySelector('.review-event-list')?.scrollTop ?? 0;
  const t = (key) => translate(view.lang, key);
  for (const [id, key] of Object.entries({
    recordTitle: 'recordTitle',
    currentRecord: 'recordCurrent',
    previousRecord: 'recordPrevious',
    refreshRecord: 'recordRefresh',
    exportRecord: 'recordExport',
  }))
    $(id).textContent = t(key);
  $('closeRecord').textContent = '← ' + c('返回', 'Back');
  $('closeRecord').ariaLabel = t('recordClose');
  $('currentRecord').disabled = !matchStarted;
  $('previousRecord').disabled = !lastRecord;
  $('refreshRecord').disabled = recordSource !== 'current' || !matchStarted;
  $('exportRecord').disabled = !shownRecord;
  $('shareRecord').textContent = c('分享战报', 'Share card');
  $('shareRecord').disabled = !shareSummary(shownRecord);
  $('recordStorageStatus').textContent = t(
    recordSource === 'previous' || shownRecord?.status === 'completed'
      ? 'storage_' + storageStatus
      : 'recordSnapshot',
  );
  $('recordContent').innerHTML = reviewMarkup(shownRecord, view, review);
  if (document.querySelector('.review-event-list'))
    document.querySelector('.review-event-list').scrollTop = listScroll;
  if (focusData && !focused.isConnected) {
    const replacement = focusId
      ? $(focusId)
      : [...$('recordContent').querySelectorAll('[data-action]')].find((node) =>
          Object.entries(focusData).every(([key, value]) => node.dataset[key] === value),
        );
    replacement?.focus({ preventScroll: true });
  }
  liveClocks();
}
function showRecord(source) {
  stopReview();
  recordSource = source;
  shownRecord = source === 'previous' ? lastRecord : matchStarted ? game.getRecord() : null;
  const round = shownRecord?.rounds.at(-1);
  review = {
    round: round?.number ?? 'all',
    attempt: Math.max(0, (round?.attempts.length ?? 1) - 1),
    event: 0,
    playing: false,
  };
  review.event = Math.max(0, reviewEvents(shownRecord, review.round).length - 1);
  renderRecord();
  openDialog('recordDialog');
}
function scheduleReview() {
  clearTimeout(reviewHandle);
  if (!review.playing) return;
  reviewHandle = setTimeout(() => {
    const events = reviewEvents(shownRecord, review.round);
    if (review.event >= events.length - 1) {
      stopReview();
      renderRecord();
      return;
    }
    review.event++;
    renderRecord();
    scheduleReview();
  }, 1100);
}
let sharingRecord = null;
const shareExporter = createShareExporter({ document, notify: toast });
function showShare(record) {
  const model = shareSummary(record);
  if (!model) {
    toast(c('请在对局完成后生成战报。', 'Finish a match to create its share card.'));
    return;
  }
  sharingRecord = record;
  $('shareTitle').textContent = c('把这一局，留成一张战报。', 'Your match. On one card.');
  $('shareDialog')
    .querySelectorAll('[data-lang]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.lang === view.lang)),
    );
  $('shareIntro').textContent = c(
    '保存图片，或把游戏分享给下一位对手。',
    'Save the image or invite someone to take the next seat.',
  );
  $('shareLinkLabel').textContent = c('试玩链接', 'Play link');
  $('copyShareLink').textContent = c('复制链接', 'Copy link');
  $('closeShare').ariaLabel = c('关闭战报', 'Close share card');
  openDialog('shareDialog');
  void shareExporter.prepare({
    ...shareCopy(model, view.lang),
    svg: shareImageSvg(model, view.lang),
    messages: {
      save: c('保存战报图片', 'Save PNG'),
      share: c('系统分享', 'Share'),
      loading: c('正在生成战报…', 'Creating your card…'),
      ready: c('战报已就绪。图片和链接都可以分享。', 'Your card is ready to save or share.'),
      failed: c(
        '图片暂时无法生成。仍可复制试玩链接，关闭后可重试。',
        'Could not create the image. Copy the play link or reopen to retry.',
      ),
      refreshFailed: c(
        '图片更新失败，仍显示切换前的语言。可复制试玩链接，或关闭后重试。',
        'Could not update the image. The preview is still in the previous language. Copy the play link or reopen to retry.',
      ),
      downloaded: c(
        '已发起图片下载；手机也可长按预览保存。',
        'Download started. On mobile, you can also hold the preview to save.',
      ),
      shared: c('已交给系统分享。', 'Sent to the system share sheet.'),
      cancelled: c(
        '已取消分享，战报仍可保存。',
        'Share cancelled. Your card is still ready to save.',
      ),
      shareFailed: c(
        '系统分享不可用，请保存图片或复制链接。',
        'Sharing is unavailable. Save the PNG or copy the link.',
      ),
      copied: c('试玩链接已复制。', 'Play link copied.'),
      manualCopy: c(
        '请长按或使用 Ctrl/Cmd+C 复制已选中的链接。',
        'Hold the selected link or press Ctrl/Cmd+C to copy it.',
      ),
    },
  });
}

function exportRecord() {
  if (!shownRecord) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(shownRecord, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'air-poker-' + shownRecord.matchId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const turnClock = createTurnClock({
  seconds: BET_SECONDS,
  upperSeconds: UPPER_SECONDS,
  onTick(remaining) {
    view.timer = remaining;
    if ($('turnTimer')) {
      $('turnTimer').textContent = remaining == null ? '—' : remaining;
      $('turnTimer')
        .closest('.battle-timer')
        ?.classList.toggle('is-urgent', remaining != null && remaining <= 10);
    }
    liveClocks();
  },
  onPlayerTimeout: (turnId) => dispatch({ type: 'bet-timeout', turnId }),
  onCpuTurn: (turnId) => dispatch({ type: 'cpu-bet', turnId }),
  onUpperTimeout: (attemptId) => dispatch({ type: 'upper-timeout', attemptId }),
});
const matchClock = createMatchClock({
  onPulse(action) {
    const before = currentState();
    if (!game.dispatch(action)) return;
    const after = currentState();
    if (
      after.phase !== before.phase ||
      after.playerAir !== before.playerAir ||
      after.aiAir !== before.aiAir ||
      after.betting?.turnId !== before.betting?.turnId ||
      after.upper?.attemptId !== before.upper?.attemptId
    ) {
      matchClock.sync(after);
      turnClock.sync(after);
      render();
    } else renderer.updateBreathing(after);
  },
});
function dispatch(action) {
  if (!game) return false;
  matchClock.flush();
  if (!game.dispatch(action)) {
    if (!['bet-timeout', 'cpu-bet', 'upper-timeout'].includes(action.type))
      toast(
        c('当前阶段已变化，请按最新提示操作。', 'The phase changed. Follow the current prompt.'),
      );
    return false;
  }
  matchClock.sync(currentState());
  turnClock.sync(currentState());
  render();
  return true;
}
function setScreen(screen) {
  clearTimeout(conceptHandle);
  lastScreen = view.screen;
  view.screen = screen;
  render();
  if (lastScreen !== screen) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const title = $('pageContent').querySelector('h1, h2');
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }
}
function closeAllDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}
function restart(withIntro) {
  turnClock.clear();
  matchClock.clear();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
  stopReview();
  closeAllDialogs();
  $('toast').classList.remove('show');
  if (game) game.reset();
  else {
    const recordId =
      globalThis.crypto?.randomUUID?.() ??
      'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    game = createGame({ recordId });
  }
  matchStarted = true;
  abandoned = false;
  view.timer = BET_SECONDS;
  view.selectedTarget = null;
  setScreen(withIntro ? 'intro' : 'game');
  matchClock.sync(currentState());
  if (withIntro) introHandle = setTimeout(() => setScreen('game'), 1350);
}
function navigate(action) {
  if (action === 'enter-match' || action === 'reset-game') {
    restart(action === 'enter-match');
    return;
  }
  if (activeMatch()) {
    abandoned = true;
    turnClock.clear();
    matchClock.clear();
    clearTimeout(introHandle);
  }
  closeAllDialogs();
  if (action === 'open-tutorial') {
    view.tutorial = createTutorial();
    setScreen('tutorial');
  } else setScreen(action === 'open-playbook' ? 'playbook' : 'home');
}
function requestNavigation(action) {
  if (!activeMatch()) {
    navigate(action);
    return;
  }
  pendingNavigation = action;
  $('confirmTitle').textContent = c('离开当前对局？', 'Leave this match?');
  $('confirmCopy').textContent = c(
    '当前对局尚未结束。确认后会结束本次游玩，不计入已完成记录。',
    'This match is unfinished. Leaving ends this session without saving a completed result.',
  );
  $('confirmCancel').textContent = c('继续对局', 'Keep playing');
  $('confirmAccept').textContent = c('确认离开', 'Leave match');
  openDialog('confirmDialog');
}
function toast(message) {
  clearTimeout(toastHandle);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastHandle = setTimeout(() => $('toast').classList.remove('show'), 2400);
}
function renderUtility() {
  $('utilityTitle').textContent =
    utility === 'settings' ? c('设置', 'Settings') : c('已用实体牌', 'Used physical cards');
  if (utility === 'settings') {
    $('utilityContent').innerHTML =
      `<div class="settings-list"><label><input id="motionSetting" type="checkbox" ${view.motionEnabled ? 'checked' : ''}/><span>${c('装饰与事件动效', 'Decorative and event motion')}<small>${c('系统减少动态效果优先。关闭动效不会暂停对局时间。', 'System reduced-motion takes priority. Disabling motion does not pause match time.')}</small></span></label><div class="button-row"><button class="button secondary" data-action="open-tutorial">${c('进入教学', 'Practice')}</button><button class="button secondary" data-action="open-playbook">${c('游戏介绍', 'How to play')}</button><button class="button secondary" data-action="go-home">${c('返回首页', 'Home')}</button>${activeMatch() ? '<button class="button secondary" data-action="reset-game">' + c('重新开局', 'New match') + '</button>' : ''}</div><a href="motion-demo.html">${c('打开独立动态漫画示例', 'Open the motion study')} ↗</a></div>`;
  } else {
    const state = currentState();
    $('utilityContent').innerHTML =
      `<p>${c('这些实体牌已使用，后续成手不可再次使用。同点数不同花色是不同实体。', 'These physical cards cannot be used again. Equal ranks of different suits are different cards.')}</p><div class="discard-grid">${state.discard.length ? state.discard.map((card) => cardMarkup(card)).join('') : '<p>' + c('尚无已用牌。', 'No cards used yet.') + '</p>'}</div>`;
  }
}
function setLanguage(lang) {
  if (!isLanguage(lang)) return;
  view.lang = lang;
  persist('air-poker-lang', lang);
  render();
  if ($('recordDialog').open) renderRecord();
  if ($('utilityDialog').open) renderUtility();
  if ($('shareDialog').open && sharingRecord) showShare(sharingRecord);
}
// All authoritative actions go through dispatch; tutorial and playback change view state only.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action], [data-lang]');
  if (!button || button.disabled) return;
  const data = { ...button.dataset };
  matchClock.flush();
  const { action, lang } = data;
  if (lang) {
    setLanguage(lang);
    return;
  }
  if (action?.startsWith('tutorial-')) {
    view.tutorial = tutorialAction(view.tutorial, action, data);
    render();
    return;
  }
  switch (action) {
    case 'enter-match':
    case 'reset-game':
    case 'go-home':
    case 'open-playbook':
    case 'open-tutorial':
      requestNavigation(action);
      break;
    case 'close-playbook':
      requestNavigation('go-home');
      break;
    case 'confirm-leave': {
      const next = pendingNavigation;
      pendingNavigation = null;
      closeDialog('confirmDialog');
      if (next) navigate(next);
      break;
    }
    case 'cancel-leave':
      pendingNavigation = null;
      closeDialog('confirmDialog');
      break;
    case 'skip-intro':
      clearTimeout(introHandle);
      setScreen('game');
      break;
    case 'open-rules':
      openDialog('rulesDialog');
      break;
    case 'close-rules':
      closeDialog('rulesDialog');
      break;
    case 'open-settings':
    case 'open-discard':
      utility = action === 'open-settings' ? 'settings' : 'discard';
      renderUtility();
      openDialog('utilityDialog');
      break;
    case 'close-utility':
      closeDialog('utilityDialog');
      break;
    case 'open-record':
      showRecord(matchStarted ? 'current' : 'previous');
      break;
    case 'current-record':
    case 'refresh-record':
      showRecord('current');
      break;
    case 'previous-record':
      showRecord('previous');
      break;
    case 'close-record':
      closeDialog('recordDialog');
      break;
    case 'share-result':
      showShare(matchStarted ? game.getRecord() : lastRecord);
      break;
    case 'share-record':
      showShare(shownRecord);
      break;
    case 'close-share':
      closeDialog('shareDialog');
      break;
    case 'save-share':
      shareExporter.download();
      break;
    case 'native-share':
      void shareExporter.share();
      break;
    case 'copy-share':
      void shareExporter.copy();
      break;
    case 'export-record':
      exportRecord();
      break;
    case 'review-round':
      stopReview();
      review.round = data.round;
      review.attempt = Math.max(
        0,
        (shownRecord?.rounds.find((item) => item.number === Number(data.round))?.attempts.length ??
          1) - 1,
      );
      review.event = 0;
      renderRecord();
      break;
    case 'review-attempt':
      review.attempt = Number(data.index);
      renderRecord();
      break;
    case 'review-event':
      stopReview();
      review.event = Number(data.index);
      renderRecord();
      break;
    case 'review-restart':
      stopReview();
      review.event = 0;
      renderRecord();
      break;
    case 'review-play':
      if (review.playing) stopReview();
      else {
        if (review.event >= reviewEvents(shownRecord, review.round).length - 1) review.event = 0;
        review.playing = true;
      }
      renderRecord();
      scheduleReview();
      break;
    case 'play-concept': {
      clearTimeout(conceptHandle);
      document
        .querySelectorAll('.concept-demo')
        .forEach((node) => node.classList.remove('is-playing'));
      const node = document.querySelector('.concept-demo[data-concept="' + data.concept + '"]');
      if (node) {
        void node.offsetWidth;
        node.classList.add('is-playing');
        button.textContent = c('重播 ↗', 'Replay ↗');
        conceptHandle = setTimeout(() => node.classList.remove('is-playing'), 2200);
      }
      break;
    }
    case 'choose-target': {
      const state = currentState(),
        index = Number(data.index);
      if (state.phase === 'lower' && state.targetPlayable[index]) {
        view.selectedTarget = index;
        render();
      }
      break;
    }
    case 'confirm-target': {
      const index = view.selectedTarget;
      if (Number.isInteger(index) && dispatch({ type: 'choose-target', index }))
        view.selectedTarget = null;
      break;
    }
    case 'select-candidate':
    case 'toggle-hand-card':
    case 'filter-hand-suit':
    case 'clear-hand': {
      const state = currentState();
      const next = editHandDraft(state, view.handDraft, action, data);
      if (next === view.handDraft) {
        if (
          action === 'toggle-hand-card' &&
          state.phase === 'upper' &&
          Number(data.attempt) === state.upper.attemptId &&
          view.handDraft?.cardIds.length === 5
        )
          toast(
            c(
              '已选满五张，请先移除一张再替换。',
              'Five cards selected. Remove one before replacing it.',
            ),
          );
        break;
      }
      view.handDraft = next;
      render();
      break;
    }
    case 'submit-hand': {
      const state = currentState();
      if (state.phase !== 'upper' || Number(data.attempt) !== state.upper.attemptId) break;
      const draft = getDraftStatus(state, view.handDraft);
      if (draft.complete)
        dispatch({ type: 'submit-hand', attemptId: Number(data.attempt), hand: draft.hand });
      break;
    }
    case 'confirm-hand':
    case 'fail-hand':
      dispatch({ type: action, attemptId: Number(data.attempt) });
      break;
    case 'advance-round':
      view.selectedTarget = null;
      dispatch({ type: action });
      break;
    case 'fast-forward':
      dispatch({ type: action, sessionId: currentState().sessionId });
      break;
    case 'max-raise':
      if ($('raiseAmount')) {
        $('raiseAmount').value = currentState().legalBets.maxRaise;
        updateBetPreview(document, currentState(), view.lang);
      }
      break;
    case 'bet': {
      if (data.move === 'raise' && !$('raiseAmount')?.reportValidity()) return;
      dispatch({
        type: 'bet',
        action: data.move,
        amount: Number($('raiseAmount')?.value),
        turnId: Number(data.turn),
      });
      break;
    }
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'raiseAmount') updateBetPreview(document, currentState(), view.lang);
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'reviewSeek') {
    stopReview();
    review.event = Number(event.target.value);
    renderRecord();
  }
  if (event.target.id === 'motionSetting') {
    view.motionEnabled = event.target.checked;
    persist('air-poker-motion', view.motionEnabled ? 'on' : 'off');
    motion.setEnabled(view.motionEnabled);
  }
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('close', () => {
    if (dialog.id === 'recordDialog') stopReview();
    if (dialog.id === 'shareDialog') {
      shareExporter.clear();
      sharingRecord = null;
    }
    restoreDialogFocus(dialog.id);
  });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    matchClock.flush();
    stopReview();
  } else {
    matchClock.flush();
    if (activeMatch()) turnClock.sync(currentState());
    if ($('recordDialog').open) renderRecord();
  }
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    visitCounter.destroy();
    shareExporter.clear();
  }
  matchClock.flush();
  matchClock.suspend();
  turnClock.suspend();
  motion.suspend();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
  clearTimeout(conceptHandle);
  stopReview();
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  if (activeMatch()) {
    matchClock.sync(currentState());
    turnClock.sync(currentState());
  }
  if (view.screen === 'intro') view.screen = 'game';
  motion.resume();
  render();
});
render();
