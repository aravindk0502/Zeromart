import serverless from 'serverless-http';

let appHandler;

function normalizeEnvUrl(value = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/https?:\/\/[^\]\s)]+/i);
  return String(match ? match[0] : raw)
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const SUPABASE_URL = normalizeEnvUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || '').trim();

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Origin',
};

const DEFAULT_SELLER_NAME = 'Drizn User';

function getInitialsFromName(name = '') {
  return String(name || '')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function cleanSellerName(...names) {
  const value = names.find((name) => {
    const trimmed = String(name || '').trim();
    const normalized = trimmed.toLowerCase();
    return trimmed
      && normalized !== 'unknown'
      && normalized !== 'undefined'
      && normalized !== 'null'
      && normalized !== 'guest';
  });
  return String(value || DEFAULT_SELLER_NAME).trim();
}

async function getAppHandler() {
  if (!appHandler) {
    const { app } = await import('../server.js');
    appHandler = serverless(app);
  }

  return appHandler;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  Object.entries(jsonHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function getPathname(req) {
  const rawUrl = req.url || '/';
  try {
    return new URL(rawUrl, 'https://drizn.local').pathname;
  } catch {
    return rawUrl.split('?')[0] || '/';
  }
}

function normalizeSupabaseRestUrl() {
  if (!SUPABASE_URL) return '';
  return `${SUPABASE_URL}/rest/v1`;
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function getSupabaseStorageUrl() {
  return SUPABASE_URL ? `${SUPABASE_URL}/storage/v1` : '';
}

function getSupabaseBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || 'Drizn';
}

async function ensureStorageBucket(bucket) {
  const response = await fetch(`${getSupabaseStorageUrl()}/bucket`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 10485760,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (response.ok || response.status === 409) return true;

  const text = await response.text();
  if (/already exists/i.test(text)) return true;
  return false;
}

function getAuthUserId(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) return 'guest';
  const parts = token.split('.');
  if (parts.length < 2) return 'guest';
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return String(payload.sub || payload.id || payload.phone || 'guest');
  } catch {
    return 'guest';
  }
}

async function supabaseFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const error = new Error('Supabase not configured');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${normalizeSupabaseRestUrl()}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
    signal: options.signal || AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const error = new Error(typeof data === 'string' ? data : data?.message || data?.error || 'Supabase request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function parseJsonValue(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function safeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function listingRowToClient(row) {
  const locationData = parseJsonValue(row.location_data, {});
  const metadata = parseJsonValue(row.metadata, {});
  const sellerTypeRaw = row.seller_type || row.listing_type || metadata.sellerType || metadata.listingType || 'community';
  const sellerTypeValue = String(sellerTypeRaw).toLowerCase();
  const sellerType = sellerTypeValue === 'business' || sellerTypeValue === 'store' ? 'business' : 'community';
  const latitude = numberOrNull(row.latitude ?? locationData.latitude ?? locationData.lat ?? metadata.latitude ?? metadata.lat);
  const longitude = numberOrNull(row.longitude ?? locationData.longitude ?? locationData.lng ?? metadata.longitude ?? metadata.lng);
  const imageUrl = row.image_url || row.photo_url || row.image || metadata.imageUrl || metadata.photoUrl || metadata.image || metadata.photo || '';
  const sellerName = cleanSellerName(
    row.seller_name,
    row.seller_initials,
    row.store_name,
    metadata.sellerName,
    metadata.sellerInitials,
    metadata.businessName,
    metadata.storeName,
  );
  const sellerAvatar = metadata.sellerLogo || metadata.logoUrl || metadata.sellerAvatar || metadata.profileImage || metadata.avatarUrl || '';
  const sellerInitials = String(metadata.sellerInitials || getInitialsFromName(sellerName) || 'DU').trim().toUpperCase().slice(0, 2) || 'DU';
  const sellerProfileMetadata = parseJsonValue(metadata.sellerProfile, {});
  const quantity = Math.max(0, Number(row.quantity ?? metadata.quantity ?? row.available_quantity ?? metadata.availableQuantity ?? 1) || 0);
  const availableQuantity = Math.max(0, Number(row.available_quantity ?? metadata.availableQuantity ?? row.quantity ?? metadata.quantity ?? quantity) || 0);
  const karma = Number(row.karma_score ?? metadata.sellerKarma ?? metadata.karma ?? 0) || 0;
  const status = String(row.status || metadata.status || 'active').toLowerCase();

  return {
    id: row.id,
    serverId: row.id,
    serverPersisted: true,
    title: row.title,
    category: row.category,
    condition: row.condition,
    description: row.description || '',
    image: imageUrl,
    imageUrl,
    photo_url: imageUrl,
    sellerId: row.seller_id || '',
    ownerMobile: metadata.ownerMobile || '',
    sellerName,
    sellerInitials,
    sellerAvatar,
    sellerProfileImage: sellerAvatar,
    avatarUrl: sellerAvatar,
    sellerType,
    listingType: sellerType === 'business' ? 'business' : 'community',
    isBusinessProduct: sellerType === 'business',
    businessId: row.business_id || metadata.businessId || '',
    storeName: row.store_name || '',
    sellerKarma: karma,
    karma,
    totalQuantity: quantity,
    quantity,
    availableQuantity,
    reservedQuantity: Number(row.reserved_quantity || 0),
    soldQuantity: Number(row.sold_quantity || 0),
    price: Number(row.price ?? metadata.price ?? 0) || 0,
    expiryDate: safeDate(row.expiry_date || row.expiry || metadata.expiryDate || metadata.validTill),
    expiryTime: row.expiry_time || '',
    status: status === 'active' || status === 'available' || status === 'live' || status === 'published' ? 'Available' : status,
    location: row.location || row.area || row.city || '',
    area: row.area || locationData.area || locationData.locality || '',
    city: row.city || locationData.city || '',
    state: row.state || locationData.state || '',
    country: row.country || locationData.country || 'India',
    latitude,
    longitude,
    coordinates: latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : metadata.coordinates || null,
    locationData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sellerProfile: {
      id: String(sellerProfileMetadata.id || row.seller_id || row.business_id || '').trim(),
      name: sellerProfileMetadata.name || sellerName,
      initials: sellerProfileMetadata.initials || sellerInitials,
      avatarUrl: sellerProfileMetadata.avatarUrl || sellerAvatar,
      logoUrl: sellerProfileMetadata.logoUrl || metadata.logoUrl || metadata.sellerLogo || '',
      accountType: sellerProfileMetadata.accountType || (sellerType === 'business' ? 'business' : 'community'),
      area: sellerProfileMetadata.area || row.area || locationData.area || locationData.locality || '',
      city: sellerProfileMetadata.city || row.city || locationData.city || '',
      karma: Number(sellerProfileMetadata.karma ?? karma) || 0,
      activeListings: Number(sellerProfileMetadata.activeListings || 0) || 0,
      joinedAt: sellerProfileMetadata.joinedAt || '',
      bio: String(sellerProfileMetadata.bio || '').trim(),
      verified: Boolean(sellerProfileMetadata.verified || sellerType === 'business'),
    },
    metadata,
  };
}

const CLOSED_LISTING_STATUSES = new Set([
  'sold',
  'sold_out',
  'sold-out',
  'completed',
  'collected',
  'expired',
  'deleted',
  'removed',
  'hidden',
  'inactive',
  'cancelled',
  'canceled',
]);
const PUBLIC_LISTING_STATUSES = new Set(['', 'active', 'available', 'live', 'published', 'reserved']);

function listingStatusValue(row = {}) {
  const metadata = parseJsonValue(row.metadata, {});
  return String(row.status ?? metadata.status ?? 'active').trim().toLowerCase();
}

function listingAvailableQuantity(row = {}) {
  const metadata = parseJsonValue(row.metadata, {});
  const raw = row.available_quantity
    ?? metadata.availableQuantity
    ?? row.available
    ?? metadata.available
    ?? row.quantity
    ?? metadata.quantity;
  if (raw === undefined || raw === null || raw === '') return 1;
  return Math.max(0, Number(raw) || 0);
}

function listingExpiryMs(row = {}) {
  const metadata = parseJsonValue(row.metadata, {});
  const expiry = row.expiry_date
    || row.expiry
    || row.expires_at
    || metadata.expiryDate
    || metadata.expiry
    || metadata.expiresAt
    || metadata.validTill;
  if (!expiry) return Infinity;
  const ms = Date.parse(expiry);
  return Number.isFinite(ms) ? ms : Infinity;
}

function isTestListingRow(row = {}) {
  const metadata = parseJsonValue(row.metadata, {});
  const searchable = [
    row.id,
    row.title,
    row.description,
    row.seller_id,
    row.seller_name,
    row.store_name,
    row.business_id,
    row.category,
    row.location,
    metadata.sellerName,
    metadata.storeName,
    metadata.businessName,
    metadata.originalId,
    metadata.ownerName,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  return searchable.some((value) => (
    value.includes('e2e')
    || value.includes('codex')
    || value.includes('dummy')
    || value.includes('test item')
    || value.includes('verification item')
    || value.startsWith('demo-')
    || value.startsWith('demo_')
  ));
}

function isPublicListingRow(row = {}) {
  if (isTestListingRow(row)) return false;
  const status = listingStatusValue(row);
  if (CLOSED_LISTING_STATUSES.has(status)) return false;
  if (status && !PUBLIC_LISTING_STATUSES.has(status)) return false;
  if (listingAvailableQuantity(row) <= 0) return false;
  const expiryMs = listingExpiryMs(row);
  if (Number.isFinite(expiryMs) && expiryMs < Date.now()) return false;
  return true;
}

function isBusinessListingRow(row = {}) {
  const metadata = parseJsonValue(row.metadata, {});
  const type = String(row.seller_type || row.listing_type || metadata.sellerType || metadata.listingType || '').toLowerCase();
  return type.includes('business') || type.includes('store');
}

function rescuePriorityMs(row = {}) {
  const expiryMs = listingExpiryMs(row);
  if (!Number.isFinite(expiryMs)) return Infinity;
  const remaining = expiryMs - Date.now();
  if (remaining < 0) return Infinity;
  return remaining <= 5 * 24 * 60 * 60 * 1000 ? remaining : Infinity;
}

function sortPublicListingRows(a, b) {
  const aRescue = rescuePriorityMs(a);
  const bRescue = rescuePriorityMs(b);
  const aIsRescue = Number.isFinite(aRescue);
  const bIsRescue = Number.isFinite(bRescue);
  if (aIsRescue !== bIsRescue) return aIsRescue ? -1 : 1;
  if (aIsRescue && bIsRescue && aRescue !== bRescue) return aRescue - bRescue;

  const aBiz = isBusinessListingRow(a);
  const bBiz = isBusinessListingRow(b);
  if (aBiz !== bBiz) return aBiz ? -1 : 1;

  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

async function readRequestJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseMultipartFile(buffer, contentType = '') {
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);
  while (cursor !== -1) {
    const next = buffer.indexOf(delimiter, cursor + delimiter.length);
    if (next === -1) break;
    let part = buffer.slice(cursor + delimiter.length, next);
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      if (/name="(?:file|image|photo)"/i.test(headerText) && /filename="/i.test(headerText)) {
        const filename = headerText.match(/filename="([^"]*)"/i)?.[1] || `upload-${Date.now()}.jpg`;
        const mimetype = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
        return { filename, mimetype, buffer: content };
      }
    }
    cursor = next;
  }
  return null;
}

function safeUploadName(name = 'listing.jpg') {
  const cleaned = String(name).split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned || `listing-${Date.now()}.jpg`;
}

function profileDisplayName(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return profile.business_name
    || profile.full_name
    || profile.display_name
    || profile.name
    || metadata.fullName
    || metadata.displayName
    || metadata.businessName
    || metadata.name
    || '';
}

function profileAvatar(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return profile.logo_url
    || metadata.logoUrl
    || profile.avatar_url
    || metadata.avatarUrl
    || profile.profile_image
    || metadata.profileImage
    || '';
}

function profileKarma(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return Number(profile.karma_points ?? profile.karma ?? profile.store_karma ?? metadata.karma ?? metadata.storeKarma ?? 0) || 0;
}

function enrichListingRow(row = {}, profileMap = new Map()) {
  const metadata = parseJsonValue(row.metadata, {});
  const profileKeys = [
    row.seller_id,
    row.business_id,
    metadata.profileId,
    metadata.userId,
    metadata.sellerId,
    metadata.businessId,
    metadata.ownerMobile,
    metadata.mobile,
  ].map((key) => String(key || '').trim()).filter(Boolean);
  const profile = profileKeys.map((key) => profileMap.get(key)).find(Boolean);
  const profileMetadata = parseJsonValue(profile?.metadata, {});
  const profileLocation = parseJsonValue(profile?.profile_location, {});
  const name = cleanSellerName(
    profileDisplayName(profile || {}),
    row.seller_name,
    row.store_name,
    metadata.sellerName,
    metadata.ownerName,
    metadata.displayName,
    metadata.businessName,
    metadata.name,
      row.seller_initials,
      profile?.initials,
  );
  const initials = String(
    profile?.initials
      || metadata.sellerInitials
      || profileMetadata.initials
      || getInitialsFromName(name)
      || 'DU'
  ).trim().toUpperCase().slice(0, 2) || 'DU';
  const logoUrl = profile?.logo_url || profileMetadata.logoUrl || profileMetadata.businessLogo || metadata.logoUrl || '';
  const avatar = profileAvatar(profile || {})
    || metadata.sellerAvatar
    || metadata.avatarUrl
    || metadata.profileImage
    || '';
  const karma = Number(row.karma_score || 0)
    || profileKarma(profile || {})
    || Number(metadata.karma || metadata.storeKarma || metadata.sellerKarma || 0)
    || 0;
  const accountType = String(
    profile?.account_type
      || profile?.mode
      || profileMetadata.accountType
      || profileMetadata.mode
      || row.seller_type
      || metadata.sellerType
      || metadata.listingType
      || 'community'
  ).toLowerCase();
  const profileArea = profileLocation.area
    || profileLocation.locality
    || profileLocation.subLocality
    || profileMetadata.area
    || metadata.area
    || row.area
    || '';
  const profileCity = profileLocation.city
    || profileLocation.district
    || profileMetadata.city
    || metadata.city
    || row.city
    || '';
  const joinedAt = profile?.created_at || profileMetadata.createdAt || '';
  const bio = String(profile?.bio || profileMetadata.bio || '').trim();
  const verified = Boolean(
    profile?.verified
    || profile?.is_verified
    || profileMetadata.verified
    || profileMetadata.isVerified
    || accountType === 'business'
  );
  const activeListings = Number(profileMetadata.activeListings || profileMetadata.listingsCount || profileMetadata.activeListingCount || 0) || 0;

  return {
    ...row,
    seller_name: name,
    karma_score: karma,
    seller_initials: initials,
    metadata: {
      ...metadata,
      sellerName: name,
      displayName: metadata.displayName || name,
      sellerInitials: initials,
      sellerLogo: metadata.sellerLogo || logoUrl,
      logoUrl: metadata.logoUrl || logoUrl,
      sellerAvatar: avatar,
      avatarUrl: metadata.avatarUrl || avatar,
      profileImage: metadata.profileImage || avatar,
      sellerProfile: {
        id: String(profile?.id || row.seller_id || row.business_id || metadata.profileId || '').trim(),
        name,
        initials,
        avatarUrl: avatar,
        logoUrl,
        accountType,
        area: profileArea,
        city: profileCity,
        karma,
        activeListings,
        joinedAt,
        bio,
        verified,
      },
    },
  };
}

async function attachListingProfiles(rows = []) {
  const ids = [...new Set(rows.flatMap((row) => {
    const metadata = parseJsonValue(row.metadata, {});
    return [
      row.seller_id,
      row.business_id,
      metadata.profileId,
      metadata.userId,
      metadata.sellerId,
      metadata.businessId,
      metadata.ownerMobile,
      metadata.mobile,
    ].map((id) => String(id || '').trim()).filter(Boolean);
  }))];
  if (!ids.length) return rows.map((row) => enrichListingRow(row));
  try {
    const filter = ids.map((id) => encodeURIComponent(id)).join(',');
    const profiles = await supabaseFetch(`/profiles?id=in.(${filter})&select=*`);
    const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [String(profile.id), profile]));
    return rows.map((row) => enrichListingRow(row, profileMap));
  } catch (error) {
    console.error('[api] profile join failed for listings', error?.message || error);
    return rows.map((row) => enrichListingRow(row));
  }
}

function listingPayloadToSupabase(body = {}) {
  const listingMetadata = parseJsonValue(body.metadata || body.meta, {});
  const locationData = body.locationData || body.location_data || {};
  const coordinates = body.coordinates || {};
  const sellerType = body.sellerType || body.seller_type || body.listingType || (body.isBusinessProduct ? 'business' : 'community');
  const id = String(body.serverId || body.id || `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const quantity = Math.max(0, Number(body.totalQuantity ?? body.quantity ?? body.availableQuantity ?? 1) || 1);
  const availableQuantity = Math.max(0, Number(body.availableQuantity ?? body.quantity ?? quantity) || 0);
  const latitude = numberOrNull(body.latitude ?? body.lat ?? coordinates.lat ?? locationData.latitude ?? locationData.lat);
  const longitude = numberOrNull(body.longitude ?? body.lng ?? coordinates.lng ?? locationData.longitude ?? locationData.lng);
  const sellerName = cleanSellerName(
    body.sellerName,
    body.seller_name,
    body.storeName,
    body.businessName,
    body.ownerName,
    body.userName,
    body.profileName,
    body.displayName,
    listingMetadata.sellerName,
    listingMetadata.ownerName,
    listingMetadata.displayName,
    listingMetadata.businessName,
    listingMetadata.name,
  );
  const sellerAvatar = body.sellerAvatar
    || body.avatarUrl
    || body.avatar_url
    || body.profileImage
    || body.profile_image
    || body.photoUrl
    || listingMetadata.sellerAvatar
    || listingMetadata.avatarUrl
    || listingMetadata.profileImage
    || listingMetadata.logoUrl
    || '';

  return {
    id,
    title: body.title || body.name || 'Untitled listing',
    category: body.category || 'Other',
    condition: body.condition || 'Good',
    description: body.description || '',
    image_url: body.imageUrl || body.image_url || body.photo_url || body.image || body.photo || '',
    seller_id: String(body.sellerId || body.seller_id || body.userId || body.user_id || body.profileId || body.businessId || body.ownerMobile || body.mobile || 'guest'),
    seller_name: sellerName,
    seller_type: sellerType === 'business' ? 'business' : 'community',
    business_id: body.businessId || body.business_id || null,
    store_name: body.storeName || body.businessName || body.store_name || null,
    karma_score: Number(body.sellerKarma ?? body.karmaScore ?? body.karma ?? 0) || 0,
    quantity,
    available_quantity: availableQuantity,
    reserved_quantity: Math.max(0, Number(body.reservedQuantity ?? 0) || 0),
    sold_quantity: Math.max(0, Number(body.soldQuantity ?? 0) || 0),
    price: Number(body.price ?? body.sellingPrice ?? 0) || 0,
    expiry_date: body.expiryDate || body.validTill || null,
    expiry_time: body.expiryTime || body.expiry_time || null,
    status: String(body.status || 'active').toLowerCase() === 'available' ? 'active' : String(body.status || 'active').toLowerCase(),
    latitude,
    longitude,
    location: body.location || body.pickupArea || body.pickupLocation || locationData.displayAddress || locationData.formattedAddress || '',
    area: body.area || locationData.area || locationData.locality || locationData.subLocality || '',
    city: body.city || locationData.city || '',
    state: body.state || locationData.state || '',
    country: body.country || locationData.country || 'India',
    location_data: locationData,
    metadata: {
      ...listingMetadata,
      ownerMobile: body.ownerMobile || body.mobile || '',
      sellerName,
      sellerAvatar,
      avatarUrl: sellerAvatar,
      profileImage: sellerAvatar,
      originalId: body.originalId || body.id || id,
      sellerInitials: body.sellerInitials || body.initials || '',
      isOwn: Boolean(body.isOwn),
    },
  };
}

async function handleListings(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return sendJson(res, 503, { error: 'Supabase not configured' });
  }

  const restUrl = normalizeSupabaseRestUrl();

  if (req.method === 'GET' || req.method === 'HEAD') {
    const url = `${restUrl}/listings?select=*&order=created_at.desc&limit=1000`;
    const response = await fetch(url, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    if (!response.ok) {
      return sendJson(res, response.status, { error: 'Could not fetch listings', details: text.slice(0, 200) });
    }
    const parsedRows = JSON.parse(text || '[]');
    const publicRows = (Array.isArray(parsedRows) ? parsedRows : [])
      .filter(isPublicListingRow)
      .sort(sortPublicListingRows);
    const rows = await attachListingProfiles(publicRows);
    return sendJson(res, 200, rows.map(listingRowToClient));
  }

  if (req.method === 'POST') {
    const body = await readRequestJson(req);
    const payload = listingPayloadToSupabase(body);
    const response = await fetch(`${restUrl}/listings?on_conflict=id&select=*`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    if (!response.ok) {
      return sendJson(res, response.status, { error: 'Could not save listing', details: text.slice(0, 200) });
    }
    const [row] = JSON.parse(text || '[]');
    return sendJson(res, 201, listingRowToClient(row));
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleListingById(req, res, listingId) {
  if (!listingId) return sendJson(res, 400, { error: 'Missing listing id' });

  if (req.method === 'PUT') {
    const body = await readRequestJson(req);
    const payload = listingPayloadToSupabase({ ...body, id: listingId });
    const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    return sendJson(res, 200, listingRowToClient(rows?.[0] || { ...payload, id: listingId }));
  }

  if (req.method === 'DELETE') {
    await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'hidden', updated_at: new Date().toISOString() }),
    });
    return sendJson(res, 200, { success: true, id: listingId });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleUpload(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return sendJson(res, 503, { error: 'Supabase not configured' });

  const body = await readRequestBuffer(req);
  const file = parseMultipartFile(body, req.headers?.['content-type'] || req.headers?.['Content-Type'] || '');
  if (!file?.buffer?.length) return sendJson(res, 400, { error: 'No file uploaded' });

  const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeUploadName(file.filename)}`;

  const configuredBucket = getSupabaseBucket();
  const bucketCandidates = [...new Set([configuredBucket, 'Drizn', 'drizn-listings'].filter(Boolean))];
  let lastUploadError = '';

  for (const bucket of bucketCandidates) {
    const storageUrl = `${getSupabaseStorageUrl()}/object/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const uploadOnce = () => fetch(storageUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': file.mimetype,
        'x-upsert': 'false',
      },
      body: file.buffer,
      signal: AbortSignal.timeout(20000),
    });

    let response = await uploadOnce();
    const text = await response.text();
    if (response.ok) {
      const publicUrl = `${getSupabaseStorageUrl()}/object/public/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
      return sendJson(res, 200, { url: publicUrl, key, bucket });
    }

    lastUploadError = text.slice(0, 200);
    if (/Bucket not found/i.test(text)) {
      const created = await ensureStorageBucket(bucket);
      if (created) {
        response = await uploadOnce();
        const retryText = await response.text();
        if (response.ok) {
          const publicUrl = `${getSupabaseStorageUrl()}/object/public/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
          return sendJson(res, 200, { url: publicUrl, key, bucket });
        }
        lastUploadError = retryText.slice(0, 200);
      }
    }

    if (response.status !== 404) {
      return sendJson(res, response.status, { error: 'Upload failed', details: lastUploadError });
    }
  }

  return sendJson(res, 404, {
    error: 'Upload bucket not found',
    details: lastUploadError || 'Create a Supabase Storage bucket named Drizn or set SUPABASE_STORAGE_BUCKET.',
  });
}

async function handleProfile(req, res) {
  const userId = getAuthUserId(req);
  if (req.method === 'GET') {
    try {
      const rows = await supabaseFetch(`/profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
      return sendJson(res, 200, rows?.[0] || { id: userId, name: 'Unknown' });
    } catch (error) {
      if (error.status === 404) return sendJson(res, 200, { id: userId, name: 'Unknown' });
      return sendJson(res, 200, { id: userId, name: 'Unknown' });
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readRequestJson(req);
    const payload = {
      id: userId,
      name: body.name || 'Unknown',
      mobile: body.mobile || body.phone || '',
      profile_image: body.profileImage || body.profile_image || '',
      bio: body.bio || '',
      location_link: body.locationLink || body.location_link || '',
      website_link: body.websiteLink || body.website_link || '',
      instagram_link: body.instagramLink || body.instagram_link || '',
      metadata: body,
      updated_at: new Date().toISOString(),
    };
    try {
      const rows = await supabaseFetch('/profiles?on_conflict=id&select=*', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      });
      return sendJson(res, 200, rows?.[0] || { success: true, ...payload });
    } catch {
      return sendJson(res, 200, { success: true, ...payload });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleFavourites(req, res, productId = '') {
  const userId = getAuthUserId(req);
  if (req.method === 'GET') {
    try {
      const rows = await supabaseFetch(`/listing_favourites?user_id=eq.${encodeURIComponent(userId)}&select=listing_id&order=created_at.desc`);
      return sendJson(res, 200, (rows || []).map((row) => row.listing_id));
    } catch (error) {
      return sendJson(res, 200, []);
    }
  }

  if (req.method === 'POST') {
    if (!productId) return sendJson(res, 400, { error: 'Missing product id' });
    try {
      const existing = await supabaseFetch(`/listing_favourites?user_id=eq.${encodeURIComponent(userId)}&listing_id=eq.${encodeURIComponent(productId)}&select=listing_id`);
      if (existing?.length) {
        await supabaseFetch(`/listing_favourites?user_id=eq.${encodeURIComponent(userId)}&listing_id=eq.${encodeURIComponent(productId)}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        return sendJson(res, 200, { success: true, productId, favourited: false });
      }
      await supabaseFetch('/listing_favourites', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, listing_id: productId }),
      });
      return sendJson(res, 200, { success: true, productId, favourited: true });
    } catch (error) {
      return sendJson(res, error.status || 500, {
        error: 'Could not update favourite',
        message: error.message || 'Favourite persistence failed',
      });
    }
  }

  if (req.method === 'DELETE') {
    if (!productId) return sendJson(res, 400, { error: 'Missing product id' });
    try {
      await supabaseFetch(`/listing_favourites?user_id=eq.${encodeURIComponent(userId)}&listing_id=eq.${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return sendJson(res, 200, { success: true, productId, removed: true, favourited: false });
    } catch (error) {
      return sendJson(res, error.status || 500, {
        error: 'Could not remove favourite',
        message: error.message || 'Favourite persistence failed',
      });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

function requestRowToOrder(row = {}) {
  const details = parseJsonValue(row.details, {});
  return {
    id: row.id,
    orderId: row.id,
    requestId: row.id,
    productId: row.listing_id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    businessId: details.businessId || details.business_id || '',
    status: details.orderStatus || details.status || row.status,
    requestStatus: row.status,
    quantity: Number(row.quantity || details.quantity || 1),
    collectionCode: details.collectionCode || details.collection_code || row.id,
    qrCodeValue: details.qrCodeValue || details.collectionCode || row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...details,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'evt') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFiniteNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function haversineKm(from, to) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function getLocationFromTokenMetadata(metadata = {}) {
  const location = metadata.location || metadata.geo || {};
  const lat = toFiniteNumber(location.latitude ?? location.lat ?? metadata.latitude ?? metadata.lat);
  const lng = toFiniteNumber(location.longitude ?? location.lng ?? metadata.longitude ?? metadata.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function notificationOpenPath({ eventType = '', listingId = '', requestId = '', orderId = '' }) {
  const type = String(eventType || '').toLowerCase();
  if (type === 'new_request' || type === 'request_accepted' || type === 'request_declined') {
    return requestId ? `/request/${encodeURIComponent(requestId)}` : '/';
  }
  if (type === 'store_reservation_received' || type === 'reservation_confirmed') {
    return orderId ? `/business/orders?order=${encodeURIComponent(orderId)}` : '/business/orders';
  }
  if (listingId) return `/listing/${encodeURIComponent(listingId)}`;
  return '/';
}

async function persistNotificationEvent(payload = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { success: true, persisted: false, push: { attempted: false, sent: false } };
  }

  const {
    eventType,
    recipientAccountId,
    actorAccountId = '',
    listingId = '',
    requestId = '',
    orderId = '',
    title = 'Drizn update',
    body = '',
    dedupeKey = '',
    payload: metadataPayload = {},
  } = payload;

  const eventId = makeId('evt');
  const openPath = notificationOpenPath({ eventType, listingId, requestId, orderId });
  const mergedPayload = {
    ...(metadataPayload || {}),
    openPath,
  };

  try {
    if (dedupeKey) {
      const existing = await supabaseFetch(`/notification_events?select=id&dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`);
      if (Array.isArray(existing) && existing.length > 0) {
        return {
          success: true,
          accepted: true,
          deduped: true,
          persisted: true,
          id: existing[0].id,
          openPath,
          push: { attempted: false, sent: false },
        };
      }
    }

    await supabaseFetch('/notification_events', {
      method: 'POST',
      body: JSON.stringify({
        id: eventId,
        event_type: String(eventType),
        recipient_account_id: String(recipientAccountId),
        actor_account_id: String(actorAccountId || ''),
        listing_id: listingId || null,
        request_id: requestId || null,
        order_id: orderId || null,
        dedupe_key: dedupeKey || null,
        payload: mergedPayload,
        push_attempted: false,
        push_sent: false,
        created_at: nowIso(),
      }),
    });

    await supabaseFetch('/app_notifications', {
      method: 'POST',
      body: JSON.stringify({
        id: eventId,
        recipient_account_id: String(recipientAccountId),
        actor_account_id: String(actorAccountId || ''),
        event_type: String(eventType),
        listing_id: listingId || null,
        request_id: requestId || null,
        order_id: orderId || null,
        title: String(title),
        body: String(body || ''),
        payload: mergedPayload,
        read: false,
        created_at: nowIso(),
      }),
    });

    return {
      success: true,
      accepted: true,
      persisted: true,
      id: eventId,
      openPath,
      push: { attempted: false, sent: false },
    };
  } catch (error) {
    return {
      success: true,
      accepted: false,
      persisted: false,
      push: { attempted: false, sent: false },
      error: error.message || 'notification persistence failed',
    };
  }
}

async function handleNotifications(req, res, url) {
  if (url === '/api/notifications/token' || url === '/notifications/token') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readRequestJson(req);
    const accountId = String(body.accountId || getAuthUserId(req)).trim();
    const token = String(body.token || '').trim();
    if (!accountId || !token) return sendJson(res, 400, { error: 'accountId and token are required' });
    if (!SUPABASE_URL || !SUPABASE_KEY) return sendJson(res, 200, { success: true, persisted: false });
    try {
      await supabaseFetch('/push_tokens?on_conflict=token&select=token', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          account_id: accountId,
          token,
          platform: String(body.platform || 'web'),
          enabled: body.enabled !== false,
          metadata: body.metadata || {},
          last_seen_at: nowIso(),
          updated_at: nowIso(),
        }),
      });
      return sendJson(res, 200, { success: true, persisted: true });
    } catch (error) {
      return sendJson(res, 200, { success: true, persisted: false, error: error.message || 'token persistence failed' });
    }
  }

  if (url === '/api/notifications/token/disable' || url === '/notifications/token/disable') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readRequestJson(req);
    const token = String(body.token || '').trim();
    if (!token) return sendJson(res, 400, { error: 'token is required' });
    if (!SUPABASE_URL || !SUPABASE_KEY) return sendJson(res, 200, { success: true, persisted: false });
    try {
      await supabaseFetch(`/push_tokens?token=eq.${encodeURIComponent(token)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false, invalidated_at: nowIso(), updated_at: nowIso() }),
      });
      return sendJson(res, 200, { success: true, persisted: true });
    } catch (error) {
      return sendJson(res, 200, { success: true, persisted: false, error: error.message || 'token disable failed' });
    }
  }

  const prefMatch = url.match(/^\/(?:api\/)?notifications\/preferences\/([^/]+)$/);
  if (prefMatch) {
    const accountId = decodeURIComponent(prefMatch[1]);
    if (req.method === 'GET') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return sendJson(res, 200, {
          accountId,
          transactionalEnabled: true,
          marketingEnabled: false,
          nearbyEnabled: true,
          favouritesEnabled: true,
          mutedAccountIds: [],
          blockedAccountIds: [],
          maxNearbyPerDay: 5,
        });
      }
      try {
        const rows = await supabaseFetch(`/notification_preferences?account_id=eq.${encodeURIComponent(accountId)}&select=*&limit=1`);
        const pref = rows?.[0] || {};
        return sendJson(res, 200, {
          accountId,
          transactionalEnabled: pref.transactional_enabled ?? true,
          marketingEnabled: pref.marketing_enabled ?? false,
          nearbyEnabled: pref.nearby_enabled ?? true,
          favouritesEnabled: pref.favourites_enabled ?? true,
          mutedAccountIds: pref.muted_account_ids || [],
          blockedAccountIds: pref.blocked_account_ids || [],
          maxNearbyPerDay: Number(pref.max_nearby_per_day || 5),
        });
      } catch {
        return sendJson(res, 200, {
          accountId,
          transactionalEnabled: true,
          marketingEnabled: false,
          nearbyEnabled: true,
          favouritesEnabled: true,
          mutedAccountIds: [],
          blockedAccountIds: [],
          maxNearbyPerDay: 5,
        });
      }
    }

    if (req.method === 'PUT') {
      const body = await readRequestJson(req);
      if (!SUPABASE_URL || !SUPABASE_KEY) return sendJson(res, 200, { success: true, persisted: false });
      try {
        await supabaseFetch('/notification_preferences?on_conflict=account_id&select=account_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify({
            account_id: accountId,
            transactional_enabled: body.transactionalEnabled !== false,
            marketing_enabled: Boolean(body.marketingEnabled),
            nearby_enabled: body.nearbyEnabled !== false,
            favourites_enabled: body.favouritesEnabled !== false,
            muted_account_ids: Array.isArray(body.mutedAccountIds) ? body.mutedAccountIds : [],
            blocked_account_ids: Array.isArray(body.blockedAccountIds) ? body.blockedAccountIds : [],
            max_nearby_per_day: Math.max(1, Number(body.maxNearbyPerDay || 5)),
            updated_at: nowIso(),
          }),
        });
        return sendJson(res, 200, { success: true, persisted: true });
      } catch (error) {
        return sendJson(res, 200, { success: true, persisted: false, error: error.message || 'preference update failed' });
      }
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const historyMatch = url.match(/^\/(?:api\/)?notifications\/history\/([^/]+)$/);
  if (historyMatch) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const accountId = decodeURIComponent(historyMatch[1]);
    const limitMatch = String(req.url || '').match(/[?&]limit=(\d+)/);
    const limit = Math.max(1, Math.min(100, Number(limitMatch?.[1] || 50)));
    if (!SUPABASE_URL || !SUPABASE_KEY) return sendJson(res, 200, []);
    try {
      const rows = await supabaseFetch(`/app_notifications?recipient_account_id=eq.${encodeURIComponent(accountId)}&select=*&order=created_at.desc&limit=${limit}`);
      return sendJson(res, 200, rows || []);
    } catch {
      return sendJson(res, 200, []);
    }
  }

  if (url === '/api/notifications/events' || url === '/notifications/events') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readRequestJson(req);
    if (!body.eventType || !body.recipientAccountId) {
      return sendJson(res, 400, { error: 'eventType and recipientAccountId are required' });
    }
    const result = await persistNotificationEvent({
      eventType: String(body.eventType),
      recipientAccountId: String(body.recipientAccountId),
      actorAccountId: String(body.actorAccountId || getAuthUserId(req) || ''),
      listingId: body.listingId ? String(body.listingId) : '',
      requestId: body.requestId ? String(body.requestId) : '',
      orderId: body.orderId ? String(body.orderId) : '',
      title: String(body.title || 'Drizn update'),
      body: String(body.body || ''),
      dedupeKey: body.dedupeKey ? String(body.dedupeKey) : '',
      payload: body.payload || {},
    });
    return sendJson(res, 200, result);
  }

  if (url === '/api/notifications/nearby-listing' || url === '/notifications/nearby-listing') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readRequestJson(req);
    const ownerId = String(body.actorAccountId || getAuthUserId(req) || '').trim();
    const listingId = String(body.listingId || '').trim();
    const lat = toFiniteNumber(body.latitude);
    const lng = toFiniteNumber(body.longitude);
    if (!ownerId || !listingId || lat === null || lng === null) {
      return sendJson(res, 400, { error: 'actorAccountId, listingId, latitude, and longitude are required' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return sendJson(res, 200, { success: true, persisted: false, notifiedCount: 0 });
    }

    try {
      const radiusKm = Math.max(0.5, Math.min(10, Number(body.radiusKm || 2)));
      const tokenRows = await supabaseFetch('/push_tokens?enabled=eq.true&select=account_id,metadata');
      const recipients = (tokenRows || [])
        .map((row) => {
          const accountId = String(row.account_id || '');
          if (!accountId || accountId === ownerId) return null;
          const coordinates = getLocationFromTokenMetadata(parseJsonValue(row.metadata, {}));
          if (!coordinates) return null;
          const distanceKm = haversineKm({ lat, lng }, coordinates);
          if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return null;
          return { accountId, distanceKm };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const today = new Date().toISOString().slice(0, 10);
      let notifiedCount = 0;
      for (const recipient of recipients) {
        const result = await persistNotificationEvent({
          eventType: 'nearby_listing',
          recipientAccountId: recipient.accountId,
          actorAccountId: ownerId,
          listingId,
          title: 'New nearby listing',
          body: `${String(body.title || 'A listing')} is available within 2 km${body.area || body.city ? ` near ${[body.area, body.city].filter(Boolean).join(', ')}` : ''}.`,
          dedupeKey: `nearby_listing:${listingId}:${recipient.accountId}:${today}`,
          payload: {
            category: String(body.category || ''),
            distanceKm: Number(recipient.distanceKm.toFixed(2)),
            area: String(body.area || ''),
            city: String(body.city || ''),
          },
        });
        if (result.accepted && !result.deduped) notifiedCount += 1;
      }

      return sendJson(res, 200, {
        success: true,
        persisted: true,
        candidates: recipients.length,
        notifiedCount,
      });
    } catch (error) {
      return sendJson(res, 200, {
        success: true,
        persisted: false,
        notifiedCount: 0,
        error: error.message || 'nearby processing failed',
      });
    }
  }

  return null;
}

async function handleOrders(req, res) {
  const userId = getAuthUserId(req);
  if (req.method === 'GET') {
    try {
      const rows = await supabaseFetch(`/requests?or=(buyer_id.eq.${encodeURIComponent(userId)},seller_id.eq.${encodeURIComponent(userId)})&select=*&order=created_at.desc`);
      return sendJson(res, 200, (rows || []).map(requestRowToOrder));
    } catch (error) {
      return sendJson(res, 200, []);
    }
  }

  if (req.method === 'POST') {
    const body = await readRequestJson(req);
    const id = body.id || body.orderId || `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const listingId = body.productId || body.product_id || body.listingId || body.listing_id || id;
    const sellerId = body.sellerId || body.seller_id || body.businessId || body.business_id || 'unknown-seller';
    const quantity = Number(body.quantity || 1) || 1;
    const payload = {
      id,
      listing_id: String(listingId),
      buyer_id: String(body.buyerId || body.buyer_id || userId),
      seller_id: String(sellerId),
      quantity,
      status: ['pending', 'confirmed', 'declined', 'handed_over', 'collected', 'completed', 'cancelled'].includes(String(body.status || '').toLowerCase())
        ? String(body.status).toLowerCase()
        : 'pending',
      details: {
        ...body,
        orderStatus: body.status || 'reserved',
        collectionCode: body.collectionCode || body.collection_code || body.qrCodeValue || id,
        quantity,
      },
    };
    try {
      const rows = await supabaseFetch('/requests?on_conflict=id&select=*', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      });
      return sendJson(res, 201, requestRowToOrder(rows?.[0] || payload));
    } catch (error) {
      return sendJson(res, error.status || 500, {
        error: 'Could not save order',
        message: error.message || 'Order persistence failed',
        details: error.data || null,
      });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

export default async function handler(req, res) {
  const url = getPathname(req);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  if (url === '/api/health' || url === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'drizn-api',
      runtime: 'vercel',
      persistence: 'supabase',
      timestamp: new Date().toISOString(),
    });
  }

  if (url === '/api/persistence' || url === '/persistence') {
    return sendJson(res, 200, {
      mode: 'supabase',
      backend: 'vercel-serverless',
      liveListings: true,
      uploads: true,
      timestamp: new Date().toISOString(),
    });
  }

  if (url === '/api/listings' || url === '/listings') {
    try {
      return await handleListings(req, res);
    } catch (error) {
      return sendJson(res, 500, { error: 'Listings route failed', message: error.message || 'Unknown error' });
    }
  }

  const listingMatch = url.match(/^\/(?:api\/)?listings\/([^/]+)$/);
  if (listingMatch) {
    try {
      return await handleListingById(req, res, decodeURIComponent(listingMatch[1]));
    } catch (error) {
      return sendJson(res, error.status || 500, { error: 'Listing route failed', message: error.message || 'Unknown error' });
    }
  }

  if (url === '/api/upload' || url === '/upload') {
    try {
      return await handleUpload(req, res);
    } catch (error) {
      return sendJson(res, 500, { error: 'Upload route failed', message: error.message || 'Unknown error' });
    }
  }

  if (url === '/api/profile' || url === '/profile') {
    return handleProfile(req, res);
  }

  if (url === '/api/favourites' || url === '/favourites') {
    return handleFavourites(req, res);
  }

  const favouriteMatch = url.match(/^\/(?:api\/)?favourites\/([^/]+)$/);
  if (favouriteMatch) {
    return handleFavourites(req, res, decodeURIComponent(favouriteMatch[1]));
  }

  if (url === '/api/orders' || url === '/orders') {
    return handleOrders(req, res);
  }

  if (url.startsWith('/api/notifications') || url.startsWith('/notifications')) {
    const handled = await handleNotifications(req, res, url);
    if (handled !== null) return handled;
  }

  const routeHandler = await getAppHandler();
  return routeHandler(req, res);
}
