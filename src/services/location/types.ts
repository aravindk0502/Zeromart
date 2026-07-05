export type LocationSource = 'gps' | 'live-gps' | 'search' | 'map-pin' | 'saved' | 'cache' | 'coordinates';

export interface Coordinates {
  latitude: number;
  longitude: number;
  lat?: number;
  lng?: number;
  accuracy?: number | null;
}

export interface StructuredLocation extends Coordinates {
  country: string;
  countryCode: string;
  state: string;
  district: string;
  city: string;
  locality: string;
  subLocality: string;
  area: string;
  street: string;
  streetNumber: string;
  houseNumber: string;
  doorNo: string;
  buildingName: string;
  floor: string;
  landmark: string;
  addressType: 'Home' | 'Office' | 'Store' | 'Other' | '';
  postalCode: string;
  postcode: string;
  pincode: string;
  formattedAddress: string;
  fullAddress: string;
  displayAddress: string;
  displayName: string;
  name: string;
  shortName: string;
  plusCode: string;
  placeId: string;
  source: LocationSource;
  updatedAt: string;
}

export interface PlaceSuggestion {
  id: string;
  placeId: string;
  primaryText: string;
  secondaryText: string;
  description: string;
  location?: StructuredLocation;
}

export type LocationPermissionState = PermissionState | 'unsupported' | 'unknown';

export interface LiveLocationSnapshot {
  location: StructuredLocation | null;
  status: 'idle' | 'starting' | 'watching' | 'offline' | 'error';
  permission: LocationPermissionState;
  error: string;
  notice: string;
  online: boolean;
  lastGpsAt: string;
}
