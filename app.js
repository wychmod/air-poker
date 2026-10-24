import { BET_SECONDS, createGame } from './game/engine.js';
import { isLanguage, translate } from './i18n.js';
import { createRenderer } from './ui/render.js';

function savedLanguage() {
  try {
    return localStorage.getItem('air-poker-lang') === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

const game = createGame();
const renderer = createRenderer(document);
const view = { lang: savedLanguage(), screen: 'home', timer: BET_SECONDS };
let timerHandle = null;
let introHandle = null;
let toastHandle = null;

const render = () => renderer.render(game.getState(), view);

function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

function startTimer(seconds = BET_SECONDS) {
  stopTimer();
  view.timer = seconds;
  const deadline = performance.now() + seconds * 1000;
  timerHandle = setInterval(() => {
    // Throttled background tabs still use actual elapsed time.
    view.timer = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    const node = document.getElementById('betTimer');
    if (node) node.textContent = view.timer;
    if (view.timer === 0) {
      stopTimer();
      dispatch({ type: 'bet', action: 'check' });
    }
  }, 250);
}

function dispatch(action) {
  const previous = game.getState().phase;
  if (!game.dispatch(action)) return false;
  const phase = game.getState().phase;
  if (phase !== previous) {
    if (phase === 'bet') startTimer();
    else stopTimer();
  }
  render();
  return true;
}

function setScreen(screen) {
  view.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart(withIntro) {
  stopTimer();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
  document.getElementById('toast').classList.remove('show');
  game.reset();
  view.timer = BET_SECONDS;
  setScreen(withIntro ? 'intro' : 'game');
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
}

// One listener handles the static shell and replaced phase templates.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action], [data-lang]');
  if (!button || button.disabled) return;
  const { action, lang } = button.dataset;
  if (lang) {
    setLanguage(lang);
    return;
  }
  switch (action) {
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
      });
      break;
  }
});

window.addEventListener('pagehide', () => {
  stopTimer();
  clearTimeout(introHandle);
  clearTimeout(toastHandle);
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  if (view.screen === 'intro') setScreen('game');
  if (game.getState().phase === 'bet') startTimer(view.timer);
});

render();
