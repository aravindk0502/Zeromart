const STORAGE_KEYS = {
  liveListings: 'drizn_live_listings',
  products: 'zeromart-transaction-products',
  requests: 'zeromart-requests',
  orders: 'zeromart-reservations',
  notifications: 'zeromart-notifications',
  purchaseHistory: 'zeromart-purchase-history',
  collectionSettings: 'zeromart-business-collection-settings',
  pendingKarmaActions: 'pendingKarmaActions',
};

let liveListingsMemory = [];

export const PURCHASE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const read = (key, fallback = []) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('zeromart-transactions-change', { detail: { key, value } }));
  return value;
};

export const getExpiryTimestamp = (product) => {
  const date = product?.expiryDate || product?.validTill;
  if (!date) return null;
  const time = product?.expiryTime || '23:59';
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isProductExpired = (product, now = Date.now()) => {
  const expiry = getExpiryTimestamp(product);
  return expiry !== null && now > expiry;
};

export const normalizeProductStock = (product) => {
  const totalQuantity = Math.max(0, Number(product.totalQuantity ?? product.quantity ?? 1) || 0);
  const soldQuantity = Math.max(0, Number(product.soldQuantity ?? 0) || 0);
  const reservedQuantity = Math.max(0, Number(product.reservedQuantity ?? 0) || 0);
  const availableQuantity = Math.max(
    0,
    Number(product.availableQuantity ?? Math.max(0, totalQuantity - soldQuantity)) || 0
  );
  const expired = isProductExpired(product);
  const listingType = product.listingType || (product.isBusinessProduct ? 'business' : 'community');
  const requestableQuantity = listingType === 'community'
    ? Math.max(0, availableQuantity - reservedQuantity)
    : availableQuantity;
  const outOfStock = requestableQuantity <= 0;
  return {
    ...product,
    totalQuantity,
    availableQuantity,
    reservedQuantity,
    soldQuantity,
    expiryDate: product.expiryDate || product.validTill || '',
    expiryTime: product.expiryTime || '',
    listingType,
    maxQuantityPerUserPer24h: Number(product.maxQuantityPerUserPer24h || 2),
    status: expired ? 'expired' : outOfStock ? 'sold-out' : String(product.status || 'active').toLowerCase(),
  };
};

const getLiveCoordinates = (listing) => {
  const direct = listing?.coordinates;
  if (direct && Number.isFinite(Number(direct.latitude)) && Number.isFinite(Number(direct.longitude))) {
    return { latitude: Number(direct.latitude), longitude: Number(direct.longitude) };
  }
  const locationData = listing?.locationData;
  if (locationData && Number.isFinite(Number(locationData.latitude)) && Number.isFinite(Number(locationData.longitude))) {
    return { latitude: Number(locationData.latitude), longitude: Number(locationData.longitude) };
  }
  if (Number.isFinite(Number(listing?.latitude)) && Number.isFinite(Number(listing?.longitude))) {
    return { latitude: Number(listing.latitude), longitude: Number(listing.longitude) };
  }
  return null;
};

export const normalizeLiveListing = (listing = {}) => {
  const isBusiness = listing.isBusinessProduct || listing.listingType === 'business' || listing.sellerType === 'business';
  const title = listing.title || listing.name || listing.productName || 'Untitled item';
  const locationData = listing.locationData || null;
  const coordinates = getLiveCoordinates({ ...listing, locationData });
  const quantity = Math.max(0, Number(listing.totalQuantity ?? listing.quantity ?? listing.availableQuantity ?? 1) || 0);
  const availableQuantity = Math.max(0, Number(listing.availableQuantity ?? listing.quantity ?? quantity) || 0);
  const sellerName = listing.sellerName || listing.storeName || listing.businessName || (isBusiness ? 'Business Store' : 'Drizn User');
  const expiryDate = listing.expiryDate || listing.validTill || '';
  const id = listing.id || `${isBusiness ? 'business' : 'community'}-${Date.now()}`;
  const serverPersisted = Boolean(listing.serverPersisted || listing.serverId || listing._server === true);
  const serverId = listing.serverId || null;

  return normalizeProductStock({
    ...listing,
    serverPersisted,
    serverId,
    id,
    title,
    name: listing.name || title,
    sellerName,
    sellerType: isBusiness ? 'business' : (listing.sellerType || 'community'),
    listingType: isBusiness ? 'business' : (listing.listingType || 'community'),
    isBusinessProduct: Boolean(isBusiness || listing.isBusinessProduct),
    sellerId: listing.sellerId || listing.ownerMobile || listing.businessId || '',
    ownerMobile: listing.ownerMobile || listing.sellerId || listing.businessId || '',
    location: listing.location || listing.pickupArea || locationData?.displayAddress || locationData?.formattedAddress || 'Location unavailable',
    locationData,
    coordinates,
    latitude: coordinates?.latitude ?? listing.latitude ?? null,
    longitude: coordinates?.longitude ?? listing.longitude ?? null,
    totalQuantity: quantity,
    quantity,
    availableQuantity,
    reservedQuantity: Math.max(0, Number(listing.reservedQuantity ?? 0) || 0),
    soldQuantity: Math.max(0, Number(listing.soldQuantity ?? 0) || 0),
    price: Number(listing.price ?? listing.sellingPrice ?? 0) || 0,
    sellingPrice: Number(listing.sellingPrice ?? listing.price ?? 0) || 0,
    expiryDate,
    validTill: listing.validTill || expiryDate,
    status: listing.status || 'Available',
    createdAt: listing.createdAt || new Date().toISOString(),
    updatedAt: listing.updatedAt || listing.createdAt || new Date().toISOString(),
  });
};

export const getLiveListings = () => {
  return liveListingsMemory.map(normalizeLiveListing);
};

export const saveLiveListings = (listings) => {
  const deduped = new Map();
  listings.filter(Boolean).map(normalizeLiveListing).forEach((listing) => {
    deduped.set(String(listing.id), listing);
  });
  const value = [...deduped.values()];
  liveListingsMemory = value;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zeromart-live-listings-change', { detail: { key: STORAGE_KEYS.liveListings, value } }));
    window.dispatchEvent(new CustomEvent('zeromart-transactions-change', { detail: { key: STORAGE_KEYS.liveListings, value } }));
    // Single public signal that any live-listing write happened (same-tab live refresh).
    window.dispatchEvent(new Event('drizn_listings_updated'));
  }
  return value;
};

export const upsertLiveListing = (listing) => {
  const normalized = normalizeLiveListing(listing);
  return saveLiveListings([
    normalized,
    ...getLiveListings().filter((item) => String(item.id) !== String(normalized.id)),
  ]);
};

export const removeLiveListing = (id) => saveLiveListings(
  getLiveListings().filter((item) => String(item.id) !== String(id))
);

export const applyProductExpiry = (products, now = Date.now()) => (
  products.map((product) => {
    const normalized = normalizeProductStock(product);
    return isProductExpired(normalized, now) ? { ...normalized, status: 'expired' } : normalized;
  })
);

export const isMarketplaceVisible = (product) => {
  const normalized = normalizeProductStock(product);
  return !isProductExpired(normalized)
    && !['expired', 'hidden'].includes(normalized.status);
};

export const formatExpiry = (product, now = new Date()) => {
  const timestamp = getExpiryTimestamp(product);
  if (!timestamp) return '';
  const expiry = new Date(timestamp);
  const today = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString();
  const day = expiry.toDateString() === today ? 'Today' : expiry.toDateString() === tomorrow ? 'Tomorrow' : expiry.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const time = product.expiryTime ? expiry.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return `${day}${time ? ` ${time}` : ''}`;
};

const normalizePurchaseEntry = (entry) => {
  const requestedAt = entry.requestedAt || entry.createdAt || new Date().toISOString();
  const requestedTimestamp = new Date(requestedAt).getTime();
  const expiresAt = entry.expiresAt
    || new Date((Number.isFinite(requestedTimestamp) ? requestedTimestamp : Date.now()) + PURCHASE_LIMIT_WINDOW_MS).toISOString();
  return {
    ...entry,
    userId: entry.userId || entry.buyerId || '',
    buyerId: entry.buyerId || entry.userId || '',
    requestedAt,
    createdAt: entry.createdAt || requestedAt,
    expiresAt,
  };
};

export const getPurchaseHistory = () => read(STORAGE_KEYS.purchaseHistory).map(normalizePurchaseEntry);
export const savePurchaseHistory = (history) => write(STORAGE_KEYS.purchaseHistory, history);
export const getTransactionProducts = () => read(STORAGE_KEYS.products);
export const saveTransactionProducts = (products) => write(STORAGE_KEYS.products, products);
export const getRequests = () => read(STORAGE_KEYS.requests);
export const saveRequests = (requests) => write(STORAGE_KEYS.requests, requests);
export const getReservations = () => read(STORAGE_KEYS.orders);
export const saveReservations = (orders) => write(STORAGE_KEYS.orders, orders);

export const expireReservations = (now = Date.now()) => {
  const expired = [];
  const next = getReservations().map((reservation) => {
    if (reservation.status !== 'reserved' || !reservation.reservationExpiresAt || new Date(reservation.reservationExpiresAt).getTime() > now) return reservation;
    const updated = { ...reservation, status: 'expired' };
    expired.push(updated);
    return updated;
  });
  if (expired.length) saveReservations(next);
  return expired;
};

export const getUserQuantityInLast24Hours = (productId, buyerId, history = getPurchaseHistory(), now = Date.now()) => (
  history.filter((entry) => (
    String(entry.productId) === String(productId)
    && String(entry.userId || entry.buyerId) === String(buyerId)
    && new Date(entry.expiresAt || 0).getTime() > now
    && !['declined', 'cancelled', 'expired', 'no-show'].includes(entry.status)
  )).reduce((total, entry) => total + Number(entry.quantity || 0), 0)
);

export const getQuantityAllowance = (product, buyerId, requestedQuantity = 1, now = Date.now()) => {
  const normalized = normalizeProductStock(product);
  const limit = normalized.maxQuantityPerUserPer24h;
  const history = getPurchaseHistory();
  const used = getUserQuantityInLast24Hours(normalized.id, buyerId, history, now);
  const remainingLimit = Math.max(0, limit - used);
  const requestableStock = normalized.listingType === 'community'
    ? Math.max(0, normalized.availableQuantity - normalized.reservedQuantity)
    : normalized.availableQuantity;
  const allowedQuantity = Math.min(Number(requestedQuantity || 1), remainingLimit, requestableStock);
  const activeEntries = history.filter((entry) => (
    String(entry.productId) === String(normalized.id)
    && String(entry.userId || entry.buyerId) === String(buyerId)
    && new Date(entry.expiresAt || 0).getTime() > now
    && !['declined', 'cancelled', 'expired', 'no-show'].includes(entry.status)
  )).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  const retryAt = activeEntries[0] ? new Date(activeEntries[0].expiresAt) : null;
  return { used, limit, remainingLimit, requestableStock, allowedQuantity, retryAt };
};

export const recordPurchaseAttempt = (entry) => {
  const history = getPurchaseHistory();
  const requestedAt = entry.requestedAt || entry.createdAt || new Date().toISOString();
  savePurchaseHistory([normalizePurchaseEntry({
    ...entry,
    userId: entry.userId || entry.buyerId,
    requestedAt,
    expiresAt: entry.expiresAt || new Date(new Date(requestedAt).getTime() + PURCHASE_LIMIT_WINDOW_MS).toISOString(),
  }), ...history]);
};

export const formatRequestCountdown = (retryAt, now = Date.now()) => {
  if (!retryAt) return '';
  const remainingMs = Math.max(0, new Date(retryAt).getTime() - now);
  if (remainingMs <= 0) return 'now';
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const getProductRequestState = (product, buyerId, now = Date.now()) => {
  const normalized = normalizeProductStock(product);
  const allowance = getQuantityAllowance(normalized, buyerId, 1, now);
  const expired = isProductExpired(normalized, now);
  const soldOut = allowance.requestableStock <= 0;
  const limitReached = Boolean(buyerId) && !expired && !soldOut && allowance.remainingLimit <= 0;
  return {
    ...allowance,
    expired,
    soldOut,
    limitReached,
    canRequest: !expired && !soldOut && !limitReached,
    stockLabel: expired
      ? 'Expired'
      : soldOut
        ? 'SOLD OUT'
        : limitReached
          ? 'Limit reached'
          : `${allowance.requestableStock} left`,
    buttonLabel: soldOut
      ? 'Sold Out'
      : limitReached
        ? `Available again in ${formatRequestCountdown(allowance.retryAt, now)}`
        : normalized.listingType === 'business'
          ? 'Reserve & Collect'
          : 'Request to Collect',
  };
};

export const updatePurchaseHistoryStatus = (requestId, status) => {
  savePurchaseHistory(getPurchaseHistory().map((entry) => (
    entry.requestId === requestId ? { ...entry, status } : entry
  )));
};

export const createWhatsAppLink = (phone, message) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const international = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
};

export const createCollectionCode = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ZM-${day}${month}${year}-${random}`;
};

export const getDefaultCollectionSettings = (businessId = 'default') => ({
  businessId,
  allowAnytime: true,
  maximumOrdersPerSlot: 0,
  windows: [
    { days: 'Monday to Saturday', start: '10:00', end: '13:00' },
    { days: 'Monday to Saturday', start: '16:00', end: '20:00' },
    { days: 'Sunday', closed: true },
  ],
});

export const getCollectionSettings = (businessId) => (
  read(STORAGE_KEYS.collectionSettings, []).find((entry) => entry.businessId === businessId)
  || getDefaultCollectionSettings(businessId)
);

export const saveCollectionSettings = (settings) => {
  const all = read(STORAGE_KEYS.collectionSettings, []);
  write(STORAGE_KEYS.collectionSettings, [
    settings,
    ...all.filter((entry) => entry.businessId !== settings.businessId),
  ]);
  return settings;
};

export const getPendingKarmaActions = () => read(STORAGE_KEYS.pendingKarmaActions, []);

export const savePendingKarmaAction = (action) => {
  if (!action?.id || !action?.buyerId) return getPendingKarmaActions();
  const next = [
    action,
    ...getPendingKarmaActions().filter((entry) => entry.id !== action.id),
  ];
  write(STORAGE_KEYS.pendingKarmaActions, next);
  window.dispatchEvent(new CustomEvent('zeromart-karma-pending', { detail: action }));
  return next;
};

export const completePendingKarmaAction = (id) => {
  const next = getPendingKarmaActions().filter((entry) => entry.id !== id);
  write(STORAGE_KEYS.pendingKarmaActions, next);
  return next;
};

export const confirmHandoff = (requestId, role) => {
  let completed = false;
  let alreadyCompleted = false;
  const next = getRequests().map((request) => {
    if (request.requestId !== requestId) return request;
    if (request.status === 'completed') {
      completed = true;
      alreadyCompleted = true;
      return request;
    }
    const updated = {
      ...request,
      buyerCollected: role === 'buyer' ? true : request.buyerCollected,
      sellerGave: role === 'seller' ? true : request.sellerGave,
    };
    completed = Boolean(updated.buyerCollected && updated.sellerGave);
    return { ...updated, status: completed ? 'completed' : updated.status };
  });
  saveRequests(next);
  if (completed && !alreadyCompleted) updatePurchaseHistoryStatus(requestId, 'completed');
  return { completed, alreadyCompleted, request: next.find((entry) => entry.requestId === requestId) };
};

export const STORAGE = STORAGE_KEYS;
