// Presentation only. Accepted public facts determine effects; effects never dispatch actions.
const actors = ['player', 'ai'];

const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.75,.25,1)',
  cinematic: 'cubic-bezier(.16,.84,.3,1)',
  sweep: 'cubic-bezier(.3,0,.2,1)',
  drift: 'cubic-bezier(.2,.65,.3,1)',
  curtain: 'cubic-bezier(.76,0,.24,1)',
  ink: 'cubic-bezier(.28,.64,.24,1)',
  frame: 'cubic-bezier(.22,.72,.2,1)',
});

// The ending is a narrative sequence, not a routine interaction. Keep its full timeline in one
// place so pacing can be tuned without hunting through the effect branches.
const ENDING = Object.freeze({
  total: 3500,
  stage: 680,
  ink: 1050,
  inkDelay: 160,
  line: 520,
  lineDelay: 120,
  art: 1050,
  artDelay: 80,
  pulse: 1500,
  pulseDelay: 120,
  ring: 1500,
  ringDelay: 140,
  ringGap: 210,
  bloom: 1900,
  bloomDelay: 110,
  beam: 1550,
  beamDelay: 220,
  cut: 1050,
  cutDelay: 180,
  cutGap: 190,
  mark: 2400,
  markDelay: 760,
  flash: 560,
  flashDelay: 2360,
  seal: 900,
  sealDelay: 2520,
  copy: Object.freeze({
    eyebrow: Object.freeze({ delay: 180, duration: 360 }),
    title: Object.freeze({ delay: 300, duration: 720 }),
    tagline: Object.freeze({ delay: 620, duration: 420 }),
    reason: Object.freeze({ delay: 760, duration: 460 }),
    facts: Object.freeze({ delay: 930, duration: 420 }),
    actions: Object.freeze({ delay: 1230, duration: 440 }),
    home: Object.freeze({ delay: 1350, duration: 360 }),
  }),
  facts: Object.freeze({ delay: 990, duration: 400, stagger: 80 }),
  actions: Object.freeze({ delay: 1270, duration: 380, stagger: 55 }),
  motes: Object.freeze({
    delay: 150,
    delaySpread: 520,
    duration: 1300,
    durationSpread: 700,
  }),
});

export function endingKindForScene(scene) {
  if (scene === 'result-player') return 'victory';
  if (scene === 'result-ai') return 'defeat';
  return null;
}

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
  let endingSkipped = false;
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
  function ring(node, spread = 16, tone = '23,25,23') {
    if (!node) return;
    animate(
      node,
      [
        { filter: 'drop-shadow(0 0 0 rgba(' + tone + ',.45))' },
        { filter: 'drop-shadow(0 0 ' + spread + 'px rgba(' + tone + ',0))' },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.75,.25,1)' },
    );
  }
  function focusVignette() {
    if (typeof document.createElement !== 'function' || !document.body) return;
    const node = document.createElement('div');
    node.className = 'motion-focus';
    node.setAttribute('aria-hidden', 'true');
    document.body.append(node);
    copies.add(node);
    removeAfter(
      animate(
        node,
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.16 },
          { opacity: 1, offset: 0.58 },
          { opacity: 0 },
        ],
        { duration: 1500, easing: 'ease-out' },
      ),
      node,
    );
  }
  function roll(node) {
    animate(
      node,
      [
        { transform: 'translateY(-62%)', opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.75,.25,1)' },
    );
  }
  function playRolls(before, after) {
    if (!before || !after || before.sessionId !== after.sessionId) return;
    for (const actor of actors) {
      if (before[actor + 'Air'] !== after[actor + 'Air'])
        roll(query('[data-air-value="' + actor + '"]'));
    }
    if (before.pot !== after.pot) roll(query('[data-pot-value]'));
  }
  function playTarget(event) {
    const from = positions.targets?.get(event.index);
    const to = rectOf(query('[data-target-slot="player"]'));
    if (!from || !to) return;
    const node = document.createElement('div');
    node.className = 'motion-target-token';
    node.textContent = event.value;
    fly(copyAt(node, from), from, to);
    ring(query('[data-target-slot="player"]'), 14);
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
    ring(query('.battle-player'), 20, '156,55,55');
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
    focusVignette();
    const vs = query('.battle-showdown-vs');
    animate(
      vs,
      [
        { transform: 'scale(.38) rotate(-18deg)', opacity: 0 },
        { transform: 'scale(1.09) rotate(0deg)', opacity: 1, offset: 0.64 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      ],
      { duration: 430, delay: delay + 140, easing: EASING.cinematic, fill: 'backwards' },
    );
    ring(vs, 20, '156,55,55');
    const flip = (hand, direction, base) => {
      const cards = hand?.querySelectorAll('[data-card-id]') ?? [];
      cards.forEach((card, index) =>
        animate(
          card,
          [
            {
              transform:
                'perspective(600px) translateX(' +
                direction * 24 +
                'px) rotateY(' +
                direction * 68 +
                'deg)',
              opacity: 0.18,
            },
            { transform: 'perspective(600px) translateX(0) rotateY(0deg)', opacity: 1 },
          ],
          {
            duration: 340,
            delay: delay + base + index * 45,
            easing: EASING.frame,
            fill: 'backwards',
          },
        ),
      );
    };
    const ai = query('[data-hand="ai"]');
    const player = query('[data-hand="player"]');
    flip(ai, 1, 0);
    flip(player, -1, 110);
    for (const hand of [ai, player]) {
      if (!hand?.classList.contains('is-winner')) continue;
      animate(hand, [{ transform: 'scale(.985)' }, { transform: 'scale(1)' }], {
        duration: 460,
        delay: delay + 340,
        easing: EASING.cinematic,
      });
    }
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
  function sceneBlocks() {
    const nodes = [
      ...root.querySelectorAll(
        [
          '.home-center .eyebrow',
          '.home-center h1',
          '.home-tagline',
          '.home-enter',
          '.home-secondary',
          '.home-foot',
          '.narrative-heading',
          '.concept-panel',
          '.tutorial-heading',
          '.tutorial-exercise',
          '.battle-resources',
          '.battle-table',
          '.battle-actions',
          '.result-copy > *',
          '.intro-matchup',
        ].join(','),
      ),
    ];
    if (nodes.length) return nodes;
    const page = query('#pageContent > section');
    return page ? [...page.children].slice(0, 6) : [];
  }
  function sceneCurtain() {
    if (typeof document.createElement !== 'function' || !document.body) return;
    const slab = document.createElement('div');
    slab.className = 'motion-slab';
    slab.setAttribute('aria-hidden', 'true');
    document.body.append(slab);
    copies.add(slab);
    removeAfter(
      animate(slab, [{ transform: 'translateX(0)' }, { transform: 'translateX(104%)' }], {
        duration: 480,
        easing: 'cubic-bezier(.76,0,.24,1)',
      }),
      slab,
    );
  }
  function titleSweep() {
    if (typeof document.createElement !== 'function') return;
    const title = query('.home-center h1');
    if (!title || title.querySelector('.motion-title-sweep')) return;
    const band = document.createElement('span');
    band.className = 'motion-title-sweep';
    band.setAttribute('aria-hidden', 'true');
    title.append(band);
    copies.add(band);
    removeAfter(
      animate(band, [{ transform: 'translateX(-160%)' }, { transform: 'translateX(520%)' }], {
        duration: 1250,
        delay: 260,
        easing: 'cubic-bezier(.3,0,.2,1)',
      }),
      band,
    );
  }
  function playChapter(eyebrow, title, caption) {
    if (!running() || typeof document.createElement !== 'function' || !document.body) return;
    const node = document.createElement('div');
    node.className = 'motion-chapter';
    node.setAttribute('aria-hidden', 'true');
    const index = document.createElement('em');
    index.textContent = eyebrow;
    const heading = document.createElement('strong');
    heading.textContent = title;
    const note = document.createElement('small');
    note.textContent = caption;
    node.append(index, heading, note);
    document.body.append(node);
    copies.add(node);
    removeAfter(
      animate(
        node,
        [
          { opacity: 0, transform: 'translate3d(-28px,0,0)' },
          { opacity: 1, transform: 'translate3d(0,0,0)', offset: 0.18 },
          { opacity: 1, transform: 'translate3d(0,0,0)', offset: 0.64 },
          { opacity: 0, transform: 'translate3d(16px,0,0)' },
        ],
        { duration: 1250, easing: EASING.cinematic, fill: 'backwards' },
      ),
      node,
    );
  }
  function roundChapter(round, maxRounds, lang) {
    const zh = lang !== 'en';
    if (round >= maxRounds)
      return zh
        ? ['最后一轮', 'FINAL ROUND · 一口氧气']
        : ['Final round', 'FINAL ROUND · ONE LAST BREATH'];
    if (round >= 3)
      return zh
        ? ['压力上升', 'PRESSURE · 水面收紧']
        : ['Pressure', 'PRESSURE · THE WATER TIGHTENS'];
    return zh ? ['水下开局', 'OPENING · 潜入牌桌'] : ['Opening', 'OPENING · BENEATH THE SURFACE'];
  }
  function playEnding(kind) {
    if (
      !['victory', 'defeat'].includes(kind) ||
      typeof document.createElement !== 'function' ||
      !document.body
    )
      return;
    const layer = document.createElement('div');
    layer.className = 'motion-finale motion-finale-' + kind;
    layer.setAttribute('aria-hidden', 'true');

    const veil = document.createElement('div');
    veil.className = 'motion-finale-veil';
    layer.append(veil);

    for (const edge of ['top', 'bottom']) {
      const bar = document.createElement('span');
      bar.className = 'motion-finale-bar motion-finale-bar-' + edge;
      layer.append(bar);
      const hidden = edge === 'top' ? 'translateY(-104%)' : 'translateY(104%)';
      animate(
        bar,
        [
          { transform: hidden },
          { transform: 'translateY(0)', offset: 0.12 },
          { transform: 'translateY(0)', offset: 0.87 },
          { transform: hidden },
        ],
        { duration: ENDING.total, easing: EASING.frame },
      );
    }

    const pulse = document.createElement('span');
    pulse.className = 'motion-finale-pulse';
    layer.append(pulse);
    animate(
      pulse,
      [
        { transform: 'scale(.8)', opacity: 0 },
        { transform: 'scale(1)', opacity: 0.9, offset: 0.2 },
        { transform: 'scale(1.28)', opacity: 0 },
      ],
      { duration: ENDING.pulse, delay: ENDING.pulseDelay, easing: EASING.cinematic },
    );

    for (let index = 0; index < 3; index++) {
      const ripple = document.createElement('span');
      ripple.className = 'motion-finale-ring';
      layer.append(ripple);
      animate(
        ripple,
        [
          { transform: 'scale(.38)', opacity: 0 },
          {
            transform: 'scale(.42)',
            opacity: kind === 'victory' ? 0.5 : 0.4,
            offset: 0.18,
          },
          { transform: 'scale(1.7)', opacity: 0 },
        ],
        {
          duration: ENDING.ring,
          delay: ENDING.ringDelay + index * ENDING.ringGap,
          easing: EASING.cinematic,
        },
      );
    }

    if (kind === 'victory') {
      const bloom = document.createElement('span');
      bloom.className = 'motion-finale-bloom';
      layer.append(bloom);
      animate(
        bloom,
        [
          { transform: 'scale(.62)', opacity: 0 },
          { transform: 'scale(.92)', opacity: 0.7, offset: 0.34 },
          { transform: 'scale(1.34)', opacity: 0 },
        ],
        { duration: ENDING.bloom, delay: ENDING.bloomDelay, easing: EASING.cinematic },
      );

      const beam = document.createElement('span');
      beam.className = 'motion-finale-beam';
      layer.append(beam);
      animate(
        beam,
        [
          { transform: 'translate3d(-38vw,0,0) rotate(-8deg)', opacity: 0 },
          { transform: 'translate3d(0,0,0) rotate(-8deg)', opacity: 0.72, offset: 0.38 },
          { transform: 'translate3d(42vw,0,0) rotate(-8deg)', opacity: 0 },
        ],
        { duration: ENDING.beam, delay: ENDING.beamDelay, easing: EASING.sweep },
      );
    } else {
      for (let index = 0; index < 2; index++) {
        const cut = document.createElement('span');
        cut.className = 'motion-finale-cut';
        cut.style.top = 35 + index * 25 + '%';
        cut.style.rotate = index ? '5deg' : '-7deg';
        layer.append(cut);
        animate(
          cut,
          [
            { transform: 'scaleX(0)', opacity: 0 },
            { transform: 'scaleX(1)', opacity: 0.85, offset: 0.22 },
            { transform: 'scaleX(1)', opacity: 0 },
          ],
          {
            duration: ENDING.cut,
            delay: ENDING.cutDelay + index * ENDING.cutGap,
            easing: EASING.cinematic,
          },
        );
      }
    }

    const motes = width < 650 ? 8 : 15;
    for (let index = 0; index < motes; index++) {
      const mote = document.createElement('i');
      mote.className = 'motion-finale-mote';
      const startX = 6 + seed(index + 71) * 88;
      const drift = (seed(index + 91) - 0.5) * (kind === 'victory' ? 80 : 56);
      const distance = 70 + seed(index + 111) * (kind === 'victory' ? 160 : 110);
      const size = 1.5 + seed(index + 131) * 4.5;
      const delay = ENDING.motes.delay + seed(index + 151) * ENDING.motes.delaySpread;
      const duration = ENDING.motes.duration + seed(index + 171) * ENDING.motes.durationSpread;
      mote.style.left = startX.toFixed(2) + '%';
      mote.style.top = kind === 'victory' ? '88%' : '10%';
      mote.style.width = size.toFixed(2) + 'px';
      mote.style.height = size.toFixed(2) + 'px';
      layer.append(mote);
      animate(
        mote,
        kind === 'victory'
          ? [
              { transform: 'translate3d(0,26px,0) scale(.65)', opacity: 0 },
              { transform: 'translate3d(0,0,0) scale(1)', opacity: 0.72, offset: 0.18 },
              {
                transform: 'translate3d(' + drift + 'px,-' + distance + 'px,0) scale(1.1)',
                opacity: 0,
              },
            ]
          : [
              { transform: 'translate3d(0,-24px,0) scale(.8)', opacity: 0 },
              { transform: 'translate3d(0,0,0) scale(1)', opacity: 0.5, offset: 0.18 },
              {
                transform: 'translate3d(' + drift + 'px,' + distance + 'px,0) scale(.45)',
                opacity: 0,
              },
            ],
        { duration, delay, easing: EASING.drift },
      );
    }

    document.body.append(layer);
    copies.add(layer);

    const title = query('.result-copy h1');
    if (title) {
      const mark = document.createElement('span');
      mark.className = 'motion-finale-title-mark';
      mark.classList.add(kind);
      mark.setAttribute('aria-hidden', 'true');
      title.append(mark);
      copies.add(mark);
      const tilt = kind === 'defeat' ? 'rotate(-.6deg) ' : '';
      removeAfter(
        animate(
          mark,
          [
            { transform: tilt + 'scaleX(0)', opacity: 0 },
            {
              transform: tilt + 'scaleX(1)',
              opacity: kind === 'victory' ? 0.76 : 0.86,
              offset: 0.2,
            },
            { transform: tilt + 'scaleX(1)', opacity: 0.62, offset: 0.66 },
            { transform: tilt + 'scaleX(1.025)', opacity: 0 },
          ],
          { duration: ENDING.mark, delay: ENDING.markDelay, easing: EASING.cinematic },
        ),
        mark,
      );
    }

    const flash = document.createElement('span');
    flash.className = 'motion-finale-flash';
    layer.append(flash);
    animate(
      flash,
      [{ opacity: 0 }, { opacity: kind === 'victory' ? 0.8 : 0.68, offset: 0.18 }, { opacity: 0 }],
      { duration: ENDING.flash, delay: ENDING.flashDelay, easing: 'ease-out' },
    );

    const seal = document.createElement('span');
    seal.className = 'motion-finale-seal';
    const sealLatin = document.createElement('b');
    sealLatin.textContent = kind === 'victory' ? 'VICTORY' : 'DEFEAT';
    const sealCn = document.createElement('i');
    sealCn.textContent = kind === 'victory' ? '胜利' : '失利';
    seal.append(sealLatin, sealCn);
    layer.append(seal);
    animate(
      seal,
      [
        { opacity: 0, transform: 'scale(1.35) rotate(-16deg)' },
        { opacity: 0.92, transform: 'scale(1) rotate(-8deg)', offset: 0.26 },
        { opacity: 0.92, transform: 'scale(1) rotate(-8deg)', offset: 0.62 },
        { opacity: 0, transform: 'scale(.96) rotate(-8deg)' },
      ],
      {
        duration: ENDING.seal,
        delay: ENDING.sealDelay,
        easing: EASING.cinematic,
        fill: 'backwards',
      },
    );

    removeAfter(
      animate(
        layer,
        [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }],
        { duration: ENDING.total, easing: 'linear' },
      ),
      layer,
    );
  }
  function enterEndingScene(kind) {
    if (endingSkipped) return;
    const page = query('[data-scene]') ?? query('main');
    animate(
      page,
      [
        { opacity: 0.48, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: ENDING.stage, easing: EASING.cinematic, fill: 'backwards' },
    );

    for (const node of root.querySelectorAll('[data-motion-ink]'))
      animate(node, [{ strokeDashoffset: 1100 }, { strokeDashoffset: 0 }], {
        duration: ENDING.ink,
        delay: ENDING.inkDelay,
        easing: EASING.ink,
      });
    for (const node of root.querySelectorAll('[data-motion-line]'))
      animate(node, [{ transform: 'scaleX(.1)' }, { transform: 'scaleX(1)' }], {
        duration: ENDING.line,
        delay: ENDING.lineDelay,
      });

    const image = query('.result-art [data-motion-reveal]') ?? query('.result-art img');
    animate(
      image,
      [
        { clipPath: 'inset(0 52% 0 52%)', transform: 'scale(1.045)', opacity: 0.25 },
        {
          clipPath: 'inset(0 8% 0 8%)',
          transform: 'scale(1.012)',
          opacity: 1,
          offset: 0.72,
        },
        { clipPath: 'inset(0)', transform: 'scale(1)', opacity: 1 },
      ],
      {
        duration: ENDING.art,
        delay: ENDING.artDelay,
        easing: EASING.cinematic,
        fill: 'backwards',
      },
    );

    const reveal = (selector, timing, distance, extra = {}) => {
      const node = query(selector);
      if (!node) return;
      animate(
        node,
        [
          { opacity: 0.001, transform: 'translateY(' + distance + 'px)', ...extra.from },
          { opacity: 1, transform: 'translateY(0)', ...extra.to },
        ],
        {
          duration: timing.duration,
          delay: timing.delay,
          easing: EASING.cinematic,
          fill: 'backwards',
        },
      );
    };

    reveal('.result-copy > .eyebrow', ENDING.copy.eyebrow, 9);
    reveal('.result-copy h1', ENDING.copy.title, 18, {
      from: { clipPath: 'inset(0 0 100% 0)' },
      to: { clipPath: 'inset(0)' },
    });
    reveal('.result-copy .result-tagline', ENDING.copy.tagline, 15);
    reveal('.result-copy .result-reason', ENDING.copy.reason, 13);
    reveal('.result-facts', ENDING.copy.facts, 14);
    reveal('.result-actions', ENDING.copy.actions, 12);
    reveal('.result-home', ENDING.copy.home, 8);

    const facts = query('.result-facts');
    [...(facts?.children ?? [])].forEach((node, index) =>
      animate(node, [{ transform: 'translateY(10px)' }, { transform: 'translateY(0)' }], {
        duration: ENDING.facts.duration,
        delay: ENDING.facts.delay + index * ENDING.facts.stagger,
        easing: EASING.cinematic,
        fill: 'backwards',
      }),
    );

    const actions = query('.result-actions');
    [...(actions?.children ?? [])].forEach((node, index) =>
      animate(node, [{ transform: 'translateY(8px)' }, { transform: 'translateY(0)' }], {
        duration: ENDING.actions.duration,
        delay: ENDING.actions.delay + index * ENDING.actions.stagger,
        easing: EASING.cinematic,
        fill: 'backwards',
      }),
    );

    applyPointer();
    playEnding(kind);
  }
  function enterScene(withCurtain = false) {
    if (withCurtain) sceneCurtain();
    const ending = endingKindForScene(scene);
    if (ending) {
      enterEndingScene(ending);
      return;
    }
    for (const node of root.querySelectorAll('[data-motion-ink]'))
      animate(node, [{ strokeDashoffset: 1100 }, { strokeDashoffset: 0 }], {
        duration: 450,
      });
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
    sceneBlocks().forEach((node, index) =>
      animate(
        node,
        [
          { opacity: 0.001, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 460,
          delay: 150 + index * 45,
          easing: 'cubic-bezier(.16,.84,.3,1)',
          fill: 'backwards',
        },
      ),
    );
    applyPointer();
    if (scene === 'home') titleSweep();
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

  function skipEnding() {
    if (!endingKindForScene(scene)) return;
    endingSkipped = true;
    cancelEffects();
    const button = query('.result-skip');
    if (button) button.hidden = true;
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
    if (changedScene) endingSkipped = false;
    scene = nextScene;
    root.dataset.motionScene = scene;
    if (canvas) canvas.dataset.tone = 'light';
    if (running() && !skipNext) {
      if (changedScene || !previous) {
        enterScene(Boolean(previous));
        if (scene === 'game' && snapshot.phase === 'lower') {
          playDeal();
          const [title, note] = roundChapter(snapshot.round, snapshot.maxRounds, view.lang);
          playChapter('ROUND ' + String(snapshot.round).padStart(2, '0'), title, note);
        }
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
        playRolls(previous, snapshot);
        const events = classifyMotion(previous, snapshot);
        const locked = events.some((event) => event.type === 'lock');
        for (const event of events) {
          if (event.type === 'target') playTarget(event);
          if (event.type === 'lock') playLock(event);
          if (event.type === 'payment') playPayments(event, locked ? 100 : 0);
          if (event.type === 'reveal') {
            playReveal();
            playChapter(
              '04 / REVEAL',
              view.lang === 'en' ? 'SHOWDOWN' : '摊牌',
              view.lang === 'en' ? 'ALL CARDS OPEN' : '底牌全部公开',
            );
          }
          if (event.type === 'burn') {
            playOverlap(300);
            playBurn(430);
          }
          if (event.type === 'deal') {
            playDeal();
            const [title, note] = roundChapter(snapshot.round, snapshot.maxRounds, view.lang);
            playChapter('ROUND ' + String(snapshot.round).padStart(2, '0'), title, note);
          }
          if (event.type === 'select') {
            const card = query('[data-candidate-index="' + event.index + '"]');
            animate(card, [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }], {
              duration: 180,
            });
            ring(card, 12);
          }
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
  let pointerFrame = null;
  const pointer = { x: 0, y: 0 };
  function applyPointer() {
    pointerFrame = null;
    if (!running()) return;
    for (const node of root.querySelectorAll('[data-parallax]')) {
      const depth = Number(node.dataset.parallax) || 0.4;
      node.style.translate =
        (pointer.x * depth * 14).toFixed(1) + 'px ' + (pointer.y * depth * 10).toFixed(1) + 'px';
    }
  }
  function trackPointer(event) {
    if (!running()) return;
    pointer.x = (event.clientX / Math.max(1, win.innerWidth)) * 2 - 1;
    pointer.y = (event.clientY / Math.max(1, win.innerHeight)) * 2 - 1;
    const card = event.target?.closest?.('.battle-number, .battle-candidate');
    if (card) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--gx', ((event.clientX - rect.left) / rect.width) * 100 + '%');
      card.style.setProperty('--gy', ((event.clientY - rect.top) / rect.height) * 100 + '%');
    }
    if (pointerFrame === null) pointerFrame = win.requestAnimationFrame(applyPointer);
  }
  function resetPointer() {
    pointer.x = 0;
    pointer.y = 0;
    applyPointer();
  }

  document.addEventListener('visibilitychange', onVisibility, { signal: listeners.signal });
  win.addEventListener('resize', resize, { signal: listeners.signal, passive: true });
  win.addEventListener('scroll', cancelEffects, { signal: listeners.signal, passive: true });
  win.addEventListener('pointermove', trackPointer, { signal: listeners.signal, passive: true });
  win.addEventListener('pointerleave', resetPointer, { signal: listeners.signal, passive: true });
  media.addEventListener('change', syncPlayback, { signal: listeners.signal });
  resize();
  syncPlayback();
  return {
    capture,
    update,
    skipEnding,
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
      for (const node of root.querySelectorAll('[data-parallax]')) node.style.translate = '';
    },
  };
}
