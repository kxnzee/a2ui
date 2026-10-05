import { useSyncExternalStore } from 'react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiController } from './controller.js';

export function A2uiView({ controller }: { controller: A2uiController }) {
  const surface = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot, controller.getSnapshot,
  );
  return surface ? <A2uiSurface key={controller.getSurfaceKey()} surface={surface} /> : null;
}
