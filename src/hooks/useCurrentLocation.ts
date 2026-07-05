import { useCallback } from 'react';
import { locationService } from '../services/location/locationService';
import type { StructuredLocation } from '../services/location/types';
import { useLiveLocation } from './useLiveLocation';

export const useCurrentLocation = () => {
  const snapshot = useLiveLocation();
  const requestCurrentLocation = useCallback(() => locationService.startLiveTracking(true), []);
  const setManualLocation = useCallback((location: StructuredLocation) => locationService.setManualLocation(location), []);
  return {
    ...snapshot,
    requestCurrentLocation,
    refreshLocation: requestCurrentLocation,
    setManualLocation,
    stopLiveLocation: locationService.stopLiveTracking,
  };
};

export default useCurrentLocation;
