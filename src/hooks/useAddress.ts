import { useMemo } from 'react';
import { formatFullAddress, formatShortAddress } from '../services/location/locationService';
import type { StructuredLocation } from '../services/location/types';

export const useAddress = (location: StructuredLocation | null) => useMemo(() => ({
  shortAddress: formatShortAddress(location),
  formattedAddress: formatFullAddress(location),
  street: location?.street || '',
  locality: location?.locality || location?.subLocality || '',
  district: location?.district || '',
  city: location?.city || '',
  state: location?.state || '',
  country: location?.country || '',
  postalCode: location?.postalCode || '',
  plusCode: location?.plusCode || '',
}), [location]);

export default useAddress;
