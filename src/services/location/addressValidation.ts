import type { StructuredLocation } from './types';

const validationEndpoint = () => String(import.meta.env.VITE_GOOGLE_ADDRESS_VALIDATION_ENDPOINT || '').trim();

export const validateCompletedAddress = async (
  location: StructuredLocation
): Promise<StructuredLocation> => {
  const endpoint = validationEndpoint();
  if (!endpoint) return location;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: {
          regionCode: 'IN',
          postalCode: location.postalCode,
          administrativeArea: location.state,
          locality: location.city,
          addressLines: [
            [location.doorNo, location.buildingName, location.floor].filter(Boolean).join(', '),
            [location.street, location.subLocality || location.area, location.landmark].filter(Boolean).join(', '),
          ].filter(Boolean),
        },
        coordinates: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
      }),
    });
    if (!response.ok) return location;
    await response.json();
    return location;
  } catch (error) {
    return location;
  }
};
