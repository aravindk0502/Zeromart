import {
  deleteListing as deleteListingApi,
  fetchListings,
  insertListing,
  updateListing as updateListingApi,
} from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  getLiveListings,
  normalizeLiveListing,
  removeLiveListing,
  saveLiveListings,
  upsertLiveListing,
} from './transactionService';

const isProductionRuntime = import.meta.env.PROD;
const LISTING_CACHE_TTL_MS = isProductionRuntime ? 0 : 12_000;

let cachedListings = null;
let cachedAtMs = 0;
let inflightSyncPromise = null;

const resetListingCache = () => {
  cachedListings = null;
  cachedAtMs = 0;
};

const getCoordinates = (listing = {}) => {
  const coordinates = listing.coordinates || {};
  const locationData = listing.locationData || {};
  const latitude = Number(listing.latitude ?? coordinates.latitude ?? coordinates.lat ?? locationData.latitude ?? locationData.lat);
  const longitude = Number(listing.longitude ?? coordinates.longitude ?? coordinates.lng ?? locationData.longitude ?? locationData.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return {};
  return { latitude, longitude, coordinates: { latitude, longitude, lat: latitude, lng: longitude } };
};

export const toListingPayload = (listing = {}) => {
  const normalized = normalizeLiveListing(listing);
  const coordinateData = getCoordinates(normalized);
  const isBusiness = normalized.listingType === 'business' || normalized.sellerType === 'business' || normalized.isBusinessProduct;
  const sellerAvatar = normalized.sellerAvatar || normalized.sellerProfileImage || normalized.avatarUrl || '';
  return {
    id: normalized.serverId || normalized.id,
    serverId: normalized.serverId || normalized.id,
    title: normalized.title,
    name: normalized.name || normalized.title,
    category: normalized.category || 'Other',
    condition: normalized.condition || 'Good',
    description: normalized.description || '',
    image: normalized.image || normalized.imageUrl || normalized.photo_url || '',
    imageUrl: normalized.imageUrl || normalized.image || normalized.photo_url || '',
    photo_url: normalized.photo_url || normalized.image || normalized.imageUrl || '',
    sellerId: normalized.sellerId || normalized.ownerMobile || normalized.businessId || '',
    sellerName: normalized.sellerName || normalized.storeName || 'Drizn User',
    sellerAvatar,
    avatarUrl: sellerAvatar,
    profileImage: sellerAvatar,
    sellerType: isBusiness ? 'business' : 'community',
    listingType: isBusiness ? 'business' : 'community',
    isBusinessProduct: isBusiness,
    businessId: normalized.businessId || '',
    storeName: normalized.storeName || normalized.businessName || '',
    sellerKarma: Number(normalized.sellerKarma ?? normalized.karma ?? 0) || 0,
    totalQuantity: Number(normalized.totalQuantity ?? normalized.quantity ?? 1) || 1,
    quantity: Number(normalized.quantity ?? normalized.totalQuantity ?? 1) || 1,
    availableQuantity: Number(normalized.availableQuantity ?? normalized.quantity ?? 1) || 0,
    reservedQuantity: Number(normalized.reservedQuantity ?? 0) || 0,
    soldQuantity: Number(normalized.soldQuantity ?? 0) || 0,
    price: Number(normalized.price ?? normalized.sellingPrice ?? 0) || 0,
    expiryDate: normalized.expiryDate || normalized.validTill || '',
    expiryTime: normalized.expiryTime || null,
    validTill: normalized.validTill || normalized.expiryDate || '',
    status: normalized.status === 'sold-out' ? 'sold' : normalized.status || 'active',
    location: normalized.location || normalized.pickupArea || '',
    area: normalized.area || normalized.locationData?.area || normalized.locationData?.locality || '',
    city: normalized.city || normalized.locationData?.city || '',
    state: normalized.state || normalized.locationData?.state || '',
    country: normalized.country || normalized.locationData?.country || 'India',
    locationData: normalized.locationData || {},
    ...coordinateData,
    metadata: {
      source: 'zeromart-web',
      ownerMobile: normalized.ownerMobile || '',
      sellerInitials: normalized.sellerInitials || normalized.initials || '',
      sellerAvatar,
      avatarUrl: sellerAvatar,
      profileImage: sellerAvatar,
    },
  };
};

export const fromServerListing = (listing = {}) => normalizeLiveListing({
  ...listing,
  id: listing.id || listing.serverId,
  serverId: listing.serverId || listing.id,
  serverPersisted: true,
  image: listing.image || listing.imageUrl || listing.photo_url || '',
  sellerType: listing.sellerType || listing.seller_type || listing.listingType,
});

const mergeRemoteWithLocalDrafts = (remoteListings) => {
  if (isProductionRuntime) {
    saveLiveListings(remoteListings);
    return remoteListings;
  }
  const remoteIds = new Set(remoteListings.map((listing) => String(listing.id)));
  const drafts = getLiveListings().filter((listing) => !listing.serverPersisted && !remoteIds.has(String(listing.id)));
  const nextListings = [...remoteListings, ...drafts];
  saveLiveListings(nextListings);
  return nextListings;
};

const getSyncFallbackListings = () => {
  if (Array.isArray(cachedListings) && cachedListings.length) return cachedListings;
  const localListings = getLiveListings();
  if (!isProductionRuntime) return localListings;
  return localListings.filter((listing) => listing.serverPersisted);
};

export const syncListingsFromBackend = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cachedListings && now - cachedAtMs < LISTING_CACHE_TTL_MS) return cachedListings;
  if (inflightSyncPromise) return inflightSyncPromise;

  inflightSyncPromise = fetchListings()
    .then((rows) => {
      if (!Array.isArray(rows)) {
        const fallback = getSyncFallbackListings();
        cachedListings = fallback;
        cachedAtMs = Date.now();
        return fallback;
      }
      const remoteListings = rows.map(fromServerListing);
      const merged = mergeRemoteWithLocalDrafts(remoteListings);
      cachedListings = merged;
      cachedAtMs = Date.now();
      return merged;
    })
    .catch((error) => {
      console.error('[liveListingService] sync failed', error);
      const fallback = getSyncFallbackListings();
      cachedListings = fallback;
      cachedAtMs = Date.now();
      return fallback;
    })
    .finally(() => {
      inflightSyncPromise = null;
    });

  return inflightSyncPromise;
};

export const saveListingToBackend = async (listing) => {
  const saved = await insertListing(toListingPayload(listing));
  const normalized = fromServerListing(saved);
  resetListingCache();
  upsertLiveListing(normalized);
  return normalized;
};

export const updateListingInBackend = async (id, listing) => {
  const saved = await updateListingApi(id, toListingPayload({ ...listing, id }));
  const normalized = fromServerListing(saved);
  resetListingCache();
  upsertLiveListing(normalized);
  return normalized;
};

export const deleteListingFromBackend = async (id) => {
  if (!id) return null;
  const result = await deleteListingApi(id);
  resetListingCache();
  removeLiveListing(id);
  return result;
};

export const invalidateListingCache = () => {
  resetListingCache();
};

export const subscribeToListingChanges = (onChange) => {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel('drizn-live-listings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
      resetListingCache();
      onChange?.();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
