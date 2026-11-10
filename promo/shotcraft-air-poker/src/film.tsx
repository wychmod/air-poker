import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Caption } from './components/Caption';
import { BGM, CAPTIONS, SHOTS } from './timeline';
import { UNITS } from './units';

export const AirPokerPromo: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => (
  <AbsoluteFill style={{ backgroundColor: '#f3f2ee' }}>
    {Object.values(SHOTS).map((shot) => {
      const Component = UNITS[shot.id];
      return (
        <Sequence key={shot.id} from={shot.from} durationInFrames={shot.duration} name={shot.label}>
          <Component />
        </Sequence>
      );
    })}
    {CAPTIONS.map((caption, index) => (
      <Sequence key={index} from={caption.from} durationInFrames={caption.duration}>
        <Caption text={caption.text} duration={caption.duration} />
      </Sequence>
    ))}
    {bgm
      ? BGM.map((track, index) => (
          <Sequence key={index} from={track.from} durationInFrames={track.duration}>
            <Audio src={staticFile(track.src)} volume={track.volume} />
          </Sequence>
        ))
      : null}
  </AbsoluteFill>
);
