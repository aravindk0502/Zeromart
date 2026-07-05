import { useEffect, useSyncExternalStore } from 'react';
import { locationService } from '../services/location/locationService';

export const useLiveLocation = () => {
  const snapshot = useSyncExternalStore(
    locationService.subscribe,
    locationService.getSnapshot,
    locationService.getSnapshot
  );

  useEffect(() => {
    locationService.initialize().catch(() => {});
  }, []);

  return snapshot;
};

export default useLiveLocation;
