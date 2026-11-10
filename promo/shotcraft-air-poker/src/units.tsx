import React from 'react';
import {
  AirShot,
  BrandShot,
  BuildShot,
  LedgerShot,
  OverlapShot,
  ShotLayer,
  WagerShot,
} from './components/Scenes';
import { SHOTS } from './timeline';

function unit<T extends object>(Component: React.FC<T>, duration: number, name: string) {
  const Unit: React.FC<T & { duration?: number }> = ({ duration: length = duration, ...props }) => (
    <ShotLayer duration={length}>
      <Component {...(props as T)} />
    </ShotLayer>
  );
  Unit.displayName = name;
  return Unit;
}
export const UNITS = {
  brand: unit(BrandShot, SHOTS.brand.duration, 'BrandUnit'),
  air: unit(AirShot, SHOTS.air.duration, 'AirUnit'),
  build: unit(BuildShot, SHOTS.build.duration, 'BuildUnit'),
  wager: unit(WagerShot, SHOTS.wager.duration, 'WagerUnit'),
  overlap: unit(OverlapShot, SHOTS.overlap.duration, 'OverlapUnit'),
  finale: unit(LedgerShot, SHOTS.finale.duration, 'FinaleUnit'),
};
