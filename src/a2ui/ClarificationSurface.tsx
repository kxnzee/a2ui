import { useSyncExternalStore } from 'react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { ClarificationController } from './controller.js';

export function ClarificationSurface({ controller }: { controller: ClarificationController }) {
  const surface = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot, controller.getSnapshot,
  );
  return surface ? <A2uiSurface key={controller.getSurfaceKey()} surface={surface} /> : null;
}
