import type { Coordinates } from './types';
import { importGoogleLibrary } from './googleMaps';

const numberCoordinate = (location: any, primary: string, alias: string) => Number(location?.[primary] ?? location?.[alias]);

export const haversineKm = (from: Coordinates | null, to: Coordinates | null) => {
  const fromLatitude = numberCoordinate(from, 'latitude', 'lat');
  const fromLongitude = numberCoordinate(from, 'longitude', 'lng');
  const toLatitude = numberCoordinate(to, 'latitude', 'lat');
  const toLongitude = numberCoordinate(to, 'longitude', 'lng');
  if (![fromLatitude, fromLongitude, toLatitude, toLongitude].every(Number.isFinite)) return null;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const firstLatitude = radians(fromLatitude);
  const secondLatitude = radians(toLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const formatDistance = (kilometres: number | null) => {
  if (!Number.isFinite(kilometres)) return 'Distance unavailable';
  if ((kilometres as number) < 1) return `${Math.max(1, Math.round((kilometres as number) * 1000))} m away`;
  if ((kilometres as number) < 10) return `${(kilometres as number).toFixed(1)} km away`;
  return `${Math.round(kilometres as number)} km away`;
};

export const sortByNearest = <T>(
  items: T[],
  activeLocation: Coordinates | null,
  getCoordinates: (item: T) => Coordinates | null = (item: any) => item.coordinates || item.locationData
) => [...items].sort((first, second) => (
  (haversineKm(activeLocation, getCoordinates(first)) ?? Number.POSITIVE_INFINITY)
  - (haversineKm(activeLocation, getCoordinates(second)) ?? Number.POSITIVE_INFINITY)
));

export const directionsUrl = (destination: Coordinates | string, origin?: Coordinates | null) => {
  const destinationValue = typeof destination === 'string'
    ? destination
    : `${destination.latitude},${destination.longitude}`;
  const originValue = origin ? `&origin=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationValue)}${originValue}`;
};

export const getRouteDistance = async (origin: Coordinates, destination: Coordinates) => {
  const maps = await importGoogleLibrary('routes');
  const service = new maps.DistanceMatrixService();
  const response = await service.getDistanceMatrix({
    origins: [{ lat: origin.latitude, lng: origin.longitude }],
    destinations: [{ lat: destination.latitude, lng: destination.longitude }],
    travelMode: maps.TravelMode.DRIVING,
    unitSystem: maps.UnitSystem.METRIC,
  });
  const element = response?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    const fallbackKm = haversineKm(origin, destination);
    return { distanceKm: fallbackKm, distanceText: formatDistance(fallbackKm), durationText: '', source: 'haversine' };
  }
  return {
    distanceKm: Number(element.distance?.value || 0) / 1000,
    distanceText: element.distance?.text || '',
    durationText: element.duration?.text || '',
    source: 'google-routes',
  };
};
