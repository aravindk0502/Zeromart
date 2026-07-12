import type { LocationPermissionState } from './types';

const isIPhoneLikeBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(String(navigator.userAgent || ''));
};

export const getLocationBlockedHelpText = () => {
  if (isIPhoneLikeBrowser()) return 'Enable location from browser settings, or choose address manually.';
  return 'Location access is blocked. Enable it in browser settings or choose an address manually.';
};

export const getLocationPermission = async (): Promise<LocationPermissionState> => {
  if (!navigator.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    return 'unknown';
  }
};

export const locationErrorMessage = (error: GeolocationPositionError | any) => {
  const messages: Record<number, string> = {
    1: getLocationBlockedHelpText(),
    2: 'GPS signal is unavailable. Check your connection or choose an address manually.',
    3: 'GPS is taking too long. Move near a window or choose an address manually.',
  };
  return messages[Number(error?.code)] || error?.message || 'Your live location could not be updated.';
};

export const watchDevicePosition = (
  onPosition: PositionCallback,
  onError: PositionErrorCallback
) => {
  if (!navigator.geolocation) throw new Error('Geolocation is not supported by this browser.');
  return navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 10000,
  });
};

const requestPosition = (options: PositionOptions) => {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let settled = false;
    const finish = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guardTimer);
      callback(value);
    };
    const guardTimer = window.setTimeout(() => {
      const error = new Error('Location request timed out.');
      (error as any).code = 3;
      finish(reject, error);
    }, Number(options.timeout || 15000) + 1000);

    navigator.geolocation.getCurrentPosition(
      (position) => finish(resolve, position),
      (error) => finish(reject, error),
      options
    );
  });
};

export const getDevicePosition = async () => {
  if (!navigator.geolocation) throw new Error('Geolocation is not supported by this browser.');
  try {
    return await requestPosition({
      enableHighAccuracy: true,
      timeout: 6000,
      maximumAge: 15000,
    });
  } catch (error: any) {
    if (Number(error?.code) === 1) throw error;
    return requestPosition({
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 120000,
    });
  }
};

export const stopWatchingPosition = (watchId: number | null) => {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
};
