import { importGoogleLibrary, runGoogleGeocode } from './googleMaps';
import type { LocationSource, PlaceSuggestion, StructuredLocation } from './types';

const componentValue = (components: any[], type: string, short = false) => {
  const component = components?.find((entry) => entry.types?.includes(type));
  const value = component
    ? (short ? (component.short_name ?? component.shortText) : (component.long_name ?? component.longText))
    : '';
  return value == null || ['undefined', 'null'].includes(String(value).trim().toLowerCase())
    ? ''
    : String(value).trim();
};

const unique = (parts: unknown[]) => [...new Set(parts.map(String).map((part) => part.trim()).filter(Boolean))];
const safeText = (value: unknown, fallback = '') => (
  value == null || ['undefined', 'null'].includes(String(value).trim().toLowerCase())
    ? fallback
    : String(value).trim()
);

export const normalizeGoogleGeocoderResult = (
  result: any,
  source: LocationSource = 'search',
  accuracy: number | null = null
): StructuredLocation => {
  const components = result?.address_components || result?.addressComponents || [];
  const location = result?.geometry?.location || result?.location;
  const latitude = Number(location?.lat?.() ?? location?.lat);
  const longitude = Number(location?.lng?.() ?? location?.lng);
  const locality = componentValue(components, 'locality')
    || componentValue(components, 'postal_town')
    || componentValue(components, 'administrative_area_level_3');
  const subLocality = componentValue(components, 'sublocality_level_1')
    || componentValue(components, 'sublocality')
    || componentValue(components, 'neighborhood');
  const street = componentValue(components, 'route');
  const houseNumber = componentValue(components, 'street_number');
  const city = locality || componentValue(components, 'administrative_area_level_2');
  const district = componentValue(components, 'administrative_area_level_2');
  const area = subLocality || componentValue(components, 'neighborhood') || locality;
  const postalCode = componentValue(components, 'postal_code');
  const formattedAddress = safeText(result?.formatted_address || result?.formattedAddress) || unique([
    unique([houseNumber, street]).join(' '), area, city, district,
    componentValue(components, 'administrative_area_level_1'), postalCode,
    componentValue(components, 'country'),
  ]).join(', ');
  const plusCode = result?.plus_code?.global_code || result?.plus_code?.compound_code
    || result?.plusCode?.globalCode || result?.plusCode?.compoundCode || '';
  const placeName = safeText(result?.name || result?.displayName);
  const shortName = unique([street || area || locality || city, area && area !== street ? area : '', city && city !== area ? city : '']).slice(0, 3).join(', ');

  return {
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    accuracy,
    country: componentValue(components, 'country') || 'India',
    countryCode: componentValue(components, 'country', true).toLowerCase() || 'in',
    state: componentValue(components, 'administrative_area_level_1'),
    district,
    city,
    locality,
    subLocality,
    area,
    street,
    streetNumber: houseNumber,
    houseNumber,
    doorNo: houseNumber,
    buildingName: '',
    floor: '',
    landmark: '',
    addressType: '',
    postalCode,
    postcode: postalCode,
    pincode: postalCode,
    formattedAddress,
    fullAddress: formattedAddress,
    displayAddress: shortName || formattedAddress,
    displayName: formattedAddress,
    name: placeName,
    shortName: shortName || formattedAddress,
    plusCode,
    placeId: result?.place_id || result?.id || '',
    source,
    updatedAt: new Date().toISOString(),
  };
};

const geocodeRequest = async (request: Record<string, unknown>, source: LocationSource) => {
  const results = await runGoogleGeocode(request);
  const result = results[0];
  if (!result) throw new Error('No matching address was found.');
  return normalizeGoogleGeocoderResult(result, source);
};

export const geocodeAddress = (address: string) => geocodeRequest({ address, componentRestrictions: { country: 'IN' } }, 'search');
export const geocodePlaceId = (placeId: string) => geocodeRequest({ placeId }, 'search');

export const getPlaceDetails = async (placeId: string) => {
  const maps = await importGoogleLibrary('places');
  if (maps.places?.Place) {
    const place = new maps.places.Place({ id: placeId });
    await place.fetchFields({
      fields: [
        'id', 'displayName', 'formattedAddress', 'location',
        'addressComponents', 'plusCode',
      ],
    });
    return normalizeGoogleGeocoderResult(place, 'search');
  }
  return geocodePlaceId(placeId);
};

export const getAutocompleteSuggestions = async (
  query: string,
  bias?: { latitude: number; longitude: number } | null
): Promise<PlaceSuggestion[]> => {
  const value = query.trim();
  if (value.length < 2) return [];
  const maps = await importGoogleLibrary('places');

  if (maps.places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    const request: any = { input: value, language: 'en', includedRegionCodes: ['in'], region: 'in' };
    if (bias) request.locationBias = { center: { lat: bias.latitude, lng: bias.longitude }, radius: 50000 };
    const response = await maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    return (response?.suggestions || []).map((entry: any) => {
      const prediction = entry.placePrediction;
      return {
        id: prediction.placeId,
        placeId: prediction.placeId,
        primaryText: prediction.mainText?.text || prediction.text?.text || value,
        secondaryText: prediction.secondaryText?.text || '',
        description: prediction.text?.text || value,
      };
    });
  }

  const service = new maps.places.AutocompleteService();
  const request: any = { input: value, componentRestrictions: { country: 'in' }, region: 'in' };
  if (bias) request.locationBias = { radius: 50000, center: { lat: bias.latitude, lng: bias.longitude } };
  const predictions: any[] = await new Promise((resolve, reject) => {
    service.getPlacePredictions(request, (results: any[], status: string) => {
      if (status === maps.places.PlacesServiceStatus.ZERO_RESULTS) resolve([]);
      else if (status === maps.places.PlacesServiceStatus.OK) resolve(results || []);
      else reject(new Error(`Address search is unavailable (${status}).`));
    });
  });
  return predictions.map((prediction) => ({
    id: prediction.place_id,
    placeId: prediction.place_id,
    primaryText: prediction.structured_formatting?.main_text || prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text || '',
    description: prediction.description,
  }));
};
