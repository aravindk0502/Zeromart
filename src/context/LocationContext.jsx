import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearActiveLocation, formatShortAddress, getRecentLocations, getSavedLocations,
  getLocationMode, locationService, saveNamedLocation,
} from '../services/location/locationService';
import { useLiveLocation } from '../hooks/useLiveLocation';

const LocationContext = createContext(null);
const PROMPT_KEY = 'zeromart-location-prompt-seen';

export function LocationProvider({ children }) {
  const live = useLiveLocation();
  const autoGpsStarted = useRef(false);
  const [recentLocations, setRecentLocations] = useState(getRecentLocations);
  const [savedLocations, setSavedLocations] = useState(getSavedLocations);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerOptions, setPickerOptions] = useState({});
  const [showPermission, setShowPermission] = useState(false);
  const refreshLists = useCallback(() => {
    setRecentLocations(getRecentLocations());
    setSavedLocations(getSavedLocations());
  }, []);

  useEffect(() => {
    locationService.initialize().then((snapshot) => {
      if (snapshot.location) {
        setShowPermission(false);
        refreshLists();
      }
      if (getLocationMode() === 'manual' && snapshot.location) {
        setShowPermission(false);
        return;
      }
      if (snapshot.permission === 'denied') {
        setShowPermission(false);
        if (!snapshot.location) setPickerOpen(true);
        return;
      } else if (!autoGpsStarted.current) {
        autoGpsStarted.current = true;
        locationService.detectCurrentPosition().then(() => {
          localStorage.setItem(PROMPT_KEY, 'true');
          setShowPermission(false);
          refreshLists();
        }).catch(() => {
          setShowPermission(false);
          if (!locationService.getSnapshot().location) setPickerOpen(true);
        });
      }
    }).catch(() => {});
  }, [refreshLists]);

  const setLocation = useCallback((nextLocation) => {
    const saved = locationService.setManualLocation(nextLocation);
    if (!saved) return null;
    refreshLists();
    localStorage.setItem(PROMPT_KEY, 'true');
    setShowPermission(false);
    return saved;
  }, [refreshLists]);

  const detectCurrentLocation = useCallback(async () => {
    try {
      const location = await locationService.detectCurrentPosition();
      localStorage.setItem(PROMPT_KEY, 'true');
      setShowPermission(false);
      refreshLists();
      return location;
    } catch (error) {
      if (error?.code === 1) {
        localStorage.setItem(PROMPT_KEY, 'true');
        setShowPermission(false);
        setPickerOpen(true);
      }
      throw error;
    }
  }, [refreshLists]);

  const saveLocation = useCallback((location) => {
    const saved = saveNamedLocation(location);
    setSavedLocations(saved);
    return saved;
  }, []);

  const clearLocation = useCallback(() => {
    locationService.stopLiveTracking();
    clearActiveLocation();
    window.location.reload();
  }, []);

  const value = useMemo(() => ({
    activeLocation: live.location,
    location: live.location,
    label: formatShortAddress(live.location),
    status: live.status === 'starting' ? 'locating' : live.status,
    isLocating: live.status === 'starting',
    isLive: live.status === 'watching',
    isOnline: live.online,
    error: live.error,
    locationError: live.error || null,
    notice: live.notice || '',
    permissionStatus: live.permission,
    recentLocations,
    savedLocations,
    showPermission,
    pickerOpen,
    setLocation,
    saveLocation,
    detectCurrentLocation,
    refreshLocation: detectCurrentLocation,
    useCurrentLocation: detectCurrentLocation,
    clearLocation,
    searchLocations: locationService.search,
    resolveSuggestion: locationService.resolveSuggestion,
    reverseGeocode: locationService.reverseGeocode,
    pickerOptions,
    openPicker: (options = {}) => {
      setPickerOptions(options && typeof options === 'object' && !('nativeEvent' in options) ? options : {});
      setPickerOpen(true);
    },
    closePicker: () => {
      setPickerOpen(false);
      setPickerOptions({});
    },
    chooseManually: () => {
      localStorage.setItem(PROMPT_KEY, 'true');
      setShowPermission(false);
      setPickerOpen(true);
    },
    dismissPermission: () => {
      localStorage.setItem(PROMPT_KEY, 'true');
      setShowPermission(false);
    },
  }), [
    clearLocation, detectCurrentLocation, live, pickerOpen, pickerOptions, recentLocations, savedLocations,
    saveLocation, setLocation, showPermission,
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export const useLocationEngine = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocationEngine must be used inside LocationProvider');
  return context;
};

export const useLocation = useLocationEngine;
