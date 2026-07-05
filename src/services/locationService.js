// Compatibility entry point. All location behavior lives in the centralized
// TypeScript service under services/location.
export * from './location/locationService';
export {
  directionsUrl,
} from './location/distance';
export {
  getGoogleMapsApiKey,
  isGoogleMapsConfigured,
  loadGoogleMaps,
} from './location/googleMaps';
