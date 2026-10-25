import { ready, renderAt } from './film.js';
import { DURATION, SCENES, CAPTIONS, sceneAt } from './timeline.js';
const $ = (id) => document.getElementById(id);
const capture = new URLSearchParams(location.search).has('capture');
let time = 0,
  playing = false,
  handle = 0,
  origin = 0;
const audio = $('score');
const clock = (t) =>
  Math.floor(t / 60)
    .toString()
    .padStart(2, '0') +
  ':' +
  Math.floor(t % 60)
    .toString()
    .padStart(2, '0');
function paint() {
  renderAt(time);
  $('seek').value = time;
  $('time').value = clock(time) + ' / 01:12';
  for (const b of $('scenes').children)
    b.setAttribute('aria-current', String(b.dataset.scene === sceneAt(time).id));
}
function pause() {
  playing = false;
  cancelAnimationFrame(handle);
  audio.pause();
  $('play').textContent = '播放';
}
async function play() {
  if (time >= DURATION) time = 0;
  playing = true;
  origin = performance.now() - time * 1000;
  audio.currentTime = time;
  if ($('sound').checked) {
    try {
      await audio.play();
    } catch {
      pause();
      $('status').textContent = '声音未能播放，请检查音轨或取消声音后重试。';
      return;
    }
  }
  $('play').textContent = '暂停';
  handle = requestAnimationFrame(frame);
}
function frame(now) {
  if (!playing) return;
  time = Math.min(DURATION, (now - origin) / 1000);
  if ($('sound').checked && !audio.paused && Math.abs(audio.currentTime - time) > 0.15)
    audio.currentTime = time;
  paint();
  if (time >= DURATION) pause();
  else handle = requestAnimationFrame(frame);
}
function seek(t) {
  pause();
  time = Math.max(0, Math.min(DURATION, t));
  audio.currentTime = time;
  paint();
}
for (const s of SCENES) {
  const b = document.createElement('button');
  b.textContent = clock(s.start) + ' ' + s.label;
  b.dataset.scene = s.id;
  b.addEventListener('click', () => seek(s.start + 0.5));
  $('scenes').append(b);
}
for (const [start, , copy] of CAPTIONS) {
  const li = document.createElement('li');
  li.textContent = clock(start) + ' — ' + copy;
  $('transcript').append(li);
}
$('play').addEventListener('click', () => (playing ? pause() : play()));
$('restart').addEventListener('click', () => seek(0));
$('seek').addEventListener('input', (e) => seek(Number(e.target.value)));
$('sound').addEventListener('change', () => {
  if (!$('sound').checked) audio.pause();
  else if (playing) {
    audio.currentTime = time;
    audio.play().catch(() => pause());
  }
});
$('fullscreen').addEventListener('click', () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.querySelector('.stage').requestFullscreen(),
);
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,button,summary,a')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    playing ? pause() : play();
  } else if (e.code === 'ArrowRight') seek(time + 5);
  else if (e.code === 'ArrowLeft') seek(time - 5);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('pagehide', pause);
try {
  await ready;
  if (!capture) {
    $('play').disabled = false;
    $('restart').disabled = false;
    paint();
    $('status').textContent = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? '已按减少动态效果偏好暂停；可手动播放或逐镜查看。'
      : '空格播放 / 暂停 · 方向键定位 · 点击镜头查看';
  }
} catch (e) {
  $('status').textContent = '素材未就绪：' + e.message + '。请先运行 npm run promo:prepare。';
  throw e;
}
