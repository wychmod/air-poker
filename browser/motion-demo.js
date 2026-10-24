// A presentation-only timeline. It never reads or changes a game session.
const root = document.querySelector('#motionDemo');
const stage = document.querySelector('#motionStage');
const canvas = document.querySelector('#motionCanvas');
const context = canvas?.getContext('2d');
const timeline = document.querySelector('#timeline');
const timeReadout = document.querySelector('#timeReadout');
const playButton = document.querySelector('#playButton');
const playLabel = document.querySelector('#playLabel');
const originalButton = document.querySelector('#originalButton');
const originalLabel = document.querySelector('#originalLabel');
const status = document.querySelector('#motionStatus');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new AbortController();
const duration = 12;
const tau = Math.PI * 2;
let time = 0;
let playing = !reducedMotion.matches;
let original = false;
let intensity = 'cinematic';
let frame = null;
let previous = null;
let width = 1;
let height = 1;
let ratio = 1;
let disposed = false;
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

function fraction(value) {
  return value - Math.floor(value);
}

function seed(index) {
  return fraction(Math.sin(index * 127.1 + 311.7) * 43758.5453);
}

function running() {
  return playing && !original && !document.hidden && !disposed;
}

function updateControls() {
  const active = running();
  stage.dataset.playing = String(active);
  stage.dataset.intensity = intensity;
  stage.classList.toggle('show-original', original);
  playButton.setAttribute('aria-pressed', String(active));
  playLabel.textContent = active ? '暂停' : '播放';
  originalButton.setAttribute('aria-pressed', String(original));
  originalLabel.textContent = original ? '返回动效' : '原图对比';
  const message = original
    ? '原图'
    : active
      ? '运行中'
      : reducedMotion.matches
        ? '减少动态效果'
        : '已暂停';
  if (status.textContent !== message) status.textContent = message;
  for (const button of root.querySelectorAll('[data-action="set-intensity"]')) {
    const selected = button.dataset.intensity === intensity;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('active', selected);
  }
}

function bubble(x, y, radius, opacity, stretch = 1) {
  context.save();
  context.translate(x, y);
  context.scale(1, stretch);
  context.beginPath();
  context.arc(0, 0, radius, 0, tau);
  context.fillStyle = 'rgba(255,255,255,' + opacity * 0.42 + ')';
  context.fill();
  context.lineWidth = Math.max(0.55, width / 1800);
  context.strokeStyle = 'rgba(30,36,39,' + opacity * 0.65 + ')';
  context.stroke();
  context.beginPath();
  context.arc(-radius * 0.08, -radius * 0.08, radius * 0.67, Math.PI * 1.03, Math.PI * 1.62);
  context.lineWidth = Math.max(1, radius * 0.18);
  context.strokeStyle = 'rgba(255,255,255,' + opacity + ')';
  context.stroke();
  context.restore();
}

function drawBubbles(t, strength) {
  const count = width < 650 ? 19 : 29;
  for (let side = 0; side < 2; side += 1) {
    for (let index = 0; index < count; index += 1) {
      const key = index + side * 41;
      const life = [4, 6, 12][index % 3];
      const phase = fraction(t / life + seed(key));
      const envelope = Math.sin(Math.PI * phase);
      const origin = side ? 0.858 : 0.125;
      const spread = (seed(key + 91) - 0.5) * 0.1;
      const wobble = Math.sin(phase * tau + seed(key + 20) * tau) * 0.017;
      const x = (origin + spread * phase + wobble * phase) * width;
      const y = (0.495 - phase * 0.54) * height;
      const radius = (1.4 + seed(key + 8) * 5.2) * Math.max(0.62, width / 1200);
      bubble(x, y, radius * (0.72 + phase * 0.5), envelope * 0.7 * strength, 1.1);
    }
  }
  // A few much larger, faint foreground bubbles supply depth without obscuring faces.
  for (let index = 0; index < 9; index += 1) {
    const phase = fraction(t / duration + seed(index + 240));
    const x = (0.05 + seed(index + 250) * 0.9 + Math.sin(phase * tau) * 0.025) * width;
    const y = (1.12 - phase * 1.3) * height;
    const radius = (8 + seed(index + 260) * 18) * Math.max(0.5, width / 1400);
    bubble(x, y, radius, Math.sin(Math.PI * phase) * 0.19 * strength, 1.03);
  }
}

function drawWater(t, strength) {
  // Broad white glints pass over the ink, with much finer gray refraction lines.
  context.save();
  for (let row = 0; row < 5; row += 1) {
    const phase = (t / duration) * tau + row * 1.4;
    context.beginPath();
    for (let step = 0; step <= 48; step += 1) {
      const x = (step / 48) * width;
      const y = height * (0.17 + row * 0.175) + Math.sin(step * 0.23 + phase) * height * 0.018;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = 'rgba(255,255,255,' + (0.11 + Math.sin(phase) * 0.04) * strength + ')';
    context.lineWidth = height * 0.012;
    context.stroke();
    context.strokeStyle = 'rgba(70,80,85,' + 0.025 * strength + ')';
    context.lineWidth = 0.6;
    context.stroke();
  }
  context.restore();
  for (let index = 0; index < 36; index += 1) {
    const phase = fraction(t / duration + seed(index + 400));
    const x = (seed(index + 420) + Math.sin(phase * tau) * 0.008) * width;
    const y = (1 - phase) * height;
    const size = (0.5 + seed(index + 440) * 0.9) * Math.max(0.65, width / 1400);
    context.fillStyle = 'rgba(40,45,49,' + Math.sin(Math.PI * phase) * 0.13 * strength + ')';
    context.fillRect(x, y, size, size);
  }
}

// The scene depends on timeline time and pointer state, never on frame count.
// All repeating frequencies divide the twelve-second loop.
function renderAt(seconds) {
  const t = Math.max(0, Math.min(duration, seconds));
  const strength = intensity === 'calm' ? 0.5 : 1;
  const cycle = (t / duration) * tau;
  const unit = width / 1400;
  const breathing = Math.sin(cycle * 3);
  stage.style.setProperty(
    '--left-x',
    (Math.sin(cycle) * 3.5 * strength + pointer.x * 4) * unit + 'px',
  );
  stage.style.setProperty('--left-y', (breathing * 3.7 * strength + pointer.y * 3) * unit + 'px');
  stage.style.setProperty('--left-angle', Math.sin(cycle) * 0.24 * strength + 'deg');
  stage.style.setProperty(
    '--right-x',
    (-Math.sin(cycle + 0.7) * 3.5 * strength - pointer.x * 4) * unit + 'px',
  );
  stage.style.setProperty(
    '--right-y',
    (Math.sin(cycle * 3 + 1.2) * 3.7 * strength + pointer.y * 2) * unit + 'px',
  );
  stage.style.setProperty('--right-angle', -Math.sin(cycle + 0.7) * 0.24 * strength + 'deg');
  stage.style.setProperty(
    '--water-opacity',
    String(0.3 + (Math.sin(cycle * 2) + 1) * 0.12 * strength),
  );
  if (context) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawWater(t, strength);
    drawBubbles(t, strength);
  }
  timeline.value = String(t);
  timeline.setAttribute('aria-valuetext', t.toFixed(1) + ' 秒，共 12 秒');
  timeReadout.textContent = t.toFixed(1).padStart(4, '0') + ' / 12.0';
  stage.dataset.time = t.toFixed(3);
}

function cancelFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  previous = null;
}

function tick(now) {
  frame = null;
  if (!running()) return;
  const elapsed = previous === null ? 0 : Math.max(0, (now - previous) / 1000);
  previous = now;
  time = (time + elapsed) % duration;
  const easing = 1 - Math.exp(-elapsed * 5);
  pointer.x += (pointer.targetX - pointer.x) * easing;
  pointer.y += (pointer.targetY - pointer.y) * easing;
  renderAt(time);
  frame = requestAnimationFrame(tick);
}

function syncPlayback() {
  cancelFrame();
  updateControls();
  if (running()) frame = requestAnimationFrame(tick);
}

function resize() {
  const bounds = stage.getBoundingClientRect();
  width = Math.max(1, bounds.width);
  height = Math.max(1, bounds.height);
  ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  renderAt(time);
}

function resetPointer() {
  pointer.targetX = 0;
  pointer.targetY = 0;
}

if (root && stage && canvas) {
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  root.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || !root.contains(button)) return;
      switch (button.dataset.action) {
        case 'toggle-play':
          playing = original || !playing;
          original = false;
          break;
        case 'restart-motion':
          time = 0;
          original = false;
          playing = !reducedMotion.matches;
          pointer.x = 0;
          pointer.y = 0;
          resetPointer();
          renderAt(time);
          break;
        case 'toggle-original':
          original = !original;
          break;
        case 'set-intensity':
          intensity = button.dataset.intensity === 'calm' ? 'calm' : 'cinematic';
          renderAt(time);
          break;
        default:
          return;
      }
      syncPlayback();
    },
    { signal: listeners.signal },
  );
  timeline.addEventListener(
    'input',
    () => {
      playing = false;
      original = false;
      time = Number(timeline.value);
      renderAt(time);
      syncPlayback();
    },
    { signal: listeners.signal },
  );
  stage.addEventListener(
    'pointermove',
    (event) => {
      if (!running() || reducedMotion.matches || event.pointerType === 'touch') return;
      const bounds = stage.getBoundingClientRect();
      pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    },
    { signal: listeners.signal, passive: true },
  );
  stage.addEventListener('pointerleave', resetPointer, { signal: listeners.signal });
  document.addEventListener('visibilitychange', syncPlayback, { signal: listeners.signal });
  reducedMotion.addEventListener(
    'change',
    () => {
      if (reducedMotion.matches) {
        playing = false;
        pointer.x = 0;
        pointer.y = 0;
        resetPointer();
        renderAt(time);
      }
      syncPlayback();
    },
    { signal: listeners.signal },
  );
  window.addEventListener(
    'pagehide',
    (event) => {
      cancelFrame();
      observer.disconnect();
      if (!event.persisted) {
        disposed = true;
        listeners.abort();
      }
    },
    { signal: listeners.signal },
  );
  window.addEventListener(
    'pageshow',
    () => {
      if (disposed) return;
      observer.observe(stage);
      resize();
      syncPlayback();
    },
    { signal: listeners.signal },
  );
  resize();
  syncPlayback();
}
