import { useEffect, useState } from 'react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiProcessor } from './processor.js';

export function A2uiView({ processor }: { processor: A2uiProcessor }) {
  const [surfaces, setSurfaces] = useState(() => [...processor.model.surfacesMap.values()]);
  useEffect(() => {
    const sync = () => setSurfaces([...processor.model.surfacesMap.values()]);
    const created = processor.onSurfaceCreated(sync);
    const deleted = processor.onSurfaceDeleted(sync);
    sync();
    return () => { created.unsubscribe(); deleted.unsubscribe(); };
  }, [processor]);
  return <>{surfaces.map(surface => <A2uiSurface key={surface.id} surface={surface} />)}</>;
}
