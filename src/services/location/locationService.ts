import { formatDistance, haversineKm, sortByNearest } from './distance';
import { getAutocompleteSuggestions, getPlaceDetails } from './geocode';
import { getDevicePosition, getLocationPermission, locationErrorMessage, stopWatchingPosition, watchDevicePosition } from './permission';
import { reverseGeocodeCoordinates } from './reverseGeocode';
import type {
  Coordinates, LiveLocationSnapshot, LocationPermissionState, PlaceSuggestion, StructuredLocation,
} from './types';

const LEGACY_KEY = 'zeromart-location-v1';
const ACTIVE_KEY = 'zm_active_location';
const RECENT_KEY = 'zm_recent_locations';
const SAVED_KEY = 'zm_saved_locations';
const MODE_KEY = 'zm_location_mode_v1';
const CURRENT_GPS_KEY = 'currentGpsLocation';
const MANUAL_LOCATION_KEY = 'manualSelectedLocation';
const LAST_SAVED_KEY = 'savedLocation';
const ADDRESS_CACHE_KEY = 'zm_google_address_cache_v2';
const MAX_RECENT = 5;
const MAX_SAVED = 8;
const MOVEMENT_THRESHOLD_KM = 0.03;
const MAX_UPDATE_INTERVAL_MS = 60_000;
const ADDRESS_REFRESH_INTERVAL_MS = 5 * 60_000;

const emptyFields = {
  country: 'India', countryCode: 'in', state: '', district: '', city: '', locality: '', subLocality: '',
  area: '', street: '', streetNumber: '', houseNumber: '', doorNo: '', buildingName: '', floor: '',
  landmark: '', addressType: '' as const,
  postalCode: '', postcode: '', pincode: '', formattedAddress: '', fullAddress: '',
  displayAddress: '', displayName: '', name: '', shortName: '', plusCode: '', placeId: '',
};

export const EMPTY_LOCATION: StructuredLocation = {
  latitude: 0,
  longitude: 0,
  lat: 0,
  lng: 0,
  accuracy: null,
  ...emptyFields,
  source: 'coordinates',
  updatedAt: '',
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T): T => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory location remains usable if storage is full or blocked.
  }
  return value;
};

const coordinateKey = (location: Coordinates, precision = 4) => {
  const latitude = Number(location?.latitude ?? location?.lat);
  const longitude = Number(location?.longitude ?? location?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude.toFixed(precision)}:${longitude.toFixed(precision)}`
    : '';
};

const uniqueParts = (parts: unknown[]) => [...new Set(parts.map(String).map((part) => part.trim()).filter(Boolean))];
const safeText = (value: unknown, fallback = '') => (
  value == null || ['undefined', 'null'].includes(String(value).trim().toLowerCase())
    ? fallback
    : String(value).trim()
);
export const INDIA_ONLY_ERROR = 'ZeroMart is currently available only in India. Please select an Indian location.';

export const isIndiaLocation = (input: any) => {
  const countryCode = String(input?.countryCode || input?.country_code || '').trim().toLowerCase();
  const country = String(input?.country || '').trim().toLowerCase();
  return countryCode === 'in' || country === 'india';
};

export const assertIndiaLocation = <T extends Record<string, any>>(input: T): T => {
  if (!isIndiaLocation(input)) throw new Error(INDIA_ONLY_ERROR);
  return input;
};

export const normalizeLocation = (input: any): StructuredLocation | null => {
  if (!input) return null;
  const latitude = Number(input.latitude ?? input.lat);
  const longitude = Number(input.longitude ?? input.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const postalCode = safeText(input.postalCode || input.postcode || input.pincode);
  const formattedAddress = safeText(input.formattedAddress || input.fullAddress || input.displayName);
  const locality = safeText(input.locality || input.subLocality || input.area);
  const subLocality = safeText(input.subLocality || input.area || locality);
  const area = safeText(input.area || subLocality || locality);
  const street = safeText(input.street);
  const city = safeText(input.city);
  const district = safeText(input.district);
  const state = safeText(input.state);
  const doorNo = safeText(input.doorNo || input.houseNumber);
  const buildingName = safeText(input.buildingName);
  const floor = safeText(input.floor);
  const landmark = safeText(input.landmark);
  const shortName = safeText(input.shortName) || uniqueParts([
    doorNo,
    street || area || locality || city,
    area && area !== street ? area : '',
  ]).slice(0, 3).join(', ');
  const normalizedCountryCode = safeText(input.countryCode, 'in').toLowerCase();
  const country = normalizedCountryCode === 'in' || safeText(input.country).toLowerCase() === 'india'
    ? 'India'
    : safeText(input.country, 'India');
  return {
    ...EMPTY_LOCATION,
    ...input,
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(Number(input.accuracy)) ? Number(input.accuracy) : null,
    locality,
    subLocality,
    area,
    street,
    streetNumber: safeText(input.streetNumber),
    houseNumber: safeText(input.houseNumber),
    doorNo,
    buildingName,
    floor,
    landmark,
    addressType: safeText(input.addressType) as StructuredLocation['addressType'],
    country,
    countryCode: normalizedCountryCode,
    state,
    district,
    city,
    postalCode,
    postcode: postalCode,
    pincode: postalCode,
    formattedAddress,
    fullAddress: formattedAddress,
    displayAddress: safeText(input.displayAddress) || shortName || formattedAddress || 'Current GPS location',
    displayName: formattedAddress,
    name: safeText(input.name),
    shortName: shortName || formattedAddress || 'Current GPS location',
    plusCode: safeText(input.plusCode),
    placeId: safeText(input.placeId),
    source: input.source || 'saved',
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
};

export const withAddressDetails = (input: any, details: any = {}) => {
  const location = normalizeLocation({ ...input, ...details });
  if (!location) throw new Error('Choose a valid location first.');
  assertIndiaLocation(location);
  const doorNo = String(details.doorNo ?? location.doorNo ?? '').trim();
  const buildingName = String(details.buildingName ?? location.buildingName ?? '').trim();
  const floor = String(details.floor ?? location.floor ?? '').trim();
  const landmark = String(details.landmark ?? location.landmark ?? '').trim();
  const addressType = (details.addressType === 'Work' ? 'Office' : details.addressType)
    || (location.addressType === ('Work' as any) ? 'Office' : location.addressType)
    || 'Other';
  const displayAddress = uniqueParts([
    doorNo,
    location.street || location.subLocality || location.area,
    location.area && location.area !== location.street ? location.area : '',
  ]).join(', ');
  const formattedAddress = uniqueParts([
    doorNo,
    buildingName,
    floor,
    location.street,
    location.subLocality || location.area || location.locality,
    landmark,
    location.city,
    location.district && location.district !== location.city ? location.district : '',
    location.state,
    location.postalCode,
    'India',
  ]).join(', ');
  return normalizeLocation({
    ...location,
    doorNo,
    houseNumber: doorNo || location.houseNumber,
    buildingName,
    floor,
    landmark,
    addressType,
    country: 'India',
    countryCode: 'in',
    displayAddress: displayAddress || formattedAddress,
    shortName: displayAddress || location.shortName,
    formattedAddress,
    fullAddress: formattedAddress,
    displayName: formattedAddress,
  })!;
};

const cacheAddress = (location: StructuredLocation) => {
  const key = coordinateKey(location);
  if (!key) return;
  const cache = readJson<Record<string, StructuredLocation>>(ADDRESS_CACHE_KEY, {});
  writeJson(ADDRESS_CACHE_KEY, { ...cache, [key]: location });
};

const getCachedAddress = (coordinates: Coordinates) => (
  normalizeLocation(readJson<Record<string, StructuredLocation>>(ADDRESS_CACHE_KEY, {})[coordinateKey(coordinates)])
);

const hasUsableAddress = (location: StructuredLocation | null) => Boolean(
  location
  && (location.street || location.area || location.locality || location.city || location.district)
  && !/^current gps location$/i.test(location.shortName || '')
  && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.formattedAddress || '')
);

const lookupAddress = async (latitude: number, longitude: number, source: any, accuracy: number | null) => {
  return reverseGeocodeCoordinates(latitude, longitude, source, accuracy);
};

export const getRecentLocations = () => readJson<any[]>(RECENT_KEY, [])
  .map(normalizeLocation).filter((location) => location && isIndiaLocation(location)).slice(0, MAX_RECENT) as StructuredLocation[];
export const getSavedLocations = () => readJson<any[]>(SAVED_KEY, [])
  .map(normalizeLocation).filter((location) => location && isIndiaLocation(location)).slice(0, MAX_SAVED) as StructuredLocation[];

export const saveRecentLocation = (input: StructuredLocation) => {
  const location = normalizeLocation(input);
  if (!location || !isIndiaLocation(location)) return getRecentLocations();
  const next = [location, ...getRecentLocations().filter((entry) => (
    (haversineKm(location, entry) ?? Number.POSITIVE_INFINITY) >= 0.05
  ))].slice(0, MAX_RECENT);
  writeJson(RECENT_KEY, next);
  cacheAddress(location);
  return next;
};

export const saveNamedLocation = (input: StructuredLocation) => {
  const location = normalizeLocation(input);
  if (!location) return getSavedLocations();
  assertIndiaLocation(location);
  const key = coordinateKey(location, 5);
  const next = [location, ...getSavedLocations().filter((entry) => coordinateKey(entry, 5) !== key)].slice(0, MAX_SAVED);
  return writeJson(SAVED_KEY, next);
};

export const getActiveLocation = () => {
  const mode = getLocationMode();
  const manual = normalizeLocation(readJson(MANUAL_LOCATION_KEY, null));
  const currentGps = normalizeLocation(readJson(CURRENT_GPS_KEY, null));
  if (mode === 'manual' && manual && isIndiaLocation(manual)) return manual;
  if (mode === 'gps' && currentGps && isIndiaLocation(currentGps)) return currentGps;
  if (manual && isIndiaLocation(manual)) return manual;
  if (currentGps && isIndiaLocation(currentGps)) return currentGps;
  const active = normalizeLocation(readJson(ACTIVE_KEY, null));
  if (active && isIndiaLocation(active)) return active;
  const legacy = normalizeLocation(readJson(LEGACY_KEY, null));
  if (legacy && isIndiaLocation(legacy)) {
    writeJson(ACTIVE_KEY, legacy);
    return legacy;
  }
  return null;
};

export const saveActiveLocation = (input: StructuredLocation) => {
  const location = normalizeLocation(input);
  if (!location) return null;
  assertIndiaLocation(location);
  const saved = { ...location, updatedAt: location.updatedAt || new Date().toISOString() };
  writeJson(ACTIVE_KEY, saved);
  writeJson(LEGACY_KEY, saved);
  writeJson(LAST_SAVED_KEY, saved);
  if (['gps', 'live-gps'].includes(saved.source)) writeJson(CURRENT_GPS_KEY, saved);
  saveRecentLocation(saved);
  cacheAddress(saved);
  return saved;
};

export const clearActiveLocation = () => {
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(CURRENT_GPS_KEY);
  localStorage.removeItem(MANUAL_LOCATION_KEY);
  localStorage.removeItem(LAST_SAVED_KEY);
};

export const getLocationMode = () => localStorage.getItem(MODE_KEY) as 'gps' | 'manual' | null;

const initialSnapshot = (): LiveLocationSnapshot => ({
  location: getActiveLocation(),
  status: navigator.onLine ? 'idle' : 'offline',
  permission: 'unknown',
  error: '',
  notice: '',
  online: navigator.onLine,
  lastGpsAt: '',
});

class ZeroMartLocationService {
  private snapshot: LiveLocationSnapshot = initialSnapshot();
  private listeners = new Set<() => void>();
  private watchId: number | null = null;
  private lastAcceptedCoordinates: Coordinates | null = this.snapshot.location;
  private lastReverseGeocodeAt = 0;
  private manualOverride = getLocationMode() === 'manual';
  private lifecycleStarted = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private publish = (patch: Partial<LiveLocationSnapshot>) => {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  };

  private publishLocation = (input: StructuredLocation) => {
    let location;
    try {
      location = saveActiveLocation(input);
    } catch (error: any) {
      this.publish({ status: 'error', error: error?.message || INDIA_ONLY_ERROR });
      return null;
    }
    if (!location) return null;
    this.publish({ location, status: navigator.onLine ? 'watching' : 'offline', error: '', notice: '' });
    window.dispatchEvent(new CustomEvent('zeromart-location-change', { detail: location }));
    return location;
  };

  initialize = async () => {
    if (!this.lifecycleStarted) {
      this.lifecycleStarted = true;
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
    const permission = await getLocationPermission();
    this.publish({ permission });
    return this.snapshot;
  };

  private handleOnline = () => {
    this.publish({ online: true, status: this.watchId === null ? 'idle' : 'watching', error: '', notice: '' });
    if (this.snapshot.location && !this.manualOverride) {
      this.enrichCoordinates(this.snapshot.location, 'live-gps').catch(() => {});
    }
  };

  private handleOffline = () => {
    this.publish({ online: false, status: 'offline', error: 'You are offline. Showing the last saved location.' });
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible' && this.snapshot.permission === 'granted' && !this.manualOverride) {
      this.startLiveTracking(false).catch(() => {});
    }
  };

  private onPosition = (position: GeolocationPosition) => {
    const coordinates: Coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    const movedKm = haversineKm(this.lastAcceptedCoordinates, coordinates);
    const elapsed = Date.now() - new Date(this.snapshot.lastGpsAt || 0).getTime();
    if (this.lastAcceptedCoordinates && (movedKm ?? 0) < MOVEMENT_THRESHOLD_KM && elapsed < MAX_UPDATE_INTERVAL_MS) return;

    this.lastAcceptedCoordinates = coordinates;
    const lastGpsAt = new Date().toISOString();
    const previous = this.snapshot.location;
    const coordinateLocation = normalizeLocation({
      ...previous,
      ...coordinates,
      source: 'live-gps',
      updatedAt: lastGpsAt,
      formattedAddress: previous?.formattedAddress || '',
      displayAddress: previous?.displayAddress || 'Current GPS location',
      shortName: previous?.shortName || 'Current GPS location',
    })!;
    this.publish({ location: coordinateLocation, status: navigator.onLine ? 'watching' : 'offline', lastGpsAt, error: '', notice: '' });

    const addressAge = Date.now() - this.lastReverseGeocodeAt;
    if (navigator.onLine && (!previous?.formattedAddress || (movedKm ?? Infinity) >= MOVEMENT_THRESHOLD_KM || addressAge >= ADDRESS_REFRESH_INTERVAL_MS)) {
      this.enrichCoordinates(coordinates, 'live-gps').catch(() => {});
    } else if (hasUsableAddress(coordinateLocation) && isIndiaLocation(coordinateLocation)) {
      this.publishLocation(coordinateLocation);
    }
  };

  private onPositionError = (error: GeolocationPositionError) => {
    const permission: LocationPermissionState = error.code === 1 ? 'denied' : this.snapshot.permission;
    if (error.code !== 1 && this.snapshot.location) {
      stopWatchingPosition(this.watchId);
      this.watchId = null;
      this.publish({
        status: navigator.onLine ? 'idle' : 'offline',
        permission,
        error: '',
        notice: 'Live GPS paused. Using your last saved location.',
      });
      return;
    }
    this.publish({ status: navigator.onLine ? 'error' : 'offline', permission, error: locationErrorMessage(error) });
  };

  startLiveTracking = async (requestPermission = true) => {
    if (this.watchId !== null) return this.snapshot.location;
    const permission = await getLocationPermission();
    this.publish({ permission, status: this.snapshot.location ? 'watching' : 'starting', error: '', notice: '' });
    if (permission === 'denied') {
      const error = new Error('Location access is blocked. Enable it in browser settings or search manually.');
      (error as any).code = 1;
      this.publish({ status: 'error', error: error.message });
      throw error;
    }
    if (permission === 'prompt' && !requestPermission) {
      this.publish({ status: 'idle' });
      return this.snapshot.location;
    }
    this.manualOverride = false;
    localStorage.setItem(MODE_KEY, 'gps');
    this.watchId = watchDevicePosition(this.onPosition, this.onPositionError);
    return new Promise<StructuredLocation | null>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        if (this.snapshot.location) resolve(this.snapshot.location);
        else reject(new Error(this.snapshot.error || 'Live GPS did not return a location.'));
      }, 20000);
      const unsubscribe = this.subscribe(() => {
        if (!this.snapshot.location || !this.snapshot.lastGpsAt
          || !hasUsableAddress(this.snapshot.location) || !isIndiaLocation(this.snapshot.location)) return;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(this.snapshot.location);
      });
    });
  };

  detectCurrentPosition = async () => {
    const permission = await getLocationPermission();
    const previousMode = getLocationMode();
    const fallback = getActiveLocation()
      || normalizeLocation(readJson(LAST_SAVED_KEY, null))
      || getRecentLocations()[0]
      || null;
    this.publish({ permission, status: 'starting', error: '', notice: '' });
    if (permission === 'denied') {
      const error = new Error('Location access is blocked. Enable it in browser settings or choose an address manually.');
      (error as any).code = 1;
      this.publish({ status: 'error', error: error.message });
      throw error;
    }
    try {
      const position = await getDevicePosition();
      const coordinates: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      const lastGpsAt = new Date().toISOString();
      this.manualOverride = false;
      this.lastAcceptedCoordinates = coordinates;
      this.publish({
        location: normalizeLocation({
          ...coordinates,
          country: 'India',
          countryCode: 'in',
          formattedAddress: '',
          displayAddress: 'Current GPS location',
          shortName: 'Current GPS location',
          source: 'gps',
          updatedAt: lastGpsAt,
        }),
        status: 'starting',
        permission: 'granted',
        lastGpsAt,
        error: '',
        notice: '',
      });
      const location = await this.enrichCoordinates(coordinates, 'gps');
      localStorage.setItem(MODE_KEY, 'gps');
      localStorage.removeItem(MANUAL_LOCATION_KEY);
      if (this.watchId === null) this.startLiveTracking(false).catch(() => {});
      return location;
    } catch (error: any) {
      if (Number(error?.code) !== 1 && fallback) {
        this.manualOverride = previousMode === 'manual';
        if (previousMode) localStorage.setItem(MODE_KEY, previousMode);
        const savedFallback = normalizeLocation({
          ...fallback,
          source: 'saved',
        });
        this.publish({
          location: savedFallback,
          status: navigator.onLine ? 'idle' : 'offline',
          error: '',
          notice: 'Using your last saved location. You can update it manually.',
        });
        return savedFallback;
      }
      const message = error?.code
        ? locationErrorMessage(error)
        : error?.message || 'Google Maps failed to load. Please check API key and enabled APIs.';
      const nextPermission: LocationPermissionState = error?.code === 1 ? 'denied' : permission;
      this.publish({
        status: navigator.onLine ? 'error' : 'offline',
        permission: nextPermission,
        error: message,
        notice: '',
      });
      throw error;
    }
  };

  stopLiveTracking = () => {
    stopWatchingPosition(this.watchId);
    this.watchId = null;
    this.publish({ status: this.snapshot.online ? 'idle' : 'offline' });
  };

  setManualLocation = (input: StructuredLocation) => {
    const location = normalizeLocation({ ...input, source: input.source || 'search', updatedAt: new Date().toISOString() });
    if (!location) return null;
    assertIndiaLocation(location);
    const usesLiveGps = location.source === 'gps' || location.source === 'live-gps';
    this.manualOverride = !usesLiveGps;
    localStorage.setItem(MODE_KEY, usesLiveGps ? 'gps' : 'manual');
    if (usesLiveGps) {
      localStorage.removeItem(MANUAL_LOCATION_KEY);
    } else {
      writeJson(MANUAL_LOCATION_KEY, location);
    }
    if (!usesLiveGps) this.stopLiveTracking();
    const published = this.publishLocation(location);
    if (usesLiveGps && this.watchId === null) this.startLiveTracking(false).catch(() => {});
    return published;
  };

  reverseGeocode = async (latitude: number, longitude: number, source: any = 'map-pin', accuracy: number | null = null) => {
    const coordinates = { latitude, longitude, accuracy };
    const cached = getCachedAddress(coordinates);
    if (hasUsableAddress(cached)) return normalizeLocation({ ...cached, ...coordinates, source, updatedAt: new Date().toISOString() })!;
    try {
      const location = await lookupAddress(latitude, longitude, source, accuracy);
      assertIndiaLocation(location);
      cacheAddress(location);
      return location;
    } catch (error) {
      throw error;
    }
  };

  private enrichCoordinates = async (coordinates: Coordinates, source: any) => {
    const cached = getCachedAddress(coordinates);
    if (hasUsableAddress(cached) && Date.now() - new Date(cached!.updatedAt).getTime() < ADDRESS_REFRESH_INTERVAL_MS) {
      return this.publishLocation(normalizeLocation({
        ...cached,
        ...coordinates,
        source,
        updatedAt: new Date().toISOString(),
      })!);
    }
    try {
      const location = await lookupAddress(
        coordinates.latitude,
        coordinates.longitude,
        source,
        Number(coordinates.accuracy ?? null)
      );
      assertIndiaLocation(location);
      this.lastReverseGeocodeAt = Date.now();
      cacheAddress(location);
      return this.publishLocation(location);
    } catch (error) {
      this.publish({ status: 'error', error: error instanceof Error ? error.message : 'The GPS address could not be verified.' });
      throw error;
    }
  };

  search = async (query: string, bias = this.snapshot.location) => {
    return getAutocompleteSuggestions(query, bias);
  };
  resolveSuggestion = (suggestion: PlaceSuggestion) => (
    suggestion.location
      ? Promise.resolve(assertIndiaLocation(suggestion.location))
      : getPlaceDetails(suggestion.placeId).then(assertIndiaLocation)
  );
}

export const locationService = new ZeroMartLocationService();

export const reverseGeocode = (latitude: number, longitude: number) => locationService.reverseGeocode(latitude, longitude, 'gps');
export const getCurrentStructuredLocation = () => locationService.startLiveTracking(true);
export const requestDeviceCoordinates = async () => {
  const location = await locationService.detectCurrentPosition();
  if (!location) throw new Error('Live GPS did not return coordinates.');
  return { latitude: location.latitude, longitude: location.longitude, lat: location.latitude, lng: location.longitude, accuracy: location.accuracy };
};
export const searchLocations = async (query: string) => {
  const suggestions = await locationService.search(query);
  return Promise.all(suggestions.slice(0, 8).map((suggestion) => locationService.resolveSuggestion(suggestion)));
};

export const getKnownLocationSuggestions = () => {
  const candidates = [getActiveLocation(), ...getRecentLocations(), ...getSavedLocations()];
  const user = readJson<any>('zeromart-user', null);
  if (user?.location) candidates.push(user.location);
  readJson<any[]>('zeromart-business-accounts', []).forEach((account) => account.locationData && candidates.push(account.locationData));
  const unique = new Map<string, StructuredLocation>();
  candidates.map(normalizeLocation).filter(Boolean).forEach((location) => unique.set(coordinateKey(location as StructuredLocation, 5), location as StructuredLocation));
  return [...unique.values()].slice(0, 8);
};

export const formatShortAddress = (input: any) => {
  const location = normalizeLocation(input);
  return location?.shortName || uniqueParts([location?.street, location?.area, location?.city]).join(', ') || 'Choose location';
};

export const formatFullAddress = (input: any) => {
  const location = normalizeLocation(input);
  return location?.formattedAddress || '';
};

export const locationLabel = (input: any) => formatShortAddress(input);

export const getLocationScopeValue = (location: any, scope: string) => {
  if (!location) return '';
  const values: Record<string, string> = {
    street: location.street,
    area: location.area || location.subLocality || location.locality,
    locality: location.locality,
    district: location.district,
    city: location.city,
    state: location.state,
    country: location.country,
  };
  return values[scope] || '';
};

export const getLocationScopes = (location: any) => (
  ['street', 'area', 'district', 'city', 'state', 'country']
    .map((scope) => ({ scope, label: getLocationScopeValue(location, scope) }))
    .filter((entry) => entry.label)
);

export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const distance = haversineKm({ latitude: lat1, longitude: lng1 }, { latitude: lat2, longitude: lng2 });
  return distance === null ? null : Math.round(distance * 10) / 10;
};

export const isWithinRange = (lat1: number, lng1: number, lat2: number, lng2: number, thresholdKm = 1) => {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return distance !== null && distance <= thresholdKm;
};

export { formatDistance, haversineKm, sortByNearest };
export const loadStoredLocation = getActiveLocation;
export const saveStoredLocation = saveActiveLocation;
