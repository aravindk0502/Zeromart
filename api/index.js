import serverless from 'serverless-http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cert, getApps as getFirebaseApps, initializeApp as initializeFirebaseApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import jwt from 'jsonwebtoken';

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
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://drizn.com https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'self';",
};

const DEFAULT_SELLER_NAME = 'Drizn User';
const FALLBACK_JWT_SECRET = 'zeromart-dev-secret-change-in-prod';
const JWT_SECRET = String(process.env.JWT_SECRET || FALLBACK_JWT_SECRET).trim();
const AUTH_PROXY_BASE_URL = String(
  process.env.AUTH_PROXY_BASE_URL
  || process.env.RAILWAY_API_URL
  || 'https://web-production-74e61.up.railway.app'
).trim().replace(/\/+$/, '');
const AUTH_PROXY_TIMEOUT_MS = Math.max(5000, Number(process.env.AUTH_PROXY_TIMEOUT_MS || 20000) || 20000);
const AUTH_PROXY_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUTH_PROXY_MAX_ATTEMPTS || 2) || 2);

function isPlaceholderName(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'unknown'
    || normalized === 'undefined'
    || normalized === 'null'
    || normalized === 'guest';
}

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
    return !isPlaceholderName(trimmed);
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

function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function getSocialPreviewImage(imageUrl = '') {
  const image = String(imageUrl || '').trim();
  if (!image) return 'https://www.drizn.com/assets/drizn-logo.png';
  if (!image.includes('.supabase.co/storage/v1/object/public/')) return image;
  const transformed = image.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const separator = transformed.includes('?') ? '&' : '?';
  return `${transformed}${separator}width=1200&height=630&resize=cover&quality=80`;
}

async function sendPublicProductPage(res, listingId) {
  const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
  const listing = rows?.[0];
  if (!listing || !isPublicListingRow(listing)) {
    return sendJson(res, 404, { error: 'Listing not found' });
  }
  const product = listingRowToClient(listing);
  const seller = cleanSellerName(product.sellerName, product.storeName, DEFAULT_SELLER_NAME);
  const canonicalUrl = `https://www.drizn.com/product/${encodeURIComponent(String(product.id))}`;
  const title = `${product.title} - FREE | Drizn`;
  const description = `${product.title} is available FREE from ${seller}. Good Things. Nearby.`;
  const image = `https://www.drizn.com/product-image/${encodeURIComponent(String(product.id))}`;
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description || description,
    image: [image],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    },
  }).replace(/</g, '\\u003c');
  const htmlPath = new URL('../dist/index.html', import.meta.url);
  const template = await readFile(htmlPath, 'utf8');
  const metadata = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:site_name" content="Drizn">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escapeHtml(product.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<script type="application/ld+json">${structuredData}</script>`,
  ].join('\n');
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta name="description"[^>]*>/i, '')
    .replace(/<link rel="canonical"[^>]*>/i, '')
    .replace('</head>', `${metadata}</head>`);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
  res.end(html);
}

async function sendPublicProductImage(res, listingId, method = 'GET') {
  const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
  const listing = rows?.[0];
  if (!listing || !isPublicListingRow(listing)) return sendJson(res, 404, { error: 'Listing not found' });
  const product = listingRowToClient(listing);
  const imageUrl = getSocialPreviewImage(product.image);
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) return sendJson(res, 404, { error: 'Product image not found' });
  const body = Buffer.from(await imageResponse.arrayBuffer());
  res.statusCode = 200;
  res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'image/jpeg');
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
  if (method === 'HEAD') return res.end();
  res.end(body);
}

function getPathname(req) {
  const rawUrl = req.url || '/';
  try {
    return new URL(rawUrl, 'https://drizn.local').pathname;
  } catch {
    return rawUrl.split('?')[0] || '/';
  }
}

function isAuthProxyRetryableError(error) {
  if (!error) return false;
  const status = Number(error?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || error || '').toLowerCase();
  return /timed out|timeout|aborted|network|fetch failed|socket|econnreset|econnrefused|enotfound|eai_again/.test(message);
}

function resolveSafeAuthProxyBaseUrl(req) {
  const candidate = String(AUTH_PROXY_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!candidate) return '';
  try {
    const target = new URL(candidate);
    const requestHost = String(req.headers?.host || '').trim().toLowerCase();
    const targetHost = String(target.host || '').trim().toLowerCase();
    if (requestHost && targetHost && requestHost === targetHost) {
      return 'https://web-production-74e61.up.railway.app';
    }
  } catch {
    return '';
  }
  return candidate;
}

async function forwardAuthRequest(req, res, urlPath) {
  const upstreamBaseUrl = resolveSafeAuthProxyBaseUrl(req);
  if (!upstreamBaseUrl) {
    return sendJson(res, 503, {
      error: 'Auth service unavailable',
      code: 'AUTH_PROXY_NOT_CONFIGURED',
    });
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'GET'].includes(method)) {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = method === 'GET' ? null : await readRequestJson(req);
  let lastError = null;

  for (let attempt = 1; attempt <= AUTH_PROXY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController();
      const fetchPromise = fetch(`${upstreamBaseUrl}${urlPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers?.authorization ? { Authorization: req.headers.authorization } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          controller.abort();
          const timeoutError = new Error('Auth request timed out');
          timeoutError.status = 504;
          reject(timeoutError);
        }, AUTH_PROXY_TIMEOUT_MS);
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      const raw = await response.text();
      let parsed;
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = { message: raw || '' };
      }

      if (!response.ok) {
        const error = new Error(parsed?.error || parsed?.message || `Auth upstream failed (${response.status})`);
        error.status = response.status;
        error.response = parsed;
        if (attempt < AUTH_PROXY_MAX_ATTEMPTS && isAuthProxyRetryableError(error)) {
          lastError = error;
          continue;
        }
        return sendJson(res, response.status, parsed);
      }

      return sendJson(res, response.status || 200, parsed);
    } catch (error) {
      const normalizedError = error?.name === 'AbortError'
        ? Object.assign(new Error('Auth request timed out'), { status: 504 })
        : error;
      lastError = normalizedError;
      if (attempt < AUTH_PROXY_MAX_ATTEMPTS && isAuthProxyRetryableError(normalizedError)) {
        continue;
      }
    }
  }

  return sendJson(res, Number(lastError?.status || 502), {
    error: 'Auth service temporarily unavailable',
    code: 'AUTH_PROXY_FAILED',
    message: String(lastError?.message || 'Unknown auth proxy error'),
  });
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

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return String(payload.sub || payload.id || payload.phone || 'guest');
  } catch {
    return 'guest';
  }
}

function normalizeProfileAccountType(value = '') {
  const type = String(value || '').trim().toLowerCase();
  return type === 'business' || type === 'store' ? 'business' : 'personal';
}

function normalizeProfilePhone(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return undefined;
}

function getAuthProfileContext(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  const headerAccountType = normalizeProfileAccountType(req.headers?.['x-account-type'] || req.headers?.['x-accounttype']);
  const headerPhone = normalizeProfilePhone(req.headers?.['x-normalized-phone'] || req.headers?.['x-account-phone']);

  if (!token) {
    return {
      userId: 'guest',
      accountType: headerAccountType,
      normalizedPhone: headerPhone,
      accountKey: headerPhone ? `${headerPhone}:${headerAccountType}` : `guest:${headerAccountType}`,
      payload: {},
    };
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const accountType = normalizeProfileAccountType(
      headerAccountType
      || payload.account_type
      || payload.accountType
      || payload.mode
      || payload.profile_type
    );
    const normalizedPhone = normalizeProfilePhone(
      headerPhone
      || payload.normalized_phone
      || payload.phone
      || payload.mobile
      || payload.sub
      || payload.id
      || ''
    );
    const userId = String(
      payload.sub
      || payload.id
      || payload.user_id
      || payload.account_id
      || payload.profile_id
      || payload.phone
      || payload.mobile
      || 'guest'
    ).trim() || 'guest';
    return {
      userId,
      accountType,
      normalizedPhone,
      accountKey: normalizedPhone ? `${normalizedPhone}:${accountType}` : `${userId}:${accountType}`,
      payload,
    };
  } catch {
    return {
      userId: 'guest',
      accountType: headerAccountType,
      normalizedPhone: headerPhone,
      accountKey: headerPhone ? `${headerPhone}:${headerAccountType}` : `guest:${headerAccountType}`,
      payload: {},
    };
  }
}

async function fetchProfileRowByIdentity({ userId = '', accountType = 'personal', normalizedPhone = '' } = {}) {
  if (normalizedPhone) {
    const rowsByIdentity = await supabaseFetch(`/profiles?normalized_phone=eq.${encodeURIComponent(normalizedPhone)}&account_type=eq.${encodeURIComponent(accountType)}&select=*&limit=1`).catch(() => []);
    if (rowsByIdentity?.[0]) return rowsByIdentity[0];
  }

  if (userId && userId !== 'guest') {
    const rowsById = await supabaseFetch(`/profiles?id=eq.${encodeURIComponent(userId)}&account_type=eq.${encodeURIComponent(accountType)}&select=*&limit=1`).catch(() => []);
    if (rowsById?.[0]) return rowsById[0];
  }

  return null;
}

function mergeProfilePayload(existing = {}, body = {}, context = {}) {
  const existingMetadata = parseJsonValue(existing.metadata, {});
  const bodyMetadata = body && typeof body === 'object' ? parseJsonValue(body.metadata, {}) : {};
  const nextProfileImage = firstDefined(
    body.profileImage,
    body.profile_image,
    body.avatarUrl,
    body.avatar_url,
    bodyMetadata.profileImage,
    bodyMetadata.avatarUrl,
    existing.profile_image,
    existing.avatar_url,
    existingMetadata.profileImage,
    existingMetadata.avatarUrl,
  ) || '';
  const nextName = cleanSellerName(
    firstDefined(body.name, body.fullName, body.displayName, body.businessName, existing.name, existing.display_name, existingMetadata.displayName, existingMetadata.fullName, DEFAULT_SELLER_NAME),
    DEFAULT_SELLER_NAME,
  );
  const nextPhone = normalizeProfilePhone(
    firstDefined(body.normalizedPhone, body.normalized_phone, body.mobile, body.phone, existing.normalized_phone, existing.phone, context.normalizedPhone, context.payload?.phone, context.payload?.mobile)
  );
  const nextAccountType = normalizeProfileAccountType(
    firstDefined(body.accountType, body.account_type, body.mode, existing.account_type, existing.mode, context.accountType)
  );
  const nextLocationData = firstDefined(body.locationData, body.profileLocation, body.profile_location, existing.profile_location, existingMetadata.locationData, existingMetadata.profileLocation) || {};
  const nextMetadata = {
    ...existingMetadata,
    ...(bodyMetadata && typeof bodyMetadata === 'object' ? bodyMetadata : {}),
    ...(body && typeof body === 'object' ? body : {}),
    accountType: nextAccountType,
    normalizedPhone: nextPhone,
    profileImage: nextProfileImage,
    avatarUrl: nextProfileImage,
    displayName: nextName,
    fullName: firstDefined(body.fullName, body.ownerName, existingMetadata.fullName, existingMetadata.ownerName, nextName),
    businessName: firstDefined(body.businessName, existingMetadata.businessName, existing.business_name, body.name, nextName),
  };

  return {
    id: String(existing.id || context.userId || '').trim() || context.userId || 'guest',
    account_key: context.accountKey,
    phone: nextPhone || existing.phone || '',
    mobile: nextPhone || existing.mobile || '',
    normalized_phone: nextPhone || existing.normalized_phone || '',
    account_type: nextAccountType,
    name: nextName,
    display_name: firstDefined(body.displayName, body.businessName, body.fullName, existing.display_name, nextName) || nextName,
    avatar_url: nextProfileImage,
    profile_image: nextProfileImage,
    profile_image_url: nextProfileImage,
    bio: firstDefined(body.bio, existing.bio, existingMetadata.bio) || '',
    full_name: firstDefined(body.fullName, body.ownerName, existing.full_name, existingMetadata.fullName, existingMetadata.ownerName) || '',
    business_name: firstDefined(body.businessName, existing.business_name, existingMetadata.businessName) || '',
    business_type: firstDefined(body.businessType, existing.business_type, existingMetadata.businessType) || '',
    email: firstDefined(body.email, existing.email, existingMetadata.email) || '',
    address: firstDefined(body.address, existing.address, existingMetadata.address) || '',
    city: firstDefined(body.city, body.locality, existing.city, existingMetadata.city, existingMetadata.locality) || '',
    description: firstDefined(body.description, existing.description, existingMetadata.description) || '',
    opening_hours: firstDefined(body.openingHours, body.opening_hours, existing.opening_hours, existingMetadata.openingHours) || '',
    store_location: firstDefined(body.storeLocation, body.store_location, existing.store_location, existingMetadata.storeLocation) || '',
    registration: firstDefined(body.registration, existing.registration, existingMetadata.registration) || '',
    cover_image_url: firstDefined(body.coverImage, body.cover_image_url, existing.cover_image_url, existingMetadata.coverImage) || '',
    verified: Boolean(firstDefined(body.verified, existing.verified, existingMetadata.verified, false)),
    karma_popup_enabled: firstDefined(body.karmaPopupEnabled, body.karma_popup_enabled, existing.karma_popup_enabled, existingMetadata.karmaPopupEnabled, true) !== false,
    notification_preferences: firstDefined(body.notificationPreferences, body.notification_preferences, existing.notification_preferences, existingMetadata.notificationPreferences) || {},
    location_link: firstDefined(body.locationLink, body.location_link, existing.location_link, existingMetadata.locationLink) || '',
    website_link: firstDefined(body.websiteLink, body.website_link, existing.website_link, existingMetadata.websiteLink) || '',
    instagram_link: firstDefined(body.instagramLink, body.instagram_link, existing.instagram_link, existingMetadata.instagramLink) || '',
    profile_location: nextLocationData,
    metadata: nextMetadata,
    updated_at: nowIso(),
  };
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
  const sellerAvatar = metadata.sellerAvatar || metadata.profileImage || metadata.avatarUrl || metadata.sellerLogo || metadata.logoUrl || '';
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
    status: status === 'active' || status === 'available' || status === 'live' || status === 'published' || status === 'listed' || status === 'open' ? 'Available' : status,
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
  'unavailable',
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
const HIDDEN_LISTING_STATUSES = new Set([
  'expired',
  'deleted',
  'removed',
  'hidden',
  'inactive',
  'cancelled',
  'canceled',
]);

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
  const expiryDate = String(
    row.expiry_date
    || metadata.expiryDate
    || metadata.validTill
    || ''
  ).trim();
  const expiryTime = String(
    row.expiry_time
    || metadata.expiryTime
    || ''
  ).trim();

  // Date-only values should remain requestable for the full day.
  if (expiryDate) {
    const normalizedDate = expiryDate.slice(0, 10);
    const normalizedTime = /^\d{2}:\d{2}/.test(expiryTime) ? expiryTime.slice(0, 5) : '23:59';
    const ms = Date.parse(`${normalizedDate}T${normalizedTime}:59`);
    if (Number.isFinite(ms)) return ms;
  }

  const expiry = row.expiry
    || row.expires_at
    || metadata.expiry
    || metadata.expiresAt;
  if (!expiry) return Infinity;
  const ms = Date.parse(expiry);
  return Number.isFinite(ms) ? ms : Infinity;
}

const ACTIVE_REQUEST_STATUSES = new Set(['pending', 'confirmed', 'accepted', 'awaiting_collection', 'handed_over', 'karma_pending']);

function logicalRequestStatus(row = {}) {
  const details = parseJsonValue(row.details, {});
  return String(details.orderStatus || details.status || row.status || 'pending').trim().toLowerCase();
}

function requestStatusPayload(status = '', extraDetails = {}) {
  const logicalStatus = String(status || '').trim().toLowerCase();
  if (logicalStatus === 'accepted' || logicalStatus === 'awaiting_collection') {
    return {
      rowStatus: 'confirmed',
      details: {
        ...extraDetails,
        orderStatus: 'awaiting_collection',
        status: 'awaiting_collection',
      },
    };
  }
  if (logicalStatus === 'karma_pending') {
    return {
      rowStatus: 'handed_over',
      details: {
        ...extraDetails,
        orderStatus: 'karma_pending',
        status: 'karma_pending',
      },
    };
  }
  if (logicalStatus === 'handed_over') {
    return {
      rowStatus: 'handed_over',
      details: {
        ...extraDetails,
        orderStatus: 'handed_over',
        status: 'handed_over',
      },
    };
  }
  return {
    rowStatus: ['pending', 'confirmed', 'declined', 'handed_over', 'collected', 'completed', 'cancelled'].includes(logicalStatus)
      ? logicalStatus
      : 'pending',
    details: {
      ...extraDetails,
      orderStatus: logicalStatus || 'pending',
      status: logicalStatus || 'pending',
    },
  };
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
  if (HIDDEN_LISTING_STATUSES.has(status)) return false;
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

function isSoldOutListingRow(row = {}) {
  const status = listingStatusValue(row);
  if (status.includes('sold') || status.includes('unavailable') || status.includes('completed')) return true;
  return listingAvailableQuantity(row) <= 0;
}

function listingDisplayPriority(row = {}) {
  if (isSoldOutListingRow(row)) return 2;
  return isBusinessListingRow(row) ? 0 : 1;
}

function sortPublicListingRows(a, b) {
  const aPriority = listingDisplayPriority(a);
  const bPriority = listingDisplayPriority(b);
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aRescue = rescuePriorityMs(a);
  const bRescue = rescuePriorityMs(b);
  if (Number.isFinite(aRescue) && Number.isFinite(bRescue) && aRescue !== bRescue) return aRescue - bRescue;

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
  return profile.profile_image
    || metadata.profileImage
    || profile.avatar_url
    || metadata.avatarUrl
    || profile.logo_url
    || metadata.logoUrl
    || '';
}

function profileKarma(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return Number(profile.karma_points ?? profile.karma ?? profile.store_karma ?? metadata.karma ?? metadata.storeKarma ?? 0) || 0;
}

function profileIdentity(profile = {}, fallbackName = DEFAULT_SELLER_NAME) {
  const metadata = parseJsonValue(profile.metadata, {});
  const name = cleanSellerName(
    profileDisplayName(profile),
    metadata.fullName,
    metadata.displayName,
    metadata.businessName,
    metadata.name,
    fallbackName,
  );
  const initials = String(
    profile.initials
      || metadata.initials
      || getInitialsFromName(name)
      || 'DU'
  ).trim().toUpperCase().slice(0, 2) || 'DU';
  return {
    id: String(profile.id || '').trim(),
    name,
    initials,
    avatarUrl: profileAvatar(profile),
    karma: profileKarma(profile),
    profile,
  };
}

async function fetchProfilesByAccountIds(accountIds = []) {
  const normalizedIds = [...new Set(
    accountIds
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
  if (!normalizedIds.length || !SUPABASE_URL || !SUPABASE_KEY) return new Map();
  const filter = normalizedIds.map((id) => encodeURIComponent(id)).join(',');
  const rows = await supabaseFetch(`/profiles?id=in.(${filter})&select=*`).catch(() => []);
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id || '').trim(), row]));
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
  const karma = profileKarma(profile || {})
    || Number(row.karma_score || 0)
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
    const nearbyPayload = buildNearbyDispatchPayload(row);
    if (nearbyPayload && isPublicListingRow(row)) {
      try {
        await dispatchNearbyListingNotifications(nearbyPayload);
      } catch (error) {
        console.warn('[nearby-listing] dispatch failed after listing save', {
          listingId: row?.id,
          error: error?.message || String(error),
        });
      }
    }
    return sendJson(res, 201, listingRowToClient(row));
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleListingById(req, res, listingId) {
  if (!listingId) return sendJson(res, 400, { error: 'Missing listing id' });

  if (req.method === 'GET' || req.method === 'HEAD') {
    const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
    const listing = rows?.[0];
    if (!listing || !isPublicListingRow(listing)) return sendJson(res, 404, { error: 'Listing not found' });
    const [enriched] = await attachListingProfiles([listing]);
    return sendJson(res, 200, listingRowToClient(enriched || listing));
  }

  if (req.method === 'PUT') {
    const body = await readRequestJson(req);
    const payload = listingPayloadToSupabase({ ...body, id: listingId });
    const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    const updatedRow = rows?.[0] || { ...payload, id: listingId };
    const nearbyPayload = buildNearbyDispatchPayload(updatedRow);
    if (nearbyPayload && isPublicListingRow(updatedRow)) {
      try {
        await dispatchNearbyListingNotifications(nearbyPayload);
      } catch (error) {
        console.warn('[nearby-listing] dispatch failed after listing update', {
          listingId,
          error: error?.message || String(error),
        });
      }
    }
    return sendJson(res, 200, listingRowToClient(updatedRow));
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

async function handleListingReserve(req, res, listingId) {
  if (!listingId) return sendJson(res, 400, { success: false, code: 'MISSING_LISTING_ID', message: 'Missing listing id' });
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });

  const body = await readRequestJson(req);
  const quantity = Math.max(1, Number(body.quantity || 1));
  const buyerAccountId = String(body.buyerAccountId || body.actorAccountId || getAuthUserId(req) || '').trim();
  const requestId = String(body.requestId || body.orderId || '').trim();

  console.info('[reserve] request', {
    listingId: String(listingId),
    buyerAccountId: buyerAccountId || 'anonymous',
    sellerAccountId: String(body.sellerAccountId || '').trim() || 'unknown',
    quantity,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return sendJson(res, 503, { success: false, code: 'PERSISTENCE_UNAVAILABLE', message: 'Supabase not configured' });
  }

  const rows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
  const listing = rows?.[0];
  if (!listing) {
    return sendJson(res, 404, { success: false, code: 'LISTING_NOT_FOUND', message: 'This item is no longer available.' });
  }

  const listingStatus = listingStatusValue(listing);
  const listingExpired = Number.isFinite(listingExpiryMs(listing)) && listingExpiryMs(listing) < Date.now();
  if (CLOSED_LISTING_STATUSES.has(listingStatus) || listingExpired) {
    return sendJson(res, 409, { success: false, code: 'LISTING_UNAVAILABLE', message: 'This item is no longer available.' });
  }

  const sellerAccountId = String(body.sellerAccountId || listing.seller_id || listing.business_id || '').trim();
  if (buyerAccountId && sellerAccountId && buyerAccountId === sellerAccountId) {
    return sendJson(res, 403, { success: false, code: 'SELF_REQUEST_NOT_ALLOWED', message: 'You cannot request your own listing.' });
  }

  if (buyerAccountId) {
    try {
      const activeStatuses = [...ACTIVE_REQUEST_STATUSES].map((status) => encodeURIComponent(status)).join(',');
      const activeRows = await supabaseFetch(
        `/requests?listing_id=eq.${encodeURIComponent(listingId)}&buyer_id=eq.${encodeURIComponent(buyerAccountId)}&status=in.(${activeStatuses})&select=*&order=created_at.desc&limit=1`
      );
      const existing = activeRows?.[0];
      if (existing) {
        const existingId = String(existing.id || '').trim();
        if (requestId && existingId && existingId === requestId) {
          return sendJson(res, 200, {
            success: true,
            code: 'REQUEST_ALREADY_CREATED',
            message: 'Request already created for this item.',
            listing: listingRowToClient(listing),
            request: requestRowToOrder(existing),
          });
        }
        return sendJson(res, 409, {
          success: false,
          code: 'DUPLICATE_ACTIVE_REQUEST',
          message: 'You already have an active request for this item.',
          request: requestRowToOrder(existing),
        });
      }
    } catch (error) {
      console.warn('[reserve] active request precheck skipped', {
        listingId: String(listingId),
        buyerAccountId,
        error: error?.message || String(error),
      });
    }
  }

  const available = listingAvailableQuantity(listing);
  if (!Number.isFinite(available) || available <= 0) {
    return sendJson(res, 409, { success: false, code: 'OUT_OF_STOCK', message: 'This item is no longer available.' });
  }
  if (quantity > available) {
    return sendJson(res, 409, { success: false, code: 'INSUFFICIENT_STOCK', message: 'Requested quantity exceeds available stock.' });
  }

  const currentReserved = Math.max(0, Number(listing.reserved_quantity || 0) || 0);
  const now = nowIso();
  const nextAvailable = Math.max(0, available - quantity);
  const nextReserved = currentReserved + quantity;

  const updatedRows = await supabaseFetch(
    `/listings?id=eq.${encodeURIComponent(listingId)}&available_quantity=eq.${available}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        available_quantity: nextAvailable,
        reserved_quantity: nextReserved,
        updated_at: now,
      }),
    }
  );

  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    console.warn('[reserve] race conflict', {
      listingId: String(listingId),
      buyerAccountId: buyerAccountId || 'anonymous',
      sellerAccountId: sellerAccountId || 'unknown',
      quantity,
    });
    return sendJson(res, 409, { success: false, code: 'RACE_CONFLICT', message: 'Sorry, this item has already been reserved by another user. Please explore other nearby products.' });
  }

  const updatedListing = updatedRows[0];
  let createdRequest = null;

  if (requestId && buyerAccountId && sellerAccountId) {
    const identityMap = await fetchProfilesByAccountIds([buyerAccountId, sellerAccountId]).catch(() => new Map());
    const buyerIdentity = profileIdentity(identityMap.get(String(buyerAccountId).trim()) || {}, String(body.buyerName || '').trim() || 'Buyer');
    const sellerIdentity = profileIdentity(identityMap.get(String(sellerAccountId).trim()) || {}, String(listing.seller_name || '').trim() || 'Seller');
    try {
      const requestPayload = {
        id: requestId,
        listing_id: String(listingId),
        buyer_id: buyerAccountId,
        seller_id: sellerAccountId,
        quantity,
        status: 'pending',
        details: {
          requestId,
          listingId: String(listingId),
          buyerAccountId,
          sellerAccountId,
          buyerName: buyerIdentity.name,
          buyerAvatar: buyerIdentity.avatarUrl || '',
          buyerProfileImage: buyerIdentity.avatarUrl || '',
          buyerPhone: String(body.buyerPhone || '').trim(),
          buyerLocation: String(body.buyerLocation || '').trim(),
          sellerName: sellerIdentity.name,
          sellerAvatar: sellerIdentity.avatarUrl || '',
          sellerProfileImage: sellerIdentity.avatarUrl || '',
          productName: String(listing.title || '').trim(),
          source: 'reserve-endpoint',
        },
      };
      const requestRows = await supabaseFetch('/requests?on_conflict=id&select=*', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(requestPayload),
      });
      createdRequest = requestRows?.[0] || null;
    } catch (requestError) {
      // Compensate stock reservation if canonical request creation fails.
      await supabaseFetch(
        `/listings?id=eq.${encodeURIComponent(listingId)}&available_quantity=eq.${Math.max(0, Number(updatedListing.available_quantity || 0))}&reserved_quantity=eq.${Math.max(0, Number(updatedListing.reserved_quantity || 0))}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            available_quantity: available,
            reserved_quantity: currentReserved,
            updated_at: nowIso(),
          }),
        }
      );
      return sendJson(res, 409, {
        success: false,
        code: 'REQUEST_PERSIST_CONFLICT',
        message: 'Could not create request record. Please try again.',
        details: requestError?.message || 'request-persist-failed',
      });
    }
  }

  console.info('[reserve] success', {
    listingId: String(listingId),
    buyerAccountId: buyerAccountId || 'anonymous',
    sellerAccountId: sellerAccountId || 'unknown',
    quantity,
  });
  if (createdRequest && sellerAccountId) {
    const requestDetails = parseJsonValue(createdRequest.details, {});
    await persistNotificationEvent({
      eventType: 'new_request',
      recipientAccountId: sellerAccountId,
      actorAccountId: buyerAccountId,
      listingId: String(listingId),
      requestId,
      title: '📦 New Collection Request',
      body: `${requestDetails.buyerName || 'A buyer'} wants to collect ${requestDetails.productName || listing.title || 'your item'} × ${quantity}.`,
      dedupeKey: `new_request:${requestId}`,
      payload: {
        buyerId: buyerAccountId,
        buyerName: requestDetails.buyerName || '',
        buyerAvatar: requestDetails.buyerAvatar || requestDetails.buyerProfileImage || '',
        buyerPhone: requestDetails.buyerPhone || '',
        buyerLocation: requestDetails.buyerLocation || '',
        sellerId: sellerAccountId,
        sellerName: requestDetails.sellerName || listing.seller_name || '',
        sellerAvatar: requestDetails.sellerAvatar || requestDetails.sellerProfileImage || '',
        productName: requestDetails.productName || listing.title || '',
        quantity,
      },
    });
  }
  return sendJson(res, 200, {
    success: true,
    listing: listingRowToClient(updatedListing),
    request: createdRequest ? requestRowToOrder(createdRequest) : null,
  });
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
  const context = getAuthProfileContext(req);
  const userId = context.userId;
  if (req.method === 'GET') {
    try {
      const profile = await fetchProfileRowByIdentity(context);
      return sendJson(res, 200, profile || {
        id: userId,
        account_type: context.accountType,
        normalized_phone: context.normalizedPhone,
        name: DEFAULT_SELLER_NAME,
      });
    } catch (error) {
      if (error.status === 404) {
        return sendJson(res, 200, {
          id: userId,
          account_type: context.accountType,
          normalized_phone: context.normalizedPhone,
          name: DEFAULT_SELLER_NAME,
        });
      }
      return sendJson(res, 500, { error: 'Profile lookup failed', message: error.message || 'Unknown error' });
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readRequestJson(req);
    const existingProfile = await fetchProfileRowByIdentity({
      userId,
      accountType: normalizeProfileAccountType(body.accountType || body.account_type || body.mode || context.accountType),
      normalizedPhone: normalizeProfilePhone(body.normalizedPhone || body.normalized_phone || body.mobile || body.phone || context.normalizedPhone),
    }).catch(() => null);
    const mergedProfile = mergeProfilePayload(existingProfile || {}, body, context);
    const payload = {
      ...mergedProfile,
      id: String(existingProfile?.id || userId).trim() || userId,
      account_type: mergedProfile.account_type || context.accountType,
      normalized_phone: mergedProfile.normalized_phone || context.normalizedPhone,
    };
    try {
      const rows = await supabaseFetch('/profiles?on_conflict=id&select=*', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      });
      const persistedProfile = rows?.[0];
      if (!persistedProfile) {
        return sendJson(res, 500, { error: 'Profile update failed', message: 'No profile row was returned after save.' });
      }
      return sendJson(res, 200, persistedProfile);
    } catch (error) {
      return sendJson(res, error.status || 500, { error: 'Profile update failed', message: error.message || 'Unknown error' });
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
  const buyerAvatar = details.buyerAvatar
    || details.buyerProfileImage
    || details.buyerAvatarUrl
    || details.buyer_profile_image
    || details.buyer_avatar
    || '';
  const sellerAvatar = details.sellerAvatar
    || details.sellerProfileImage
    || details.sellerAvatarUrl
    || details.seller_profile_image
    || details.seller_avatar
    || '';
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
    requestStatus: details.orderStatus || details.status || row.status,
    rawRequestStatus: row.status,
    quantity: Number(row.quantity || details.quantity || 1),
    buyerAvatar,
    buyerProfileImage: buyerAvatar,
    sellerAvatar,
    sellerProfileImage: sellerAvatar,
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

function makeStableId(prefix = 'evt', key = '') {
  const digest = createHash('sha1').update(String(key || '')).digest('hex').slice(0, 32);
  return `${prefix}-${digest}`;
}

function isSupabaseDuplicateKeyError(error) {
  const message = String(error?.message || error?.data?.message || error?.data?.error || '').toLowerCase();
  const code = String(error?.data?.code || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('already exists');
}

function toFiniteNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeAccountTypeValue(value = '') {
  const type = String(value || '').trim().toLowerCase();
  return type === 'business' || type === 'store' ? 'business' : 'personal';
}

function isPersonalAccountType(value = '') {
  return normalizeAccountTypeValue(value) === 'personal';
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

function getLocationFromProfileRow(profile = {}) {
  const locationData = parseJsonValue(profile.location_data || profile.locationData || profile.profile_location || profile.location, {});
  const metadata = parseJsonValue(profile.metadata, {});
  const metadataLocation = parseJsonValue(metadata.location || metadata.locationData || metadata.geo || metadata.profileLocation, {});
  const lat = toFiniteNumber(
    locationData.latitude
    ?? locationData.lat
    ?? metadataLocation.latitude
    ?? metadataLocation.lat
    ?? profile.latitude
    ?? profile.lat
  );
  const lng = toFiniteNumber(
    locationData.longitude
    ?? locationData.lng
    ?? metadataLocation.longitude
    ?? metadataLocation.lng
    ?? profile.longitude
    ?? profile.lng
  );
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function notificationOpenPath({ eventType = '', listingId = '', requestId = '', orderId = '' }) {
  const type = String(eventType || '').toLowerCase();
  if (type === 'new_request' || type === 'request_accepted' || type === 'request_declined' || type === 'karma_required' || type === 'karma_received') {
    return requestId ? `/request/${encodeURIComponent(requestId)}` : '/';
  }
  if (type === 'store_reservation_received' || type === 'reservation_confirmed') {
    return orderId ? `/business/orders?order=${encodeURIComponent(orderId)}` : '/business/orders';
  }
  if (listingId) return `/listing/${encodeURIComponent(listingId)}`;
  return '/';
}

function formatDistanceText(distanceKm = 0) {
  const value = Number(distanceKm || 0);
  if (!Number.isFinite(value) || value <= 0) return 'nearby';
  if (value < 1) return `${Math.max(1, Math.round(value * 1000))} m`;
  return `${value.toFixed(1)} km`;
}

function formatExpiryTextFromListing(listing = {}) {
  const expiryDate = safeDate(listing.expiry_date || listing.expiryDate || listing.validTill || '');
  const expiryTime = String(listing.expiry_time || listing.expiryTime || '').trim();
  if (!expiryDate) return 'soon';
  const today = new Date().toISOString().slice(0, 10);
  if (expiryDate === today) {
    return expiryTime ? `today at ${expiryTime}` : 'today';
  }
  return expiryTime ? `at ${expiryTime}` : `on ${expiryDate}`;
}

function buildNearbyDispatchPayload(listingRow = {}) {
  const listing = listingRowToClient(listingRow);
  const coordinates = listing.coordinates || listing.locationData || {};
  const latitude = toFiniteNumber(listing.latitude ?? coordinates.latitude ?? coordinates.lat);
  const longitude = toFiniteNumber(listing.longitude ?? coordinates.longitude ?? coordinates.lng);
  if (!listing.id || latitude === null || longitude === null) return null;
  return {
    ownerId: String(listing.sellerId || listing.businessId || listingRow.seller_id || listingRow.business_id || '').trim(),
    listingId: String(listing.id),
    title: listing.title || '',
    category: listing.category || '',
    area: listing.area || listing.locationData?.area || '',
    city: listing.city || listing.locationData?.city || '',
    latitude,
    longitude,
  };
}

async function dispatchNearbyListingNotifications(payload = {}) {
  const ownerId = String(payload.ownerId || '').trim();
  const listingId = String(payload.listingId || '').trim();
  const lat = toFiniteNumber(payload.latitude);
  const lng = toFiniteNumber(payload.longitude);
  if (!ownerId || !listingId || lat === null || lng === null || !SUPABASE_URL || !SUPABASE_KEY) {
    return { success: true, persisted: false, notifiedCount: 0 };
  }

  const radiusKm = Math.max(1, Number(payload.radiusKm || 5) || 5);
  const listingRows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
  const listing = listingRows?.[0];
  if (!listing || !isPublicListingRow(listing)) {
    return { success: true, persisted: true, notifiedCount: 0, skipped: 'listing-unavailable' };
  }

  let tokenRows = [];
  try {
    tokenRows = await supabaseFetch('/notification_devices?enabled=eq.true&select=account_id,token,metadata');
  } catch {
    try {
      tokenRows = await supabaseFetch('/push_tokens?enabled=eq.true&select=account_id,token,metadata');
    } catch {
      tokenRows = [];
    }
  }

  let preferenceRows = [];
  try {
    preferenceRows = await supabaseFetch('/notification_preferences?select=account_id,nearby_enabled,muted_account_ids,blocked_account_ids,max_nearby_per_day');
  } catch {
    preferenceRows = [];
  }
  const preferenceByAccount = new Map((preferenceRows || []).map((row) => [String(row.account_id || ''), row]));

  const tokenCountsByAccount = new Map();
  (tokenRows || []).forEach((row) => {
    const accountId = String(row.account_id || '').trim();
    if (!accountId) return;
    tokenCountsByAccount.set(accountId, (tokenCountsByAccount.get(accountId) || 0) + 1);
  });

  const diagnostics = {
    candidateUsers: 0,
    usersWithinRadius: 0,
    eligibleDevices: 0,
    preferenceSkips: 0,
    businessRecipientSkips: 0,
    invalidLocationSkips: 0,
    dedupeSkips: 0,
    sendsSucceeded: 0,
    sendsFailed: 0,
  };

  const profileRows = await supabaseFetch('/profiles?select=*');
  const profileByAccountId = new Map((profileRows || []).map((profile) => [String(profile.id || '').trim(), profile]));

  const isPersonalRecipient = (accountId) => {
    const profile = profileByAccountId.get(String(accountId || '').trim()) || {};
    const metadata = parseJsonValue(profile.metadata, {});
    const accountType = profile.account_type || profile.mode || metadata.accountType || metadata.mode || '';
    return isPersonalAccountType(accountType);
  };

  const isBlockedByPreference = (accountId) => {
    const pref = preferenceByAccount.get(String(accountId)) || {};
    if (pref.nearby_enabled === false) return true;
    const muted = Array.isArray(pref.muted_account_ids) ? pref.muted_account_ids.map((entry) => String(entry)) : [];
    const blocked = Array.isArray(pref.blocked_account_ids) ? pref.blocked_account_ids.map((entry) => String(entry)) : [];
    return muted.includes(ownerId) || blocked.includes(ownerId);
  };

  const recipientByAccount = new Map();
  const trackRecipient = (accountId, coordinates) => {
    if (!accountId || accountId === ownerId) return;
    if (!isPersonalRecipient(accountId)) {
      diagnostics.businessRecipientSkips += 1;
      return;
    }
    if (isBlockedByPreference(accountId)) {
      diagnostics.preferenceSkips += 1;
      return;
    }
    if (!coordinates) {
      diagnostics.invalidLocationSkips += 1;
      return;
    }
    const distanceKm = haversineKm({ lat, lng }, coordinates);
    if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return;
    const existing = recipientByAccount.get(accountId);
    if (!existing || distanceKm < existing.distanceKm) {
      recipientByAccount.set(accountId, { accountId, distanceKm });
    }
  };

  (tokenRows || []).forEach((row) => {
    const accountId = String(row.account_id || '').trim();
    trackRecipient(accountId, getLocationFromTokenMetadata(parseJsonValue(row.metadata, {})));
  });

  (profileRows || []).forEach((profile) => {
    const accountId = String(profile.id || '').trim();
    trackRecipient(accountId, getLocationFromProfileRow(profile));
  });

  const recipients = [...recipientByAccount.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  diagnostics.candidateUsers = recipients.length;
  diagnostics.usersWithinRadius = recipients.length;
  diagnostics.eligibleDevices = recipients.reduce((sum, recipient) => sum + Number(tokenCountsByAccount.get(recipient.accountId) || 0), 0);

  const baseListing = listingRowToClient(listing);
  const productName = String(baseListing.title || payload.title || 'item');
  const sellerLabel = String(baseListing.isBusinessProduct ? (baseListing.storeName || baseListing.sellerName || 'A store') : (baseListing.sellerName || 'Someone'));
  const expiryText = formatExpiryTextFromListing(listing);
  const action = baseListing.isBusinessProduct ? 'reserve' : 'request';
  const today = new Date().toISOString().slice(0, 10);
  let notifiedCount = 0;

  for (const recipient of recipients) {
    const distanceText = formatDistanceText(recipient.distanceKm);
    const bodyText = baseListing.isBusinessProduct
      ? `${sellerLabel} listed "${productName}" ${distanceText} away. Expires ${expiryText}. Want to reserve it now?`
      : `${sellerLabel} listed "${productName}" ${distanceText} away. Expires ${expiryText}. Want to claim it now?`;
    const result = await persistNotificationEvent({
      eventType: 'nearby_listing',
      recipientAccountId: recipient.accountId,
      actorAccountId: ownerId,
      listingId,
      title: 'New free item near you',
      body: bodyText,
      dedupeKey: `nearby_listing:${listingId}:${recipient.accountId}:${today}`,
      payload: {
        category: String(payload.category || ''),
        distanceKm: Number(recipient.distanceKm.toFixed(2)),
        area: String(payload.area || ''),
        city: String(payload.city || ''),
        listingId,
        recipientAccountType: 'personal',
        actorAccountType: normalizeAccountTypeValue(payload.actorAccountType || payload.ownerAccountType || ''),
        sellerId: String(baseListing.sellerId || baseListing.businessId || ownerId),
        sellerName: sellerLabel,
        productName,
        expiryText,
        action,
        openPath: `/listing/${encodeURIComponent(listingId)}?action=${action}`,
      },
    });
    if (result.accepted && !result.deduped) {
      notifiedCount += 1;
      diagnostics.sendsSucceeded += Number(result.push?.successCount || (result.push?.sent ? 1 : 0));
      diagnostics.sendsFailed += Number(result.push?.failureCount || 0);
    } else if (result.deduped) {
      diagnostics.dedupeSkips += 1;
    } else {
      diagnostics.sendsFailed += 1;
    }
  }

  console.info('[nearby-listing] dispatch summary', {
    listingId,
    ownerId,
    radiusKm,
    ...diagnostics,
    notifiedCount,
  });

  return {
    success: true,
    persisted: true,
    candidates: recipients.length,
    notifiedCount,
    diagnostics,
  };
}

async function getPendingKarmaActionByRequestId(requestId) {
  const rows = await supabaseFetch(`/pending_karma_actions?request_id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`);
  return rows?.[0] || null;
}

function mergeRequestDetails(row = {}, nextDetails = {}) {
  const current = parseJsonValue(row.details, {});
  return {
    ...current,
    ...nextDetails,
  };
}

async function updateRequestLifecycleRow(row = {}, logicalStatus, detailPatch = {}) {
  const mergedDetails = mergeRequestDetails(row, detailPatch);
  const statusPayload = requestStatusPayload(logicalStatus, mergedDetails);
  const rows = await supabaseFetch(`/requests?id=eq.${encodeURIComponent(row.id)}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: statusPayload.rowStatus,
      details: statusPayload.details,
      updated_at: nowIso(),
    }),
  });
  return rows?.[0] || null;
}

async function handlePendingKarma(req, res, accountId) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!accountId) return sendJson(res, 400, { error: 'Missing account id' });
  const rows = await supabaseFetch(`/pending_karma_actions?buyer_account_id=eq.${encodeURIComponent(accountId)}&status=eq.pending&select=*&order=created_at.desc`);
  return sendJson(res, 200, rows || []);
}

async function handleRequestHandover(req, res, requestId) {
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  const body = await readRequestJson(req);
  const authAccountId = String(getAuthUserId(req) || '').trim();
  const actorAccountId = authAccountId && authAccountId !== 'guest'
    ? authAccountId
    : String(body.actorAccountId || '').trim();
  if (!requestId || !actorAccountId) {
    return sendJson(res, 400, { success: false, code: 'MISSING_FIELDS', message: 'requestId and actorAccountId are required' });
  }

  const requestRows = await supabaseFetch(`/requests?id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`);
  const requestRow = requestRows?.[0];
  if (!requestRow) return sendJson(res, 404, { success: false, code: 'REQUEST_NOT_FOUND', message: 'Request not found.' });

  const listingRows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(requestRow.listing_id)}&select=*&limit=1`);
  const listingRow = listingRows?.[0];
  const listingOwnerId = String(listingRow?.seller_id || listingRow?.business_id || requestRow.seller_id || '').trim();
  if (!listingOwnerId || listingOwnerId !== actorAccountId) {
    return sendJson(res, 403, { success: false, code: 'HANDOVER_FORBIDDEN', message: 'Only the seller or store can mark handover.' });
  }

  const currentLogicalStatus = logicalRequestStatus(requestRow);
  if (currentLogicalStatus === 'completed') {
    const pendingAction = await getPendingKarmaActionByRequestId(requestId).catch(() => null);
    return sendJson(res, 200, {
      success: true,
      code: 'HANDOVER_ALREADY_COMPLETED',
      request: requestRowToOrder(requestRow),
      pendingAction,
    });
  }
  if (currentLogicalStatus === 'karma_pending' || currentLogicalStatus === 'handed_over') {
    const pendingAction = await getPendingKarmaActionByRequestId(requestId).catch(() => null);
    return sendJson(res, 200, {
      success: true,
      code: 'HANDOVER_ALREADY_RECORDED',
      request: requestRowToOrder(requestRow),
      pendingAction,
    });
  }
  if (!['accepted', 'awaiting_collection', 'confirmed', 'pending'].includes(currentLogicalStatus)) {
    return sendJson(res, 409, { success: false, code: 'INVALID_REQUEST_STATUS', message: 'This request is not ready for handover.' });
  }

  const updatedRequestRow = await updateRequestLifecycleRow(requestRow, 'karma_pending', {
    handedOverAt: nowIso(),
    sellerGave: true,
  });

  const identityMap = await fetchProfilesByAccountIds([requestRow.seller_id, requestRow.buyer_id]).catch(() => new Map());
  const sellerIdentity = profileIdentity(identityMap.get(String(requestRow.seller_id || '').trim()) || {}, listingRowToClient(listingRow || {}).sellerName || 'Seller');
  const buyerIdentity = profileIdentity(identityMap.get(String(requestRow.buyer_id || '').trim()) || {}, 'Buyer');

  const pendingActionId = `karma:${requestId}`;
  const actionPayload = {
    id: pendingActionId,
    request_id: requestId,
    listing_id: requestRow.listing_id,
    buyer_account_id: requestRow.buyer_id,
    seller_account_id: requestRow.seller_id,
    status: 'pending',
    payload: {
      productName: parseJsonValue(updatedRequestRow?.details, {}).productName || listingRow?.title || 'your item',
      sellerName: sellerIdentity.name,
      sellerAvatar: sellerIdentity.avatarUrl || '',
      buyerName: buyerIdentity.name,
      buyerAvatar: buyerIdentity.avatarUrl || '',
      pickupAddress: parseJsonValue(updatedRequestRow?.details, {}).pickupAddress || listingRowToClient(listingRow || {}).location || '',
      collectionDate: parseJsonValue(updatedRequestRow?.details, {}).collectionDate || '',
      collectionTime: parseJsonValue(updatedRequestRow?.details, {}).collectionTime || '',
      quantity: Number(requestRow.quantity || 1),
    },
    created_at: nowIso(),
  };

  const pendingRows = await supabaseFetch('/pending_karma_actions?on_conflict=id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(actionPayload),
  });
  const pendingAction = pendingRows?.[0] || actionPayload;

  const buyerNotification = await persistNotificationEvent({
    eventType: 'karma_required',
    recipientAccountId: requestRow.buyer_id,
    actorAccountId,
    requestId,
    listingId: requestRow.listing_id,
    title: 'Good Karma required',
    body: `Collection complete for ${actionPayload.payload.productName || 'your item'}. Please send Good Karma to the seller.`,
    dedupeKey: `karma_required:${requestId}`,
    payload: {
      buyerId: requestRow.buyer_id,
      buyerName: buyerIdentity.name,
      buyerAvatar: actionPayload.payload.buyerAvatar,
      sellerId: requestRow.seller_id,
      sellerName: actionPayload.payload.sellerName,
      sellerAvatar: actionPayload.payload.sellerAvatar,
      productName: actionPayload.payload.productName,
      pickupAddress: actionPayload.payload.pickupAddress,
      collectionDate: actionPayload.payload.collectionDate,
      collectionTime: actionPayload.payload.collectionTime,
      quantity: actionPayload.payload.quantity,
    },
  });

  return sendJson(res, 200, {
    success: true,
    request: requestRowToOrder(updatedRequestRow || requestRow),
    pendingAction,
    notification: buyerNotification,
  });
}

async function computeCanonicalKarmaForSeller(sellerId) {
  const rows = await supabaseFetch(`/karma_events?receiver_id=eq.${encodeURIComponent(sellerId)}&select=points`).catch(() => []);
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + (Number(row.points || 0) || 0), 0);
}

async function syncCanonicalKarmaReadModels(sellerId, canonicalKarma, options = {}) {
  const normalizedKarma = Math.max(0, Number(canonicalKarma || 0));
  const now = nowIso();
  const listingId = String(options.listingId || '').trim();

  // Canonical source for public karma visibility.
  try {
    await supabaseFetch(`/profiles?id=eq.${encodeURIComponent(sellerId)}&select=id`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        karma: normalizedKarma,
        updated_at: now,
      }),
    });
  } catch {
    // Keep compatibility for tenants where profiles can be lazily created.
    await supabaseFetch('/profiles?on_conflict=id&select=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: sellerId,
        name: DEFAULT_SELLER_NAME,
        karma: normalizedKarma,
        updated_at: now,
      }),
    }).catch(() => null);
  }

  const sellerListings = await supabaseFetch(
    `/listings?or=(seller_id.eq.${encodeURIComponent(sellerId)},business_id.eq.${encodeURIComponent(sellerId)})&select=id,metadata`
  ).catch(() => []);
  const requestListing = listingId
    ? await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=id,metadata`).catch(() => [])
    : [];
  const listingMap = new Map();
  [...(sellerListings || []), ...(requestListing || [])].forEach((row) => {
    if (!row?.id) return;
    listingMap.set(String(row.id), row);
  });

  for (const row of listingMap.values()) {
    const metadata = parseJsonValue(row.metadata, {});
    const sellerProfile = parseJsonValue(metadata.sellerProfile, {});
    const nextMetadata = {
      ...metadata,
      karma: normalizedKarma,
      storeKarma: normalizedKarma,
      sellerKarma: normalizedKarma,
      sellerProfile: {
        ...sellerProfile,
        karma: normalizedKarma,
      },
    };
    await supabaseFetch(`/listings?id=eq.${encodeURIComponent(row.id)}&select=id`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        karma_score: normalizedKarma,
        metadata: nextMetadata,
        updated_at: now,
      }),
    }).catch(() => null);
  }

  const listingIds = [...listingMap.keys()];
  if (!listingIds.length) {
    return { karma: normalizedKarma, listings: [] };
  }

  const listingFilter = listingIds.map((id) => encodeURIComponent(id)).join(',');
  const refreshedRows = await supabaseFetch(`/listings?id=in.(${listingFilter})&select=*`).catch(() => []);
  const enrichedRows = await attachListingProfiles(Array.isArray(refreshedRows) ? refreshedRows : []).catch(() => refreshedRows || []);

  return {
    karma: normalizedKarma,
    listings: (Array.isArray(enrichedRows) ? enrichedRows : []).map((row) => listingRowToClient(row)),
  };
}

async function handleCommunityKarma(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const body = await readRequestJson(req);
  const authAccountId = String(getAuthUserId(req) || '').trim();
  const buyerAccountId = authAccountId && authAccountId !== 'guest'
    ? authAccountId
    : String(body.buyerId || body.actorAccountId || '').trim();
  const requestId = String(body.requestId || '').trim();
  if (!buyerAccountId || !requestId) {
    return sendJson(res, 400, { success: false, code: 'MISSING_FIELDS', message: 'buyerId and requestId are required.' });
  }

  const pendingRows = await supabaseFetch(`/pending_karma_actions?request_id=eq.${encodeURIComponent(requestId)}&buyer_account_id=eq.${encodeURIComponent(buyerAccountId)}&select=*&limit=1`);
  const pendingAction = pendingRows?.[0];
  if (!pendingAction) {
    return sendJson(res, 404, { success: false, code: 'PENDING_KARMA_NOT_FOUND', message: 'No pending Good Karma action was found.' });
  }

  const requestRows = await supabaseFetch(`/requests?id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`);
  const requestRow = requestRows?.[0];
  if (!requestRow) {
    return sendJson(res, 404, { success: false, code: 'REQUEST_NOT_FOUND', message: 'Request not found.' });
  }
  if (String(requestRow.buyer_id || '') !== buyerAccountId) {
    return sendJson(res, 403, { success: false, code: 'KARMA_FORBIDDEN', message: 'Only the receiving buyer can submit Good Karma.' });
  }
  const logicalStatus = logicalRequestStatus(requestRow);
  if (String(pendingAction.status || '') === 'completed' || logicalStatus === 'completed') {
    const sellerId = String(requestRow.seller_id || pendingAction.seller_account_id || '').trim();
    const canonicalKarma = sellerId ? await computeCanonicalKarmaForSeller(sellerId) : 0;
    const syncResult = sellerId
      ? await syncCanonicalKarmaReadModels(sellerId, canonicalKarma, { listingId: requestRow.listing_id }).catch(() => ({ karma: canonicalKarma, listings: [] }))
      : { karma: canonicalKarma, listings: [] };
    return sendJson(res, 200, {
      success: true,
      code: 'KARMA_ALREADY_SUBMITTED',
      sellerId,
      karma: Number(syncResult.karma ?? canonicalKarma) || 0,
      request: requestRowToOrder(requestRow),
      listings: Array.isArray(syncResult.listings) ? syncResult.listings : [],
    });
  }
  if (!['karma_pending', 'handed_over'].includes(logicalStatus)) {
    return sendJson(res, 409, { success: false, code: 'HANDOVER_NOT_CONFIRMED', message: 'Good Karma is only available after handover.' });
  }
  if (String(requestRow.seller_id || '') === buyerAccountId) {
    return sendJson(res, 403, { success: false, code: 'SELF_KARMA_NOT_ALLOWED', message: 'You cannot award Good Karma to yourself.' });
  }

  const sellerId = String(requestRow.seller_id || pendingAction.seller_account_id || '').trim();
  if (!sellerId) {
    return sendJson(res, 400, { success: false, code: 'MISSING_SELLER_ID', message: 'Seller account missing for this request.' });
  }

  const eventId = makeStableId('karma', `karma_submit:${requestId}`);
  let insertedEvent = false;
  try {
    await supabaseFetch('/karma_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: eventId,
        giver_id: buyerAccountId,
        receiver_id: sellerId,
        listing_id: requestRow.listing_id || null,
        request_id: requestId,
        points: 1,
        note: String(body.note || '').trim() || null,
        created_at: nowIso(),
      }),
    });
    insertedEvent = true;
  } catch (error) {
    if (!isSupabaseDuplicateKeyError(error)) {
      return sendJson(res, 500, { success: false, code: 'KARMA_EVENT_WRITE_FAILED', message: error.message || 'Could not save karma event.' });
    }
  }

  const canonicalKarma = await computeCanonicalKarmaForSeller(sellerId);
  const syncResult = await syncCanonicalKarmaReadModels(sellerId, canonicalKarma, { listingId: requestRow.listing_id });
  const nextKarma = Number(syncResult?.karma ?? canonicalKarma) || 0;
  const updatedListings = Array.isArray(syncResult?.listings) ? syncResult.listings : [];

  await supabaseFetch(`/pending_karma_actions?id=eq.${encodeURIComponent(pendingAction.id)}&status=eq.pending&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'completed',
      completed_at: nowIso(),
    }),
  });

  const completedRequest = await updateRequestLifecycleRow(requestRow, 'completed', {
    karmaSubmittedAt: nowIso(),
    karmaGiven: true,
  });

  const profileMap = await fetchProfilesByAccountIds([buyerAccountId, sellerId]).catch(() => new Map());
  const buyerIdentity = profileIdentity(profileMap.get(String(buyerAccountId).trim()) || {}, body.buyerName || 'Buyer');
  const sellerIdentity = profileIdentity(profileMap.get(String(sellerId).trim()) || {}, parseJsonValue(requestRow.details, {}).sellerName || 'Seller');

  const sellerNotification = await persistNotificationEvent({
    eventType: 'karma_received',
    recipientAccountId: sellerId,
    actorAccountId: buyerAccountId,
    requestId,
    listingId: requestRow.listing_id,
    title: 'You received Good Karma',
    body: `${buyerIdentity.name} sent you Good Karma.`,
    dedupeKey: `karma_received:${requestId}`,
    payload: {
      buyerId: buyerAccountId,
      buyerName: buyerIdentity.name,
      buyerAvatar: buyerIdentity.avatarUrl || '',
      sellerId,
      sellerName: sellerIdentity.name,
      sellerAvatar: sellerIdentity.avatarUrl || '',
      productName: parseJsonValue(requestRow.details, {}).productName || '',
      karma: nextKarma,
    },
  });

  return sendJson(res, 200, {
    success: true,
    code: insertedEvent ? 'KARMA_SUBMITTED' : 'KARMA_ALREADY_SUBMITTED',
    sellerId,
    karma: nextKarma,
    request: requestRowToOrder(completedRequest || requestRow),
    listings: updatedListings,
    notification: sellerNotification,
  });
}

function getFirebaseCredential() {
  const cleanSecret = (value = '') => String(value || '').trim().replace(/^['\"]|['\"]$/g, '');

  const serviceAccountBase64 = cleanSecret(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  if (serviceAccountBase64) {
    try {
      const decoded = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
      return cert(JSON.parse(decoded));
    } catch {
      console.warn('[fcm] invalid FIREBASE_SERVICE_ACCOUNT_BASE64');
    }
  }

  const serviceAccountJson = cleanSecret(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (serviceAccountJson) {
    try {
      return cert(JSON.parse(serviceAccountJson));
    } catch {
      console.warn('[fcm] invalid FIREBASE_SERVICE_ACCOUNT_JSON');
    }
  }

  const projectId = cleanSecret(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = cleanSecret(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = cleanSecret(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  try {
    return cert({ projectId, clientEmail, privateKey });
  } catch {
    return null;
  }
}

function ensureFirebaseAdmin() {
  const existingApps = getFirebaseApps();
  if (existingApps.length > 0) return true;
  const credential = getFirebaseCredential();
  if (!credential) return false;
  try {
    initializeFirebaseApp({ credential });
    return true;
  } catch (error) {
    console.warn('[fcm] init failed', error?.message || error);
    return false;
  }
}

async function getPushTokensForAccount(accountId) {
  try {
    const rows = await supabaseFetch(`/notification_devices?enabled=eq.true&account_id=eq.${encodeURIComponent(accountId)}&select=token&order=last_seen_at.desc`);
    return (rows || []).map((row) => String(row.token || '')).filter(Boolean);
  } catch {
    try {
      const rows = await supabaseFetch(`/push_tokens?enabled=eq.true&account_id=eq.${encodeURIComponent(accountId)}&select=token&order=last_seen_at.desc`);
      return (rows || []).map((row) => String(row.token || '')).filter(Boolean);
    } catch {
      return [];
    }
  }
}

async function markInvalidTokens(tokens = []) {
  if (!tokens.length) return;
  try {
    await supabaseFetch(`/notification_devices?token=in.(${tokens.map((token) => encodeURIComponent(token)).join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false, invalidated_at: nowIso(), updated_at: nowIso() }),
    });
  } catch {
    await supabaseFetch(`/push_tokens?token=in.(${tokens.map((token) => encodeURIComponent(token)).join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false, invalidated_at: nowIso(), updated_at: nowIso() }),
    });
  }
}

async function sendPushToAccount({ recipientAccountId, eventType, title, body, data = {} }) {
  if (!ensureFirebaseAdmin()) return { attempted: false, sent: false, reason: 'fcm-not-configured' };
  const rawTokens = await getPushTokensForAccount(String(recipientAccountId));
  const tokens = Array.isArray(rawTokens) ? rawTokens.filter(Boolean) : [];
  if (!tokens.length) return { attempted: false, sent: false, reason: 'no-tokens' };

  const message = {
    tokens,
    notification: {
      title: String(title || 'Drizn update'),
      body: String(body || 'You have a new update.'),
    },
    data: Object.fromEntries(Object.entries({ ...data, eventType }).map(([key, value]) => [key, String(value ?? '')])),
    webpush: {
      fcmOptions: {
        link: data?.openPath ? `https://drizn.com${data.openPath}` : 'https://drizn.com/',
      },
    },
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    const invalidTokens = [];
    response.responses.forEach((entry, index) => {
      if (entry.success) return;
      const code = String(entry.error?.code || '');
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        invalidTokens.push(tokens[index]);
      }
    });
    if (invalidTokens.length) await markInvalidTokens(invalidTokens);
    return {
      attempted: true,
      sent: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    return { attempted: true, sent: false, reason: error?.message || 'push-send-failed' };
  }
}

async function persistNotificationEvent(payload = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { success: true, persisted: false, push: { attempted: false, sent: false } };
  }

  const {
    eventType,
    recipientAccountId,
    recipientAccountType = 'personal',
    actorAccountId = '',
    actorAccountType = '',
    listingId = '',
    requestId = '',
    orderId = '',
    title = 'Drizn update',
    body = '',
    dedupeKey = '',
    payload: metadataPayload = {},
  } = payload;

  const eventId = dedupeKey ? makeStableId('evt', dedupeKey) : makeId('evt');
  const computedOpenPath = notificationOpenPath({ eventType, listingId, requestId, orderId });
  const openPath = typeof metadataPayload?.openPath === 'string' && metadataPayload.openPath.startsWith('/')
    ? metadataPayload.openPath
    : computedOpenPath;

  const isMissingTableError = (error) => /could not find the table/i.test(String(error?.message || ''));

  const profileMap = await fetchProfilesByAccountIds([
    recipientAccountId,
    actorAccountId,
    metadataPayload?.buyerId,
    metadataPayload?.sellerId,
  ]).catch(() => new Map());
  const actorIdentity = profileIdentity(profileMap.get(String(actorAccountId || '').trim()) || {}, 'Drizn user');
  const recipientIdentity = profileIdentity(profileMap.get(String(recipientAccountId || '').trim()) || {}, 'Drizn user');
  const buyerIdentity = profileIdentity(profileMap.get(String(metadataPayload?.buyerId || '').trim()) || {}, metadataPayload?.buyerName || 'Buyer');
  const sellerIdentity = profileIdentity(profileMap.get(String(metadataPayload?.sellerId || '').trim()) || {}, metadataPayload?.sellerName || 'Seller');

  const mergedPayload = {
    ...(metadataPayload || {}),
    recipientAccountType: normalizeAccountTypeValue(metadataPayload?.recipientAccountType || recipientAccountType || 'personal'),
    actorAccountType: normalizeAccountTypeValue(metadataPayload?.actorAccountType || actorAccountType || ''),
    dedupeKey: dedupeKey || metadataPayload?.dedupeKey || '',
    openPath,
    actorName: isPlaceholderName(metadataPayload?.actorName) ? actorIdentity.name : metadataPayload?.actorName,
    recipientName: isPlaceholderName(metadataPayload?.recipientName) ? recipientIdentity.name : metadataPayload?.recipientName,
    buyerName: isPlaceholderName(metadataPayload?.buyerName) ? buyerIdentity.name : metadataPayload?.buyerName,
    sellerName: isPlaceholderName(metadataPayload?.sellerName) ? sellerIdentity.name : metadataPayload?.sellerName,
    actorAvatar: metadataPayload?.actorAvatar || actorIdentity.avatarUrl || '',
    recipientAvatar: metadataPayload?.recipientAvatar || recipientIdentity.avatarUrl || '',
    buyerAvatar: metadataPayload?.buyerAvatar || buyerIdentity.avatarUrl || '',
    sellerAvatar: metadataPayload?.sellerAvatar || sellerIdentity.avatarUrl || '',
  };

  const insertAppNotification = async () => {
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
    };
  };

  const insertLegacyNotification = async () => {
    await supabaseFetch('/notifications', {
      method: 'POST',
      body: JSON.stringify({
        text: `${String(title || 'Drizn update')}\n${String(body || '')}`.trim(),
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
      compatibilityMode: 'legacy_notifications',
    };
  };

  try {
    if (dedupeKey) {
      try {
        const existing = await supabaseFetch(`/notification_events?select=id&dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`);
        if (Array.isArray(existing) && existing.length > 0) {
          return {
            success: true,
            accepted: true,
            deduped: true,
            persisted: true,
            id: String(existing[0].id || eventId),
            openPath,
            push: { attempted: false, sent: false },
          };
        }
      } catch (error) {
        if (!isMissingTableError(error)) throw error;
      }
    }

    try {
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
          created_at: nowIso(),
        }),
      });
    } catch (error) {
      if (dedupeKey && isSupabaseDuplicateKeyError(error)) {
        const existing = await supabaseFetch(`/notification_events?select=id&dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`).catch(() => []);
        return {
          success: true,
          accepted: true,
          deduped: true,
          persisted: true,
          id: String(existing?.[0]?.id || eventId),
          openPath,
          push: { attempted: false, sent: false },
        };
      }
      if (!isMissingTableError(error)) throw error;
    }

    let persistedResult = null;
    try {
      persistedResult = await insertAppNotification();
    } catch (error) {
      if (dedupeKey && isSupabaseDuplicateKeyError(error)) {
        return {
          success: true,
          accepted: true,
          deduped: true,
          persisted: true,
          id: eventId,
          openPath,
          push: { attempted: false, sent: false },
        };
      }
      if (!isMissingTableError(error)) throw error;
    }

    if (!persistedResult) {
      persistedResult = await insertLegacyNotification();
    }

    let push = { attempted: false, sent: false, reason: 'push-skipped' };
    try {
      push = await sendPushToAccount({
        recipientAccountId,
        eventType,
        title,
        body,
        data: {
          eventId,
          eventType,
          listingId,
          requestId,
          orderId,
          recipientAccountType: normalizeAccountTypeValue(mergedPayload.recipientAccountType || 'personal'),
          actorAccountType: normalizeAccountTypeValue(mergedPayload.actorAccountType || ''),
          openPath,
        },
      });
    } catch (pushError) {
      push = { attempted: false, sent: false, reason: pushError?.message || 'push-send-failed' };
    }

    try {
      await supabaseFetch(`/notification_events?id=eq.${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          push_attempted: Boolean(push.attempted),
          push_sent: Boolean(push.sent),
        }),
      });
    } catch {
      // Non-blocking update for optional columns in mixed schema states.
    }

    return {
      ...persistedResult,
      push,
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
      const payload = {
        account_id: accountId,
        token,
        platform: String(body.platform || 'web'),
        enabled: body.enabled !== false,
        metadata: body.metadata || {},
        last_seen_at: nowIso(),
        updated_at: nowIso(),
      };
      try {
        await supabaseFetch('/notification_devices?on_conflict=token&select=token', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(payload),
        });
      } catch {
        await supabaseFetch('/push_tokens?on_conflict=token&select=token', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(payload),
        });
      }
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
      try {
        await supabaseFetch(`/notification_devices?token=eq.${encodeURIComponent(token)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: false, invalidated_at: nowIso(), updated_at: nowIso() }),
        });
      } catch {
        await supabaseFetch(`/push_tokens?token=eq.${encodeURIComponent(token)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: false, invalidated_at: nowIso(), updated_at: nowIso() }),
        });
      }
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
      try {
        const rows = await supabaseFetch(`/app_notifications?recipient_account_id=eq.${encodeURIComponent(accountId)}&select=*&order=created_at.desc&limit=${limit}`);
        return sendJson(res, 200, rows || []);
      } catch {
        const rows = await supabaseFetch(`/notifications?select=*&order=created_at.desc&limit=${limit}`);
        return sendJson(res, 200, (rows || []).map((row) => ({
          id: String(row.id || makeId('legacy')),
          event_type: 'platform',
          title: 'Drizn update',
          body: String(row.text || ''),
          payload: {},
          read: Boolean(row.read),
          created_at: row.created_at || nowIso(),
        })));
      }
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
      recipientAccountType: normalizeAccountTypeValue(body.recipientAccountType || body.payload?.recipientAccountType || 'personal'),
      actorAccountId: String(body.actorAccountId || getAuthUserId(req) || ''),
      actorAccountType: normalizeAccountTypeValue(body.actorAccountType || body.payload?.actorAccountType || ''),
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
      const radiusKm = Math.max(1, Number(body.radiusKm || 5) || 5);
      const listingRows = await supabaseFetch(`/listings?id=eq.${encodeURIComponent(listingId)}&select=*&limit=1`);
      const listing = listingRows?.[0];
      if (!listing || !isPublicListingRow(listing)) {
        return sendJson(res, 200, { success: true, persisted: true, notifiedCount: 0, skipped: 'listing-unavailable' });
      }

      let tokenRows = [];
      try {
        tokenRows = await supabaseFetch('/notification_devices?enabled=eq.true&select=account_id,metadata');
      } catch {
        tokenRows = await supabaseFetch('/push_tokens?enabled=eq.true&select=account_id,metadata');
      }

      let preferenceRows = [];
      try {
        preferenceRows = await supabaseFetch('/notification_preferences?select=account_id,nearby_enabled,muted_account_ids,blocked_account_ids,max_nearby_per_day');
      } catch {
        preferenceRows = [];
      }
      const preferenceByAccount = new Map((preferenceRows || []).map((row) => [String(row.account_id || ''), row]));

      const recipientByAccount = new Map();
      const diagnostics = {
        candidateTokens: Number(tokenRows?.length || 0),
        withinRadius: 0,
        preferenceSkips: 0,
        businessRecipientSkips: 0,
        invalidLocationSkips: 0,
        dedupeSkips: 0,
        sent: 0,
        failed: 0,
      };

      const profileRows = await supabaseFetch('/profiles?select=*');
      const profileByAccountId = new Map((profileRows || []).map((profile) => [String(profile.id || '').trim(), profile]));

      const isPersonalRecipient = (accountId) => {
        const profile = profileByAccountId.get(String(accountId || '').trim()) || {};
        const metadata = parseJsonValue(profile.metadata, {});
        const accountType = profile.account_type || profile.mode || metadata.accountType || metadata.mode || '';
        return isPersonalAccountType(accountType);
      };

      const isBlockedByPreference = (accountId) => {
        const pref = preferenceByAccount.get(String(accountId)) || {};
        if (pref.nearby_enabled === false) return true;
        const muted = Array.isArray(pref.muted_account_ids) ? pref.muted_account_ids.map((entry) => String(entry)) : [];
        const blocked = Array.isArray(pref.blocked_account_ids) ? pref.blocked_account_ids.map((entry) => String(entry)) : [];
        return muted.includes(ownerId) || blocked.includes(ownerId);
      };

      (tokenRows || []).forEach((row) => {
        const accountId = String(row.account_id || '').trim();
        if (!accountId || accountId === ownerId) return;
        if (!isPersonalRecipient(accountId)) {
          diagnostics.businessRecipientSkips += 1;
          return;
        }
        if (isBlockedByPreference(accountId)) {
          diagnostics.preferenceSkips += 1;
          return;
        }
        const coordinates = getLocationFromTokenMetadata(parseJsonValue(row.metadata, {}));
        if (!coordinates) {
          diagnostics.invalidLocationSkips += 1;
          return;
        }
        const distanceKm = haversineKm({ lat, lng }, coordinates);
        if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return;
        diagnostics.withinRadius += 1;
        const existing = recipientByAccount.get(accountId);
        if (!existing || distanceKm < existing.distanceKm) {
          recipientByAccount.set(accountId, { accountId, distanceKm });
        }
      });

      // Include nearby users even if they do not currently have push-token metadata.
      (profileRows || []).forEach((profile) => {
        const accountId = String(profile.id || '').trim();
        if (!accountId || accountId === ownerId) return;
        if (!isPersonalRecipient(accountId)) {
          diagnostics.businessRecipientSkips += 1;
          return;
        }
        if (isBlockedByPreference(accountId)) {
          diagnostics.preferenceSkips += 1;
          return;
        }
        const coordinates = getLocationFromProfileRow(profile);
        if (!coordinates) {
          diagnostics.invalidLocationSkips += 1;
          return;
        }
        const distanceKm = haversineKm({ lat, lng }, coordinates);
        if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return;
        diagnostics.withinRadius += 1;
        const existing = recipientByAccount.get(accountId);
        if (!existing || distanceKm < existing.distanceKm) {
          recipientByAccount.set(accountId, { accountId, distanceKm });
        }
      });

      const recipients = [...recipientByAccount.values()].sort((a, b) => a.distanceKm - b.distanceKm);
      const baseListing = listingRowToClient(listing);
      const productName = String(baseListing.title || body.title || 'item');
      const sellerLabel = String(baseListing.isBusinessProduct ? (baseListing.storeName || baseListing.sellerName || 'A store') : (baseListing.sellerName || 'Someone'));
      const expiryText = formatExpiryTextFromListing(listing);
      const action = baseListing.isBusinessProduct ? 'reserve' : 'request';

      const today = new Date().toISOString().slice(0, 10);
      let notifiedCount = 0;
      for (const recipient of recipients) {
        const distanceText = formatDistanceText(recipient.distanceKm);
        const bodyText = baseListing.isBusinessProduct
          ? `${sellerLabel} listed "${productName}" ${distanceText} away. Expires ${expiryText}. Want to reserve it now?`
          : `${sellerLabel} listed "${productName}" ${distanceText} away. Expires ${expiryText}. Want to claim it now?`;
        const result = await persistNotificationEvent({
          eventType: 'nearby_listing',
          recipientAccountId: recipient.accountId,
          actorAccountId: ownerId,
          listingId,
          title: 'New free item near you',
          body: bodyText,
          dedupeKey: `nearby_listing:${listingId}:${recipient.accountId}:${today}`,
          payload: {
            category: String(body.category || ''),
            distanceKm: Number(recipient.distanceKm.toFixed(2)),
            area: String(body.area || ''),
            city: String(body.city || ''),
            listingId,
            recipientAccountType: 'personal',
            actorAccountType: normalizeAccountTypeValue(body.actorAccountType || ''),
            sellerId: String(baseListing.sellerId || baseListing.businessId || ownerId),
            openPath: `/listing/${encodeURIComponent(listingId)}?action=${action}`,
            action,
            expiryText,
            sellerName: sellerLabel,
            productName,
          },
        });
        if (result.accepted && !result.deduped) {
          notifiedCount += 1;
          diagnostics.sent += 1;
        } else if (result.deduped) {
          diagnostics.dedupeSkips += 1;
        } else {
          diagnostics.failed += 1;
        }
      }

      console.info('[nearby-listing] dispatch summary', {
        listingId,
        ownerId,
        radiusKm,
        recipientCandidates: recipients.length,
        ...diagnostics,
      });

      return sendJson(res, 200, {
        success: true,
        persisted: true,
        candidates: recipients.length,
        notifiedCount,
        diagnostics,
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
    const buyerId = String(body.buyerId || body.buyer_id || userId);
    const quantity = Number(body.quantity || 1) || 1;
    const identityMap = await fetchProfilesByAccountIds([buyerId, sellerId]).catch(() => new Map());
    const buyerIdentity = profileIdentity(identityMap.get(String(buyerId).trim()) || {}, body.buyerName || 'Buyer');
    const sellerIdentity = profileIdentity(identityMap.get(String(sellerId).trim()) || {}, body.sellerName || 'Seller');
    const currentDetails = body.details && typeof body.details === 'object' ? body.details : {};
    const nextStatus = requestStatusPayload(body.status, {
      ...currentDetails,
      ...body,
      buyerName: buyerIdentity.name,
      buyerAvatar: body.buyerAvatar || body.buyerProfileImage || buyerIdentity.avatarUrl || '',
      buyerProfileImage: body.buyerProfileImage || body.buyerAvatar || buyerIdentity.avatarUrl || '',
      sellerName: sellerIdentity.name,
      sellerAvatar: body.sellerAvatar || body.sellerProfileImage || sellerIdentity.avatarUrl || '',
      sellerProfileImage: body.sellerProfileImage || body.sellerAvatar || sellerIdentity.avatarUrl || '',
      collectionCode: body.collectionCode || body.collection_code || body.qrCodeValue || id,
      quantity,
    });
    const payload = {
      id,
      listing_id: String(listingId),
      buyer_id: buyerId,
      seller_id: String(sellerId),
      quantity,
      status: nextStatus.rowStatus,
      details: nextStatus.details,
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

  if (url === '/api/auth/send-otp' || url === '/auth/send-otp') {
    return forwardAuthRequest(req, res, '/api/auth/send-otp');
  }

  if (url === '/api/auth/resend-otp' || url === '/auth/resend-otp') {
    return forwardAuthRequest(req, res, '/api/auth/resend-otp');
  }

  if (url === '/api/auth/verify-otp' || url === '/auth/verify-otp') {
    return forwardAuthRequest(req, res, '/api/auth/verify-otp');
  }

  if (url === '/api/profile/phone-change/initiate' || url === '/profile/phone-change/initiate') {
    return forwardAuthRequest(req, res, '/api/profile/phone-change/initiate');
  }

  if (url === '/api/profile/phone-change/confirm' || url === '/profile/phone-change/confirm') {
    return forwardAuthRequest(req, res, '/api/profile/phone-change/confirm');
  }

  if (url === '/api/listings' || url === '/listings') {
    try {
      return await handleListings(req, res);
    } catch (error) {
      return sendJson(res, 500, { error: 'Listings route failed', message: error.message || 'Unknown error' });
    }
  }

  const listingReserveMatch = url.match(/^\/(?:api\/)?listings\/([^/]+)\/reserve$/);
  if (listingReserveMatch) {
    try {
      return await handleListingReserve(req, res, decodeURIComponent(listingReserveMatch[1]));
    } catch (error) {
      return sendJson(res, error.status || 500, {
        success: false,
        code: 'RESERVE_FAILED',
        message: error.message || 'Could not reserve listing',
      });
    }
  }

  const requestHandoverMatch = url.match(/^\/(?:api\/)?requests\/([^/]+)\/handover$/);
  if (requestHandoverMatch) {
    try {
      return await handleRequestHandover(req, res, decodeURIComponent(requestHandoverMatch[1]));
    } catch (error) {
      return sendJson(res, error.status || 500, {
        success: false,
        code: 'HANDOVER_FAILED',
        message: error.message || 'Could not record handover',
      });
    }
  }

  const pendingKarmaMatch = url.match(/^\/(?:api\/)?karma\/pending\/([^/]+)$/);
  if (pendingKarmaMatch) {
    try {
      return await handlePendingKarma(req, res, decodeURIComponent(pendingKarmaMatch[1]));
    } catch (error) {
      return sendJson(res, error.status || 500, { error: 'Pending karma route failed', message: error.message || 'Unknown error' });
    }
  }

  if (url === '/api/karma/community' || url === '/karma/community') {
    try {
      return await handleCommunityKarma(req, res);
    } catch (error) {
      return sendJson(res, error.status || 500, {
        success: false,
        code: 'KARMA_SUBMIT_FAILED',
        message: error.message || 'Could not submit Good Karma',
      });
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

  const publicProductMatch = url.match(/^\/product\/([^/]+)$/);
  if (publicProductMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      return await sendPublicProductPage(res, decodeURIComponent(publicProductMatch[1]));
    } catch (error) {
      return sendJson(res, error.status || 500, { error: 'Product page failed', message: error.message || 'Unknown error' });
    }
  }

  const publicProductImageMatch = url.match(/^\/product-image\/([^/]+)$/);
  if (publicProductImageMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      return await sendPublicProductImage(res, decodeURIComponent(publicProductImageMatch[1]), req.method);
    } catch (error) {
      return sendJson(res, error.status || 500, { error: 'Product image failed', message: error.message || 'Unknown error' });
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
