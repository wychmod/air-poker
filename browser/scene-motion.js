// Presentation only. Accepted public facts determine effects; effects never dispatch actions.
const actors = ['player', 'ai'];

export function classifyMotion(before, after) {
  if (!before || !after || before.sessionId !== after.sessionId) return [];
  if (before.round !== after.round) return after.phase === 'lower' ? [{ type: 'deal' }] : [];
  if (after.phase === 'summary') return [];
  const events = [];
  if (before.phase === 'lower' && after.phase === 'upper') {
    const index = after.usedTargets.find((value) => !before.usedTargets.includes(value));
    if (Number.isInteger(index)) events.push({ type: 'target', index, value: after.playerTarget });
  }
  if (
    before.phase === 'upper' &&
    after.phase === 'upper' &&
    before.upper?.attemptId === after.upper?.attemptId &&
    before.selectedCandidate !== after.selectedCandidate
  )
    events.push({ type: 'select', index: after.selectedCandidate });
  if (before.phase === 'upper' && after.phase !== 'upper' && after.playerHand?.length === 5)
    events.push({ type: 'lock', index: before.selectedCandidate });

  // Bet history is an accepted payment fact, unlike a balance delta (which may be breathing).
  const known = new Set((before.betting?.history ?? []).map((event) => event.turnId));
  const payments = (after.betting?.history ?? [])
    .filter((event) => !known.has(event.turnId) && event.paid > 0)
    .map(({ actor, paid, turnId }) => ({ actor, amount: paid, turnId }));
  if (
    before.phase === 'upper' &&
    !before.upper?.retry &&
    after.betting &&
    !after.betting.history.length
  ) {
    for (const actor of actors) {
      if (after[actor + 'Bet'] > 0)
        payments.push({ actor, amount: after[actor + 'Bet'], ante: true });
    }
  }
  if (payments.length) events.push({ type: 'payment', payments });
  if (
    after.phase === 'showdown' &&
    (before.phase !== 'showdown' || before.upper?.attemptId !== after.upper?.attemptId)
  ) {
    events.push({ type: 'reveal' });
    const result = after.lastResult;
    if (result?.calamity && !result.folded && result.winner !== 'tie' && result.burned > 0)
      events.push({ type: 'burn', amount: result.burned });
  }
  return events;
}

const fraction = (value) => value - Math.floor(value);
const seed = (index) => fraction(Math.sin(index * 127.1 + 311.7) * 43758.5453);
const rectOf = (node) => {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
};

export function createSceneMotion({ root, canvas }) {
  const document = root.ownerDocument;
  const win = document.defaultView;
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const context = canvas?.getContext('2d');
  const listeners = new AbortController();
  const animations = new Set();
  const copies = new Set();
  let previous = null;
  let previousView = null;
  let positions = {};
  let enabled = true;
  let suspended = false;
  let disposed = false;
  let skipNext = false;
  let frame = null;
  let width = 1;
  let height = 1;
  let ratio = 1;
  let scene = 'home';
  let timeline = 0;
  let lastFrame = null;
  const query = (selector) => root.querySelector(selector);
  const running = () => enabled && !media.matches && !document.hidden && !suspended && !disposed;

  function cancelEffects() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const copy of copies) copy.remove();
    copies.clear();
  }
  function animate(node, frames, options) {
    if (!node?.animate || !running()) return null;
    const animation = node.animate(frames, {
      duration: 280,
      easing: 'cubic-bezier(.2,.75,.25,1)',
      ...options,
    });
    animations.add(animation);
    animation.finished.then(
      () => animations.delete(animation),
      () => animations.delete(animation),
    );
    return animation;
  }
  function copyAt(node, rect, className = '') {
    if (!rect) return null;
    const copy = node.cloneNode(true);
    copy.removeAttribute('id');
    copy.removeAttribute('data-action');
    copy.removeAttribute('data-card-id');
    for (const child of copy.querySelectorAll('[id], [data-action], [data-card-id]')) {
      child.removeAttribute('id');
      child.removeAttribute('data-action');
      child.removeAttribute('data-card-id');
    }
    copy.classList.add('motion-copy');
    if (className) copy.classList.add(className);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    Object.assign(copy.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    document.body.append(copy);
    copies.add(copy);
    return copy;
  }
  function removeAfter(animation, node) {
    if (!animation) {
      node?.remove();
      copies.delete(node);
      return;
    }
    const remove = () => {
      node.remove();
      copies.delete(node);
    };
    animation.finished.then(remove, remove);
  }
  function fly(copy, from, to, duration = 280, delay = 0) {
    if (!copy || !from || !to) return;
    const x = to.left + to.width / 2 - from.left - from.width / 2;
    const y = to.top + to.height / 2 - from.top - from.height / 2;
    const scale = Math.min(1.1, to.width / from.width);
    removeAfter(
      animate(
        copy,
        [
          { transform: 'translate(0,0) scale(1)', opacity: 0.95 },
          {
            transform: 'translate(' + x * 0.55 + 'px,' + (y * 0.55 - 16) + 'px) scale(1)',
            opacity: 0.95,
            offset: 0.55,
          },
          { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')', opacity: 0 },
        ],
        { duration, delay },
      ),
      copy,
    );
  }
  function playTarget(event) {
    const from = positions.targets?.get(event.index);
    const to = rectOf(query('[data-target-slot="player"]'));
    if (!from || !to) return;
    const node = document.createElement('div');
    node.className = 'motion-target-token';
    node.textContent = event.value;
    fly(copyAt(node, from), from, to);
  }
  function playLock(event) {
    const sources = positions.draft?.length
      ? positions.draft
      : (positions.candidates?.get(event.index) ?? []);
    const destinations = [
      ...(query('[data-hand="player"]')?.querySelectorAll('[data-card-id]') ?? []),
    ];
    sources.forEach((source, index) => {
      const to = rectOf(
        destinations.find((card) => card.dataset.cardId === source.node.dataset.cardId),
      );
      if (to) fly(copyAt(source.node, source.rect), source.rect, to, 250, index * 12);
    });
  }
  function playPayments(event, delay = 0) {
    const to = rectOf(query('[data-pot]'));
    if (!to) return;
    // A single batch replaces any previous animation. Never reconstruct skipped history.
    for (const payment of event.payments.slice(-2)) {
      const from =
        positions.air?.[payment.actor] ?? rectOf(query('[data-air="' + payment.actor + '"]'));
      if (!from) continue;
      const token = document.createElement('div');
      token.className = 'motion-air-token';
      token.textContent = 'AIR ×' + payment.amount;
      const start = {
        left: from.left + from.width / 2 - 40,
        top: from.top + from.height / 2 - 17,
        width: 80,
        height: 34,
      };
      fly(copyAt(token, start), start, to, 320, delay);
    }
    animate(
      query('[data-pot]'),
      [
        { outlineColor: 'transparent' },
        { outlineColor: '#8c8d82' },
        { outlineColor: 'transparent' },
      ],
      { duration: 400, delay },
    );
  }
  function playReveal(delay = 0) {
    const cards = query('[data-hand="ai"]')?.querySelectorAll('[data-card-id]') ?? [];
    cards.forEach((card, index) =>
      animate(
        card,
        [
          { transform: 'perspective(500px) rotateY(85deg)', opacity: 0.15 },
          { transform: 'perspective(500px) rotateY(0deg)', opacity: 1 },
        ],
        { duration: 300, delay: delay + index * 35 },
      ),
    );
  }
  function playOverlap(delay = 0) {
    if (!query('[data-calamity]')) return;
    const own = query('[data-hand="player"]');
    const other = query('[data-hand="ai"]');
    if (!own || !other) return;
    const pairs = [...own.querySelectorAll('[data-card-id]')].flatMap((card) => {
      const match = [...other.querySelectorAll('[data-card-id]')].find(
        (next) => next.dataset.cardId === card.dataset.cardId,
      );
      const a = rectOf(card);
      const b = rectOf(match);
      return a && b ? [{ a, b }] : [];
    });
    if (!pairs.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'motion-overlap');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(win.innerWidth));
    svg.setAttribute('height', String(win.innerHeight));
    svg.setAttribute('viewBox', '0 0 ' + win.innerWidth + ' ' + win.innerHeight);
    for (const { a, b } of pairs) {
      const horizontal = Math.abs(a.left - b.left) > Math.abs(a.top - b.top);
      const x1 = horizontal ? (a.left < b.left ? a.right : a.left) : a.left + a.width / 2;
      const x2 = horizontal ? (a.left < b.left ? b.left : b.right) : b.left + b.width / 2;
      const y1 = horizontal ? a.top + a.height / 2 : a.top < b.top ? a.bottom : a.top;
      const y2 = horizontal ? b.top + b.height / 2 : a.top < b.top ? b.top : b.bottom;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2);
      path.setAttribute('pathLength', '1');
      path.style.strokeDasharray = '1';
      svg.append(path);
      animate(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: 180,
        delay,
        fill: 'backwards',
      });
    }
    document.body.append(svg);
    copies.add(svg);
    removeAfter(
      animate(
        svg,
        [
          { opacity: 0 },
          { opacity: 0.6, offset: 0.12 },
          { opacity: 0.6, offset: 0.65 },
          { opacity: 0 },
        ],
        { duration: 650, delay, fill: 'backwards' },
      ),
      svg,
    );
  }
  function playBurn(delay = 0) {
    const node = query('[data-burned]');
    animate(
      node,
      [
        { clipPath: 'inset(0 100% 0 0)', backgroundColor: '#9c37371a' },
        { clipPath: 'inset(0 0 0 0)', backgroundColor: '#9c37370a' },
      ],
      { duration: 250, delay },
    );
  }
  function enterScene() {
    for (const node of root.querySelectorAll('[data-motion-ink]'))
      animate(node, [{ strokeDashoffset: 1100 }, { strokeDashoffset: 0 }], { duration: 450 });
    for (const node of root.querySelectorAll('[data-motion-line]'))
      animate(node, [{ transform: 'scaleX(.1)' }, { transform: 'scaleX(1)' }], { duration: 300 });
    animate(
      query('[data-scene]') ?? query('main'),
      [
        { opacity: 0.65, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 360 },
    );
    for (const node of root.querySelectorAll('[data-motion-reveal]'))
      animate(
        node,
        [
          { clipPath: 'inset(0 6% 0 5%)', transform: 'scale(.985)' },
          { clipPath: 'inset(0)', transform: 'scale(1)' },
        ],
        { duration: 600 },
      );
  }
  function playDeal() {
    root.querySelectorAll('[data-target-index]').forEach((node, index) =>
      animate(
        node,
        [
          { transform: 'translateY(16px)', opacity: 0.4 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 220, delay: index * 25 },
      ),
    );
  }

  function capture() {
    if (disposed) return;
    const targets = new Map();
    for (const node of root.querySelectorAll('[data-target-index]'))
      targets.set(Number(node.dataset.targetIndex), rectOf(node));
    const candidates = new Map();
    for (const node of root.querySelectorAll('[data-candidate-index]'))
      candidates.set(
        Number(node.dataset.candidateIndex),
        [...node.querySelectorAll('[data-card-id]')]
          .map((card) => ({ node: card.cloneNode(true), rect: rectOf(card) }))
          .filter((card) => card.rect),
      );
    positions = {
      targets,
      candidates,
      draft: [...root.querySelectorAll('[data-hand-draft] [data-card-id]')]
        .map((card) => ({ node: card.cloneNode(true), rect: rectOf(card) }))
        .filter((card) => card.rect),
      air: Object.fromEntries(
        actors.map((actor) => [actor, rectOf(query('[data-air="' + actor + '"]'))]),
      ),
    };
  }
  function update(snapshot, view) {
    if (disposed) return;
    cancelEffects();
    const nextScene =
      view.screen === 'game' && snapshot.phase === 'summary'
        ? 'result-' + snapshot.winner
        : view.screen;
    const changedScene = scene !== nextScene || previous?.sessionId !== snapshot.sessionId;
    scene = nextScene;
    root.dataset.motionScene = scene;
    if (canvas) canvas.dataset.tone = 'light';
    if (running() && !skipNext) {
      if (changedScene || !previous) {
        enterScene();
        if (scene === 'game' && snapshot.phase === 'lower') playDeal();
      } else if (view.screen === 'game' && previousView?.screen === 'game') {
        if (
          snapshot.phase === 'lower' &&
          previous.phase === 'lower' &&
          previousView.selectedTarget !== view.selectedTarget
        ) {
          const next = query('[data-target-index="' + view.selectedTarget + '"]');
          const old = query('[data-target-index="' + previousView.selectedTarget + '"]');
          animate(next, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }], {
            duration: 180,
          });
          animate(old, [{ transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], {
            duration: 160,
          });
        }
        if (
          snapshot.phase === 'upper' &&
          previous.phase === 'upper' &&
          previous.upper?.attemptId === snapshot.upper?.attemptId
        ) {
          const oldIds = previousView.handDraft?.cardIds ?? [];
          const nextIds = view.handDraft?.cardIds ?? [];
          for (const id of nextIds.filter((id) => !oldIds.includes(id))) {
            const slot = query('[data-hand-draft] [data-card-id="' + id + '"]');
            animate(
              slot,
              [
                { transform: 'translateY(14px) rotate(-4deg) scale(.93)', opacity: 0.35 },
                { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1 },
              ],
              { duration: 220 },
            );
          }
          for (const id of oldIds.filter((id) => !nextIds.includes(id))) {
            const card = query('[data-hand-pool] [data-card-id="' + id + '"]');
            animate(card, [{ transform: 'scale(.92)' }, { transform: 'scale(1)' }], {
              duration: 180,
            });
          }
        }
        const events = classifyMotion(previous, snapshot);
        const locked = events.some((event) => event.type === 'lock');
        for (const event of events) {
          if (event.type === 'target') playTarget(event);
          if (event.type === 'lock') playLock(event);
          if (event.type === 'payment') playPayments(event, locked ? 100 : 0);
          if (event.type === 'reveal') playReveal();
          if (event.type === 'burn') {
            playOverlap(300);
            playBurn(430);
          }
          if (event.type === 'deal') playDeal();
          if (event.type === 'select')
            animate(
              query('[data-candidate-index="' + event.index + '"]'),
              [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }],
              { duration: 180 },
            );
        }
      }
    }
    previous = snapshot;
    previousView = { ...view };
    skipNext = false;
    syncPlayback();
  }

  function draw(seconds) {
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!running()) return;
    const battle = scene === 'game';
    const count = width < 650 ? (battle ? 5 : 12) : battle ? 10 : 28;
    const tone = '55,64,61';
    for (let index = 0; index < count; index++) {
      const phase = fraction(seconds / (8 + (index % 3) * 2) + seed(index));
      const side = index % 2 ? 0.88 : 0.12;
      const x =
        width * (side + (seed(index + 17) - 0.5) * 0.15 + Math.sin(phase * Math.PI * 2) * 0.008);
      const y = height * (0.92 - phase * 0.95);
      const size = (1.3 + seed(index + 20) * 4) * Math.min(width / 850, 1.2);
      context.strokeStyle =
        'rgba(' + tone + ',' + Math.sin(phase * Math.PI) * (battle ? 0.055 : 0.22) + ')';
      context.lineWidth = 0.8;
      context.beginPath();
      context.ellipse(x, y, size, size * 1.13, 0, 0, Math.PI * 2);
      context.stroke();
    }
    if (!battle) {
      for (let row = 0; row < 2; row++) {
        context.beginPath();
        for (let step = 0; step <= 40; step++) {
          const x = (step / 40) * width;
          const y =
            height * (0.45 + row * 0.3) + Math.sin(step * 0.17 + (seconds * Math.PI) / 6) * 6;
          if (step) context.lineTo(x, y);
          else context.moveTo(x, y);
        }
        context.strokeStyle = 'rgba(' + tone + ',.035)';
        context.stroke();
      }
    }
  }
  function stopFrame() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    lastFrame = null;
  }
  function tick(now) {
    frame = null;
    if (!running()) return;
    if (lastFrame !== null) timeline += Math.max(0, now - lastFrame) / 1000;
    lastFrame = now;
    draw(timeline);
    frame = win.requestAnimationFrame(tick);
  }
  function syncPlayback() {
    root.dataset.motion = running() ? 'on' : 'off';
    // Dialogs live beside the application root and share its motion preference.
    document.documentElement.dataset.motion = root.dataset.motion;
    root.dataset.motionEnabled = String(enabled);
    if (!running()) {
      stopFrame();
      cancelEffects();
      draw(timeline);
    } else if (frame === null) frame = win.requestAnimationFrame(tick);
  }
  function resize() {
    if (disposed || !canvas) return;
    width = Math.max(1, win.innerWidth);
    height = Math.max(1, win.innerHeight);
    ratio = Math.min(win.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    draw(timeline);
  }
  function onVisibility() {
    // Do not replay any elapsed game events when the browser becomes visible again.
    skipNext = true;
    syncPlayback();
  }
  document.addEventListener('visibilitychange', onVisibility, { signal: listeners.signal });
  win.addEventListener('resize', resize, { signal: listeners.signal, passive: true });
  win.addEventListener('scroll', cancelEffects, { signal: listeners.signal, passive: true });
  media.addEventListener('change', syncPlayback, { signal: listeners.signal });
  resize();
  syncPlayback();
  return {
    capture,
    update,
    setEnabled(value) {
      enabled = Boolean(value);
      syncPlayback();
    },
    suspend() {
      suspended = true;
      skipNext = true;
      syncPlayback();
    },
    resume() {
      if (disposed) return;
      suspended = false;
      skipNext = true;
      resize();
      syncPlayback();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      root.dataset.motion = 'off';
      document.documentElement.dataset.motion = 'off';
      stopFrame();
      cancelEffects();
      listeners.abort();
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
