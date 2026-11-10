// Adapted from video-shotcraft assets/lib/PageCam.tsx.
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

export type CamKey = {
  frame: number;
  cx: number;
  cy: number;
  zoom: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  persp?: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const PageCam: React.FC<{
  src: string;
  pageH: number;
  keys: CamKey[];
  children?: React.ReactNode;
  frame?: number;
  ease?: (t: number) => number;
}> = ({ src, pageH, keys, children, frame: frameProp, ease = Easing.bezier(0.33, 0, 0.15, 1) }) => {
  const ownFrame = useCurrentFrame();
  const frame = frameProp ?? ownFrame;
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i].frame && frame <= keys[i + 1].frame) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const t =
    a.frame === b.frame
      ? 1
      : interpolate(frame, [a.frame, b.frame], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: ease,
        });
  const cx = lerp(a.cx, b.cx, t);
  const cy = lerp(a.cy, b.cy, t);
  const zoom = lerp(a.zoom, b.zoom, t);
  const has3D = keys.some(
    (key) =>
      key.rotX !== undefined ||
      key.rotY !== undefined ||
      key.rotZ !== undefined ||
      key.persp !== undefined,
  );

  if (!has3D) {
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#f3f2ee' }}>
        <div
          style={{
            position: 'absolute',
            width: WIDTH,
            height: pageH,
            transform: `translate(${WIDTH / 2 - cx * zoom}px, ${HEIGHT / 2 - cy * zoom}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <Img
            src={staticFile(src)}
            style={{ position: 'absolute', width: WIDTH, height: pageH }}
          />
          {children}
        </div>
      </AbsoluteFill>
    );
  }

  const mix = (key: keyof CamKey) => lerp(Number(a[key] ?? 0), Number(b[key] ?? 0), t);
  const rotX = mix('rotX');
  const rotY = mix('rotY');
  const rotZ = mix('rotZ');
  const persp = lerp(a.persp ?? 1400, b.persp ?? 1400, t);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#f3f2ee' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          perspective: `${persp * zoom}px`,
          perspectiveOrigin: `${WIDTH / 2}px ${HEIGHT / 2}px`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: WIDTH,
            height: pageH,
            zoom,
            transform: `translate(${WIDTH / 2 / zoom - cx}px, ${HEIGHT / 2 / zoom - cy}px) rotateY(${rotY}deg) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transformStyle: 'preserve-3d',
          }}
        >
          <Img
            src={staticFile(src)}
            style={{ position: 'absolute', width: WIDTH, height: pageH }}
          />
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const WIDTH = 1920;
const HEIGHT = 1080;
