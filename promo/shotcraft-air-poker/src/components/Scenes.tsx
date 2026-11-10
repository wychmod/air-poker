import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import ruleFacts from '../../public/captures/rule-facts.json';
import manifest from '../../public/captures/capture-manifest.json';
import { PageCam } from './PageCam';

const PAPER = '#f3f2ee';
const SURFACE = '#f8f7f2';
const INK = '#171917';
const GRAPHITE = '#73766e';
const RED = '#9c3737';
const SERIF = '"Songti SC", "Noto Serif CJK SC", SimSun, Georgia, serif';
const MONO = 'ui-monospace, Consolas, monospace';
const PAGE_H = manifest.viewport.pageCamPageHeightCss;
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

export const ShotLayer: React.FC<{ duration: number; children: React.ReactNode }> = ({
  children,
}) => <AbsoluteFill style={{ backgroundColor: PAPER }}>{children}</AbsoluteFill>;

export const BrandShot: React.FC<{ title?: string; kicker?: string }> = ({
  title = '空气扑克',
  kicker = '你下注的，是下一口空气。',
}) => {
  const frame = useCurrentFrame();
  const home = interpolate(frame, [62, 84], [0, 1], clamp);
  const groupOut = interpolate(frame, [72, 84], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.4, 0, 0.5, 1),
  });
  const vDraw = interpolate(frame, [0, 9], [100, 0], {
    ...clamp,
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const hDraw = interpolate(frame, [8, 18], [100, 0], clamp);
  const crossFade = interpolate(frame, [24, 34], [1, 0], clamp);
  const kickerChars = Math.floor(Math.max(0, frame - 28) / 2.2);
  const cursorOn = frame >= 28 && frame < 60 && Math.floor((frame - 28) / 3) % 2 === 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill
        style={{
          opacity: home,
          left: 1000,
          top: 235,
          width: 800,
          height: 450,
          overflow: 'hidden',
          border: '1px solid #d8d8d0',
          boxShadow: '0 24px 60px #17191715',
        }}
      >
        <div
          style={{
            position: 'relative',
            flexShrink: 0,
            width: 1920,
            height: 1080,
            transform: 'scale(.416666667)',
            transformOrigin: '0 0',
          }}
        >
          <PageCam
            src="captures/home.jpg"
            pageH={PAGE_H}
            keys={[
              { frame: 0, cx: 960, cy: 540, zoom: 1 },
              { frame: 50, cx: 960, cy: 540, zoom: 1 },
              { frame: 90, cx: 960, cy: 540, zoom: 1 },
            ]}
          />
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 58,
          color: GRAPHITE,
          fontFamily: SERIF,
          fontSize: 32,
          letterSpacing: '0.03em',
        }}
      >
        改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇 · 非官方爱好者改编
      </div>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          opacity: 1,
          transform: `translateX(${-500 * home}px) scale(${1 - home * 0.2})`,
        }}
      >
        <svg
          width={72}
          height={72}
          viewBox="0 0 72 72"
          style={{ display: 'block', margin: '0 auto 28px', opacity: crossFade }}
        >
          <line
            x1={36}
            y1={2}
            x2={36}
            y2={70}
            stroke={RED}
            strokeWidth={3}
            strokeLinecap="square"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={vDraw}
          />
          <line
            x1={2}
            y1={36}
            x2={70}
            y2={36}
            stroke={RED}
            strokeWidth={3}
            strokeLinecap="square"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={hDraw}
          />
        </svg>
        <div
          style={{
            display: 'flex',
            fontFamily: SERIF,
            fontSize: 138,
            color: INK,
            letterSpacing: '0.08em',
            lineHeight: 1.06,
          }}
        >
          {title.split('').map((char, index) => {
            const start = 10 + index * 3;
            const t = interpolate(frame, [start, start + 12], [0, 1], {
              ...clamp,
              easing: Easing.bezier(0.2, 0.7, 0.25, 1),
            });
            const glint = interpolate(
              frame,
              [start + 8, start + 12, start + 16],
              [0, 0.9, 0],
              clamp,
            );
            return (
              <span
                key={index}
                style={{
                  position: 'relative',
                  opacity: t,
                  transform: `scale(${1.6 - 0.6 * t})`,
                  transformOrigin: 'center bottom',
                  filter: `blur(${(1 - t) * 5}px)`,
                }}
              >
                {char}
                <span
                  style={{
                    position: 'absolute',
                    left: '22%',
                    right: '22%',
                    bottom: 0,
                    height: 2,
                    backgroundColor: RED,
                    opacity: glint,
                  }}
                />
              </span>
            );
          })}
        </div>
        <div
          style={{
            height: 36,
            marginTop: 26,
            color: GRAPHITE,
            fontFamily: SERIF,
            fontSize: 38,
            letterSpacing: '0.16em',
          }}
        >
          {kicker.slice(0, kickerChars)}
          <span
            style={{
              display: 'inline-block',
              width: 9,
              height: 27,
              marginLeft: 4,
              backgroundColor: RED,
              verticalAlign: '-3px',
              opacity: cursorOn ? 0.8 : 0,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const AirShot: React.FC<{ heading?: string }> = ({ heading = '空气，也是时间。' }) => {
  const f = useCurrentFrame();
  const box = manifest.elements['air-resources'].box;
  const lift =
    interpolate(f, [56, 66], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) }) *
    (1 -
      interpolate(f, [124, 142], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.3, 1.05) }));
  const note = interpolate(f, [60, 80], [0, 1], clamp);
  const cover = interpolate(f, [10, 38], [0, 0.98], clamp);
  const scan1 = interpolate(f, [68, 82], [0, 1], clamp);
  const scan2 = interpolate(f, [88, 108], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <PageCam
        src="captures/hand.jpg"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 960, cy: 420, zoom: 1, rotY: 0, rotX: 0, persp: 2400 },
          { frame: 40, cx: 960, cy: 420, zoom: 1, rotY: 0, rotX: 0, persp: 2400 },
          { frame: 58, cx: 960, cy: 255, zoom: 1.26, rotY: 8, rotX: 3, persp: 2400 },
          { frame: 180, cx: 960, cy: 255, zoom: 1.26, rotY: 8, rotX: 3, persp: 2400 },
        ]}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: PAPER,
            opacity: cover,
            transform: 'translateZ(1px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            background: PAPER,
            border: '1px solid #d8d8d0',
            transform: 'translateZ(2px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            transform: `translateZ(${2 + 110 * lift}px)`,
            boxShadow: `${-15 * lift}px ${35 * lift}px ${50 * lift}px rgba(23,25,23,.18)`,
          }}
        >
          <Img
            src={staticFile('captures/air-resources.png')}
            style={{ width: '100%', height: '100%' }}
          />
          <svg
            width={box.width}
            height={box.height}
            style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
          >
            {[scan1, scan2].map((progress, i) => (
              <rect
                key={i}
                x={1}
                y={1}
                width={box.width - 2}
                height={box.height - 2}
                fill="none"
                stroke={INK}
                strokeWidth={i ? 1.4 : 2.4}
                pathLength={1}
                strokeDasharray=".16 1"
                strokeDashoffset={-progress}
                opacity={(i ? f >= 88 && f <= 108 : f >= 68 && f <= 82) ? (i ? 0.38 : 0.65) : 0}
              />
            ))}
          </svg>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 410,
            top: 290,
            color: INK,
            opacity: note,
            transform: `translateZ(${4 + 28 * lift}px)`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 14, color: GRAPHITE, letterSpacing: '.14em' }}>
            AIR / ONE RESOURCE, TWO PURPOSES
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 66, fontWeight: 500, margin: '24px 0 20px' }}>
            {heading}
          </h2>
          <div style={{ width: 68, height: 2, background: RED, marginBottom: 24 }} />
          <div style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.8 }}>
            未开储备才可下注。
            <br />
            当前呼吸罐，持续供气。
          </div>
        </div>
      </PageCam>
    </AbsoluteFill>
  );
};

const cardTargets = Array.from({ length: 5 }, (_, i) => ({ x: 691.5 + 75 * i, y: 576.3125 }));
// Five physical cards: accelerate 18 → 12.6 → 7.2 → 1.8 frames.
const cueFor = (i: number) => 36 + 18 * i - 2.7 * i * (i - 1);
export const BuildShot: React.FC<{ heading?: string }> = ({ heading = '五张牌。一个目标。' }) => {
  const f = useCurrentFrame();
  const ant = interpolate(f, [26, 36], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <PageCam
        src="captures/hand.jpg"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 1040, cy: 470, zoom: 1.28 },
          { frame: 30, cx: 1040, cy: 470, zoom: 1.28 },
          { frame: 90, cx: 960, cy: 490, zoom: 1.43 },
          { frame: 150, cx: 960, cy: 490, zoom: 1.43 },
        ]}
      >
        {f < 100 && (
          <div
            style={{
              position: 'absolute',
              left: 681,
              top: 565,
              width: 394,
              height: 112,
              background: '#eeeee6',
            }}
          />
        )}
        {cardTargets.map((target, i) => {
          const cue = cueFor(i),
            inPile = f < cue,
            landed = f >= cue + 14;
          if (landed) return null;
          const t = interpolate(f, [cue, cue + 8], [0, 1], {
            ...clamp,
            easing: Easing.bezier(0.3, 0, 0.2, 1),
          });
          const settle = interpolate(f, [cue + 8, cue + 12], [0, 1], {
            ...clamp,
            easing: Easing.bezier(0.3, 1.15, 0.25, 1),
          });
          const sx = 1260 + i * 3,
            sy = 390 - i * 3;
          const x = inPile ? sx + (i === 0 ? ant * 30 : 0) : sx + (target.x - sx) * t;
          const y = inPile
            ? sy + 48 * ant
            : sy + (target.y - sy) * t - 48 * Math.sin(Math.PI * t) - 18 * (1 - settle) * t;
          return (
            <Img
              key={i}
              src={staticFile(`captures/hand-card-0${i + 1}.png`)}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 65,
                height: 92,
                transform: `rotate(${(i - 2) * 2 * (1 - t)}deg) scale(${1 + 0.06 * Math.sin(Math.PI * t)})`,
                boxShadow: `0 ${3 + 18 * (1 - settle)}px ${5 + 14 * (1 - settle)}px rgba(23,25,23,.18)`,
                zIndex: 10 - i,
              }}
            />
          );
        })}
        {cardTargets.map((target, i) =>
          f >= cueFor(i) + 14 && f < 100 ? (
            <Img
              key={i}
              src={staticFile(`captures/hand-card-0${i + 1}.png`)}
              style={{ position: 'absolute', left: target.x, top: target.y, width: 65, height: 92 }}
            />
          ) : null,
        )}
      </PageCam>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 130,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          fontFamily: SERIF,
          fontSize: 36,
          color: INK,
          background: PAPER,
          padding: '8px 125px',
        }}
      >
        {heading}
      </div>
    </AbsoluteFill>
  );
};

export const WagerShot: React.FC<{ heading?: string }> = ({
  heading = '看见目标，猜不透底牌。',
}) => (
  <AbsoluteFill style={{ backgroundColor: PAPER }}>
    <PageCam
      src="captures/bet.jpg"
      pageH={PAGE_H}
      keys={[
        { frame: 0, cx: 960, cy: 505, zoom: 1.16 },
        { frame: 110, cx: 960, cy: 505, zoom: 1.38 },
        { frame: 150, cx: 960, cy: 505, zoom: 1.38 },
      ]}
    />
    <div
      style={{
        position: 'absolute',
        left: 110,
        top: 55,
        fontFamily: SERIF,
        fontSize: 36,
        color: INK,
        background: PAPER,
        padding: '8px 125px',
      }}
    >
      {heading}
    </div>
  </AbsoluteFill>
);

type CardFact = { rank: string; suit: string; red: boolean; id: string };
const CardFace: React.FC<{ card: CardFact; highlight?: boolean }> = ({ card, highlight }) => (
  <div
    style={{
      width: 92,
      height: 130,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '8px 9px',
      color: card.red ? RED : INK,
      backgroundColor: SURFACE,
      border: `1px solid ${highlight ? RED : '#77796f'}`,
      boxShadow: '0 3px 0 rgba(23,25,23,.12)',
      fontFamily: SERIF,
    }}
  >
    <span style={{ fontSize: 34, lineHeight: 1 }}>{card.rank}</span>
    <span style={{ fontSize: 45, textAlign: 'right', lineHeight: 1 }}>{card.suit}</span>
  </div>
);

export const OverlapShot: React.FC<{ heading?: string }> = ({
  heading = '撞牌，会付出额外代价。',
}) => {
  const f = useCurrentFrame();
  const paper = interpolate(f, [24, 32], [0, 1], clamp);
  const data = ruleFacts;
  const shared = new Set(data.overlap);
  const punch = interpolate(f, [32, 38, 43], [0.94, 1.025, 1], {
    ...clamp,
    easing: Easing.bezier(0.65, 0, 0.85, 1),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill style={{ opacity: 1 - paper }}>
        <PageCam
          src="captures/showdown.jpg"
          pageH={PAGE_H}
          keys={[{ frame: 0, cx: 960, cy: 520, zoom: 1.28 }]}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: paper, backgroundColor: PAPER }}>
        <div
          style={{
            position: 'absolute',
            left: 160,
            top: 100,
            color: RED,
            fontFamily: MONO,
            fontSize: 34,
            letterSpacing: '.08em',
          }}
        >
          规则示例 · 非本局记录
        </div>
        <div
          style={{
            position: 'absolute',
            left: 160,
            top: 160,
            right: 160,
            transform: `scale(${punch})`,
            transformOrigin: '50% 55%',
          }}
        >
          <h2
            style={{
              fontFamily: SERIF,
              color: INK,
              fontSize: 65,
              fontWeight: 500,
              margin: '0 0 36px',
            }}
          >
            {heading}
          </h2>
          <div style={{ display: 'flex', gap: 130 }}>
            {[
              { label: '胜者 / 四条 · 目标 24', cards: data.upper },
              { label: '败者 / 三条 · 目标 24', cards: data.lower },
            ].map(({ label, cards }) => (
              <div key={label}>
                <div style={{ fontFamily: SERIF, fontSize: 34, marginBottom: 22, color: GRAPHITE }}>
                  {label}
                </div>
                <div style={{ display: 'flex', gap: 15 }}>
                  {cards.map((card) => (
                    <CardFace key={card.id} card={card} highlight={shared.has(card.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 33, color: GRAPHITE, margin: '25px 0 28px' }}>
            红框：两手相同的实体牌。双方均为有效成手。
          </div>
          <div
            style={{
              borderTop: '1px solid #c9c9bf',
              borderBottom: '1px solid #c9c9bf',
              padding: '23px 0 25px',
              display: 'flex',
              alignItems: 'center',
              gap: 50,
              color: INK,
            }}
          >
            <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.7 }}>
              败者未开储备
              <br />
              <span style={{ fontSize: 32, color: GRAPHITE }}>本轮已投入 6 AIR</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 87 }}>
              18<span style={{ fontSize: 24 }}> AIR</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 66, color: RED }}>−6</div>
            <div style={{ fontFamily: MONO, fontSize: 38, color: GRAPHITE }}>→</div>
            <div style={{ fontFamily: MONO, fontSize: 87 }}>
              12<span style={{ fontSize: 24 }}> AIR</span>
            </div>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 32, color: GRAPHITE, marginTop: 22 }}>
            灾厄追加烧毁，按败者投入与可用余额计算。
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const LedgerShot: React.FC<{ title?: string; cta?: string; url?: string }> = ({
  title = '空气扑克',
  cta = '打开浏览器，即刻入局。',
  url = 'wychmod.github.io/air-poker',
}) => {
  const frame = useCurrentFrame();
  const paper = interpolate(frame, [64, 78], [0, 1], clamp);
  const elements = [
    {
      id: 'resources',
      src: 'captures/air-resources.png',
      x: 126,
      y: 165,
      width: 740,
      height: 65,
      sx: -800,
      sy: -200,
      cue: 73,
    },
    {
      id: 'cards',
      src: 'captures/five-card-hand.png',
      x: 65,
      y: 565,
      width: 330,
      height: 84,
      sx: -620,
      sy: 260,
      cue: 79,
    },
    {
      id: 'hidden',
      src: 'captures/hidden-opponent-hand.png',
      x: 1530,
      y: 350,
      width: 330,
      height: 30,
      sx: 700,
      sy: -150,
      cue: 85,
    },
    {
      id: 'ledger',
      src: 'captures/review-totals.png',
      x: 580,
      y: 890,
      width: 760,
      height: 66,
      sx: 700,
      sy: 300,
      cue: 91,
    },
  ];
  const wordmark = interpolate(frame, [105, 126], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.2, 0.7, 0.25, 1),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill style={{ opacity: 1 - paper }}>
        <PageCam
          src="captures/review.jpg"
          pageH={PAGE_H}
          keys={[
            { frame: 0, cx: 960, cy: 500, zoom: 1.28 },
            { frame: 45, cx: 960, cy: 520, zoom: 1.34 },
            { frame: 78, cx: 960, cy: 520, zoom: 1.34 },
          ]}
        >
          <ReviewRows frame={frame} />
        </PageCam>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: paper,
          transform: `perspective(1400px) rotateX(${4 * (1 - interpolate(frame, [73, 113], [0, 1], clamp))}deg) scale(${1.06 - 0.06 * interpolate(frame, [73, 113], [0, 1], clamp)})`,
          transformOrigin: '50% 45%',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(103,103,95,.22) .55px, transparent .65px)',
            backgroundSize: '6px 6px',
            opacity: 0.32,
          }}
        />
        {elements.map((element) => {
          const t = interpolate(frame, [element.cue, element.cue + 16], [0, 1], {
            ...clamp,
            easing: Easing.bezier(0.34, 1.4, 0.44, 1),
          });
          const alpha = interpolate(frame, [element.cue, element.cue + 3], [0, 1], clamp);
          const rotate =
            (element.id === 'ledger' ? -1.2 : element.id === 'cards' ? 1.6 : 0) * (1 - t);
          const x = element.sx * (1 - t);
          const y = element.sy * (1 - t);
          return (
            <Img
              key={element.id}
              src={staticFile(element.src)}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                objectFit: 'fill',
                opacity: alpha * (1 - 0.08 * wordmark),
                transform: `perspective(900px) translate(${x}px, ${y}px) rotateX(${14 * (1 - t)}deg) rotate(${rotate}deg) scale(${1.05 - 0.05 * t})`,
                boxShadow: `0 ${8 * (1 - t) + 2}px ${18 * (1 - t) + 4}px rgba(23,25,23,${0.16 * (1 - t) + 0.08})`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: 420,
            top: 325,
            width: 1080,
            textAlign: 'center',
            opacity: wordmark,
            transform: `translateY(${(1 - wordmark) * 22}px)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <div
              style={{
                width: 92,
                height: 92,
                display: 'grid',
                placeItems: 'center',
                border: `2px solid ${INK}`,
                color: INK,
                fontFamily: SERIF,
                fontSize: 20,
                transform: 'rotate(-3deg)',
              }}
            >
              A/P
            </div>
            <div
              style={{
                color: INK,
                fontFamily: SERIF,
                fontSize: 128,
                letterSpacing: '0.06em',
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
          </div>
          <div style={{ width: 170, height: 2, margin: '24px auto 19px', backgroundColor: RED }} />
          <div style={{ color: INK, fontFamily: SERIF, fontSize: 56, letterSpacing: '0.04em' }}>
            {cta}
          </div>
          <div
            style={{
              marginTop: 17,
              color: GRAPHITE,
              fontFamily: MONO,
              fontSize: 44,
              letterSpacing: '0.02em',
            }}
          >
            {url}
          </div>
          <div
            style={{
              marginTop: 25,
              color: GRAPHITE,
              fontFamily: SERIF,
              fontSize: 32,
              lineHeight: 1.6,
              letterSpacing: '0.035em',
            }}
          >
            改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇
            <br />
            非官方爱好者改编 · 数字版规则有调整
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 112,
            bottom: 64,
            color: GRAPHITE,
            fontFamily: MONO,
            fontSize: 13,
            letterSpacing: '0.16em',
            opacity: 0.82,
          }}
        >
          AIR POKER / FINISH
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ReviewRows: React.FC<{ frame: number }> = ({ frame }) => {
  const box = manifest.elements['review-totals'].box;
  return (
    <>
      {[0, 1].map((i) => {
        const cue = 12 + i * 10,
          land = cue + 12;
        if (frame >= land + 8) return null;
        const t = interpolate(frame, [cue, land], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.5, 0, 0.8, 0.75),
        });
        const half = box.width / 2;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute',
                left: box.x + i * half,
                top: box.y,
                width: half,
                height: box.height,
                background: PAPER,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: box.x + i * half,
                top: box.y,
                width: half,
                height: box.height,
                overflow: 'hidden',
                opacity: frame < cue ? 0 : 1,
                transform: `perspective(900px) translateY(${-120 * (1 - t)}px) rotateX(${16 * (1 - t)}deg)`,
                boxShadow: `0 ${8 * (1 - t)}px ${16 * (1 - t)}px #17191718`,
              }}
            >
              <Img
                src={staticFile('captures/review-totals.png')}
                style={{
                  position: 'absolute',
                  left: -i * half,
                  top: 0,
                  width: box.width,
                  height: box.height,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: RED,
                  opacity:
                    frame >= land ? 1 - interpolate(frame, [land, land + 8], [0, 1], clamp) : 0,
                }}
              />
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};
