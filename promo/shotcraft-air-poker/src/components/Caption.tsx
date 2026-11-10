import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export const Caption: React.FC<{ text: string; duration: number }> = ({ text, duration }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, duration - 8, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ pointerEvents: 'none', justifyContent: 'flex-end', alignItems: 'center', opacity }}
    >
      <div
        style={{
          width: '100%',
          minHeight: 144,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '18px 80px 28px',
          background:
            'linear-gradient(180deg, rgba(243,242,238,0), rgba(243,242,238,.91) 26%, rgba(243,242,238,.97))',
        }}
      >
        <p
          style={{
            maxWidth: 1720,
            margin: 0,
            color: '#171917',
            fontFamily: '"Songti SC", "Noto Serif CJK SC", SimSun, Georgia, serif',
            fontSize: 64,
            fontWeight: 500,
            lineHeight: 1.35,
            letterSpacing: '0.045em',
            textAlign: 'center',
            textShadow: '0 1px 0 rgba(255,255,255,.76)',
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};
