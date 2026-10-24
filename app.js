import { BET_SECONDS, UPPER_SECONDS, createGame } from './game/engine.js';
import { createTurnClock } from './browser/turn-clock.js';
import { createMatchClock } from './browser/match-clock.js';
import { createRecordStore } from './browser/record-store.js';
import { isLanguage, translate } from './i18n.js';
import { createRenderer } from './ui/render.js';
import { recordMarkup } from './ui/record.js';

function savedLanguage() {
  try {
    return localStorage.getItem('air-poker-lang') === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

const game = createGame({ recordId: crypto.randomUUID() });
const renderer = createRenderer(document);
const view = { lang: savedLanguage(), screen: 'home', timer: BET_SECONDS };
let introHandle = null;
let toastHandle = null;
const recordStore = createRecordStore();
const savedRecord = recordStore.load();
let lastRecord = savedRecord.record;
let storageStatus = savedRecord.status;
let savedSession = null;
let matchStarted = false;
let shownRecord = null;
let recordSource = 'current';

const render = () => {
  const snapshot = game.getState();
  if (matchStarted && snapshot.phase === 'summary' && savedSession !== snapshot.sessionId) {
    lastRecord = game.getRecord();
    storageStatus = recordStore.save(lastRecord) ? 'saved' : 'memory';
    savedSession = snapshot.sessionId;
  }
  renderer.render(snapshot, view);
};

function renderRecord() {
  const t = (key) => translate(view.lang, key);
  for (const [id, key] of Object.entries({
    recordTitle: 'recordTitle',
    currentRecord: 'recordCurrent',
    previousRecord: 'recordPrevious',
    refreshRecord: 'recordRefresh',
    exportRecord: 'recordExport',
  }))
    document.getElementById(id).textContent = t(key);
  document.getElementById('closeRecord').ariaLabel = t('recordClose');
  document.getElementById('currentRecord').disabled = !matchStarted;
  document.getElementById('previousRecord').disabled = !lastRecord;
  document.getElementById('refreshRecord').disabled = recordSource !== 'current' || !matchStarted;
  document.getElementById('exportRecord').disabled = !shownRecord;
  document.getElementById('recordStorageStatus').textContent = t(
    recordSource === 'previous' || shownRecord?.status === 'completed'
      ? `storage_${storageStatus}`
      : 'recordSnapshot',
  );
  document.getElementById('recordContent').innerHTML = recordMarkup(shownRecord, view.lang);
}

function showRecord(source) {
  recordSource = source;
  shownRecord = source === 'previous' ? lastRecord : matchStarted ? game.getRecord() : null;
  renderRecord();
  const dialog = document.getElementById('recordDialog');
  if (!dialog.open) dialog.showModal();
}

function exportRecord() {
  if (!shownRecord) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(shownRecord, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `air-poker-${shownRecord.matchId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const turnClock = createTurnClock({
  seconds: BET_SECONDS,
  upperSeconds: UPPER_SECONDS,
  onTick(remaining) {
    view.timer = remaining;
    const node = document.getElementById('betTimer');
    if (node) node.textContent = remaining == null ? '…' : remaining;
    const upper = document.getElementById('upperTimer');
    if (upper) upper.textContent = remaining;
  },
  onPlayerTimeout(turnId) {
    dispatch({ type: 'bet-timeout', turnId });
  },
  onCpuTurn(turnId) {
    dispatch({ type: 'cpu-bet', turnId });
  },
  onUpperTimeout(attemptId) {
    dispatch({ type: 'upper-timeout', attemptId });
  },
});

const matchClock = createMatchClock({
  onPulse(action) {
    const before = game.getState();
    if (!game.dispatch(action)) return;
    const after = game.getState();
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
  matchClock.flush();
  if (!game.dispatch(action)) return false;
  matchClock.sync(game.getState());
  turnClock.sync(game.getState());
  render();
  return true;
}

function setScreen(screen) {
  view.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart(withIntro) {
  turnClock.clear();
  matchClock.clear();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
  document.getElementById('toast').classList.remove('show');
  game.reset();
  matchStarted = true;
  document.getElementById('recordDialog').close();
  view.timer = BET_SECONDS;
  setScreen(withIntro ? 'intro' : 'game');
  matchClock.sync(game.getState());
  if (withIntro) introHandle = setTimeout(() => setScreen('game'), 1350);
}

function toast(message) {
  clearTimeout(toastHandle);
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  toastHandle = setTimeout(() => node.classList.remove('show'), 2200);
}

function setLanguage(lang) {
  if (!isLanguage(lang)) return;
  view.lang = lang;
  try {
    localStorage.setItem('air-poker-lang', lang);
  } catch {
    /* Continue when browser storage is unavailable. */
  }
  render();
  if (document.getElementById('recordDialog').open) renderRecord();
}

// One listener handles the static shell and replaced phase templates.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action], [data-lang]');
  if (!button || button.disabled) return;
  matchClock.flush();
  const { action, lang } = button.dataset;
  if (lang) {
    setLanguage(lang);
    return;
  }
  switch (action) {
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
      document.getElementById('recordDialog').close();
      break;
    case 'export-record':
      exportRecord();
      break;
    case 'enter-match':
      restart(true);
      break;
    case 'reset-game':
      restart(false);
      break;
    case 'open-playbook':
      setScreen('playbook');
      break;
    case 'close-playbook':
      setScreen('home');
      break;
    case 'open-rules':
      document.getElementById('rulesDialog').showModal();
      break;
    case 'close-rules':
      document.getElementById('rulesDialog').close();
      break;
    case 'target-help':
      toast(translate(view.lang, 'lowerCopy'));
      break;
    case 'choose-target':
    case 'select-candidate':
      dispatch({ type: action, index: Number(button.dataset.index) });
      break;
    case 'confirm-hand':
    case 'fail-hand':
      dispatch({ type: action, attemptId: Number(button.dataset.attempt) });
      break;
    case 'fast-forward':
      dispatch({ type: action, sessionId: game.getState().sessionId });
      break;
    case 'advance-round':
      dispatch({ type: action });
      break;
    case 'recommend-hand':
      if (dispatch({ type: action })) toast(translate(view.lang, 'recommend'));
      break;
    case 'bet':
      if (
        button.dataset.bet === 'raise' &&
        !document.getElementById('raiseAmount').reportValidity()
      ) {
        return;
      }
      dispatch({
        type: 'bet',
        action: button.dataset.bet,
        amount: Number(document.getElementById('raiseAmount')?.value),
        turnId: Number(button.dataset.turn),
      });
      break;
  }
});

window.addEventListener('pagehide', () => {
  matchClock.flush();
  matchClock.suspend();
  turnClock.suspend();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  if (view.screen === 'intro') setScreen('game');
  matchClock.sync(game.getState());
  turnClock.sync(game.getState());
  render();
});

render();
