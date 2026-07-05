import { useMemo } from 'react';
import { formatDistance, haversineKm } from '../services/location/distance';
import { useLiveLocation } from './useLiveLocation';

export const useNearbyProducts = <T extends Record<string, any>>(
  products: T[],
  getCoordinates: (product: T) => any = (product: T) => product.coordinates || product.locationData
) => {
  const { location } = useLiveLocation();
  return useMemo(() => products.map((product) => {
    const distanceKm = haversineKm(location, getCoordinates(product));
    return { ...product, distanceKm, distance: formatDistance(distanceKm) };
  }).sort((first, second) => (
    (first.distanceKm ?? Number.POSITIVE_INFINITY) - (second.distanceKm ?? Number.POSITIVE_INFINITY)
  )), [getCoordinates, location?.latitude, location?.longitude, products]);
};

export default useNearbyProducts;
