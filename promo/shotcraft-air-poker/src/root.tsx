import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './timeline';
import { AirPokerPromo } from './film';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="AirPokerPromo"
    component={AirPokerPromo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{ bgm: true }}
  />
);
