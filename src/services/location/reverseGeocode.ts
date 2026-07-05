import { runGoogleGeocode } from './googleMaps';
import { normalizeGoogleGeocoderResult } from './geocode';
import type { LocationSource, StructuredLocation } from './types';

export const reverseGeocodeCoordinates = async (
  latitude: number,
  longitude: number,
  source: LocationSource = 'gps',
  accuracy: number | null = null
): Promise<StructuredLocation> => {
  const results = await runGoogleGeocode({ location: { lat: latitude, lng: longitude } });
  const result = results[0];
  if (!result) throw new Error('No street address was found for these coordinates.');
  return normalizeGoogleGeocoderResult(result, source, accuracy);
};
