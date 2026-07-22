// All API calls go to our Express server.
// JWT is stored in localStorage and sent with every authenticated request.

const normalizeApiBase = (value = '') => {
  const raw = String(value || '').trim();
  const match = raw.match(/https?:\/\/[^\]\s)]+/i);
  return String(match ? match[0] : raw)
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
};

const BASE = normalizeApiBase(import.meta.env.VITE_API_URL);
const IS_PRODUCTION = import.meta.env.PROD;
const PROD_API_FALLBACK = 'https://drizn.com';
const PROD_PAYMENT_API_FALLBACK = 'https://web-production-74e61.up.railway.app';
const BUYER_ACCESS_CREATE_ORDER_TIMEOUT_MS = 15000;
const OTP_REQUEST_TIMEOUT_MS = 30000;
const AUTH_REQUEST_MAX_ATTEMPTS = 2;

const normalizeAuthAccountType = (value = '') => {
  const type = String(value || '').trim().toLowerCase();
  return type === 'business' || type === 'store' ? 'business' : 'personal';
};

const apiUrl = (path, base = BASE) => `${String(base || '').replace(/\/$/, '')}${path}`;

function getToken() { return localStorage.getItem('zm_token'); }
export function setToken(t) { localStorage.setItem('zm_token', t); }
export function clearToken() { localStorage.removeItem('zm_token'); }
export function isLoggedIn() { return !!getToken(); }

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const isCorsLikeError = (error) => {
  const message = String(error?.message || error || '');
  return /failed to fetch|networkerror|load failed|cors|err_name_not_resolved/i.test(message);
};

const isRetryableBuyerAccessError = (error) => {
  if (!error) return false;
  if (Number.isFinite(Number(error.status))) return Number(error.status) >= 500;
  return /timed out|failed to fetch|networkerror|load failed|cors|err_name_not_resolved|abort/i.test(String(error?.message || error));
};

const getCandidateBases = () => {
  const bases = [];
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';

  // In production, always prefer the configured shared API, then try the
  // deployed same-origin API before giving up. Never fall back to localStorage.
  if (IS_PRODUCTION) {
    if (currentOrigin) bases.push(currentOrigin);
    if (BASE) bases.push(BASE);
    if (!BASE) bases.push(PROD_API_FALLBACK);
    return [...new Set(bases.map((value) => String(value || '').replace(/\/$/, '')).filter(Boolean))];
  }

  if (BASE) bases.push(BASE);
  if (currentOrigin) bases.push(currentOrigin);
  return [...new Set(bases.map((value) => String(value || '').replace(/\/$/, '')).filter(Boolean))];
};

const getBuyerAccessBases = () => {
  const bases = [];
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';

  if (IS_PRODUCTION) {
    bases.push(PROD_PAYMENT_API_FALLBACK);
    if (BASE) bases.push(BASE);
    if (currentOrigin) bases.push(currentOrigin);
    return [...new Set(bases.map((value) => String(value || '').replace(/\/$/, '')).filter(Boolean))];
  }

  if (BASE) bases.push(BASE);
  if (currentOrigin) bases.push(currentOrigin);
  return [...new Set(bases.map((value) => String(value || '').replace(/\/$/, '')).filter(Boolean))];
};

const getAuthBases = () => getBuyerAccessBases();

async function requestAcrossBases(path, options = {}, bases = []) {
  let lastError = null;

  for (const base of bases) {
    try {
      return await requestJson(path, { ...options, baseOverride: base });
    } catch (error) {
      lastError = error;
      if (!isRetryableBuyerAccessError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Request failed');
}

async function requestAuthAcrossBasesWithRetry(path, options = {}, maxAttempts = AUTH_REQUEST_MAX_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= Number(maxAttempts); attempt += 1) {
    try {
      return await requestAcrossBases(path, options, getAuthBases());
    } catch (error) {
      lastError = error;
      if (attempt >= Number(maxAttempts) || !isRetryableBuyerAccessError(error)) {
        throw error;
      }
    }
  }
  throw lastError || new Error('Request failed');
}

async function requestJson(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    headers = {},
    baseOverride = '',
    timeoutMs = 0,
  } = options;

  const bases = baseOverride ? [baseOverride] : getCandidateBases();
  let lastError = null;
  const isGet = String(method).toUpperCase() === 'GET';

  for (const base of bases) {
    const url = apiUrl(path, base);
    const controller = new AbortController();
    const timeoutId = Number(timeoutMs) > 0
      ? setTimeout(() => controller.abort(), Number(timeoutMs))
      : null;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(isGet ? { 'Cache-Control': 'no-store', Pragma: 'no-cache' } : {}),
          ...(auth ? authHeaders() : {}),
          ...headers,
        },
        cache: isGet ? 'no-store' : 'default',
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!res.ok) {
        console.error('[api] request failed', { url, status: res.status, responseBody: data });
        const message = data?.message || data?.error?.message || data?.error || `Request failed (${res.status})`;
        const code = data?.code || data?.error?.code || '';
        const error = new Error(code ? `${message} [${code}]` : message);
        error.status = res.status;
        error.code = code;
        error.response = data;
        lastError = error;
        continue;
      }

      if (base !== BASE) {
        console.warn('[api] fallback base used', { base, path });
      }
      return data;
    } catch (error) {
      const isAuthPath = /^\/api\/auth\//.test(String(path || ''));
      const normalizedError = error?.name === 'AbortError'
        ? new Error(isAuthPath ? 'OTP service is taking longer than usual. Please retry once.' : 'Request timed out.')
        : error;
      console.error('[api] request error', {
        url,
        error: String(normalizedError?.message || normalizedError),
        possibleCorsError: isCorsLikeError(normalizedError),
      });
      lastError = normalizedError;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Request failed');
}

async function requestUpload(path, file) {
  const bases = getCandidateBases();
  let lastError = null;

  for (const base of bases) {
    const url = apiUrl(path, base);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...(isLoggedIn() ? authHeaders() : {}) },
        body: form,
      });
      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!res.ok) {
        console.error('[api] upload failed', { url, status: res.status, responseBody: data });
        lastError = new Error(data?.error || `Upload failed (${res.status})`);
        continue;
      }

      if (base !== BASE) {
        console.warn('[api] fallback base used', { base, path });
      }
      return data?.url;
    } catch (error) {
      console.error('[api] upload error', {
        url,
        error: String(error?.message || error),
        possibleCorsError: isCorsLikeError(error),
      });
      lastError = error;
    }
  }

  throw lastError || new Error('Upload failed');
}

async function post(path, body, auth = false) {
  return requestJson(path, { method: 'POST', body, auth });
}

async function get(path) {
  return requestJson(path, { method: 'GET', auth: true });
}

async function put(path, body) {
  return requestJson(path, { method: 'PUT', body, auth: true });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function sendOtp(phone, options = {}) {
  const accountType = normalizeAuthAccountType(options.accountType || options.account_type || 'personal');
  return requestAuthAcrossBasesWithRetry('/api/auth/send-otp', {
    method: 'POST',
    body: { phone, accountType },
    auth: false,
    timeoutMs: OTP_REQUEST_TIMEOUT_MS,
  });
}

export async function verifyOtp(phone, otp, options = {}) {
  const accountType = normalizeAuthAccountType(options.accountType || options.account_type || 'personal');
  return requestAuthAcrossBasesWithRetry('/api/auth/verify-otp', {
    method: 'POST',
    body: { phone, otp, accountType },
    auth: false,
    timeoutMs: OTP_REQUEST_TIMEOUT_MS,
  });
}

export async function resendOtp(phone, retryType = 'text', options = {}) {
  const accountType = normalizeAuthAccountType(options.accountType || options.account_type || 'personal');
  return requestAuthAcrossBasesWithRetry('/api/auth/resend-otp', {
    method: 'POST',
    body: { phone, retryType, accountType },
    auth: false,
    timeoutMs: OTP_REQUEST_TIMEOUT_MS,
  });
}

export async function initiatePhoneChange(newPhone) {
  return requestAcrossBases('/api/profile/phone-change/initiate', {
    method: 'POST',
    body: { newPhone },
    auth: true,
    timeoutMs: OTP_REQUEST_TIMEOUT_MS,
  }, getAuthBases());
}

export async function confirmPhoneChange(newPhone, otp) {
  return requestAcrossBases('/api/profile/phone-change/confirm', {
    method: 'POST',
    body: { newPhone, otp },
    auth: true,
    timeoutMs: OTP_REQUEST_TIMEOUT_MS,
  }, getAuthBases());
}

// ── Profile ───────────────────────────────────────────────────────────────────
export async function fetchProfile() {
  return requestAcrossBases('/api/profile', {
    method: 'GET',
    auth: true,
  }, getAuthBases());
}
export const updateProfile = (data)  => put('/api/profile', data);

// ── Products ──────────────────────────────────────────────────────────────────
export const fetchProducts = () => get('/api/products');

export const insertProduct = (listing, user) => post('/api/products', {
  title:           listing.title,
  category:        listing.category,
  emoji:           listing.emoji,
  condition:       listing.condition,
  description:     listing.description || '',
  photo_url:       listing.photo_url || listing.photo || null,
  nearby_eligible: true,
  pickup_area:     listing.area || '',
}, true);

export const uploadImage = (file) => {
  return requestUpload('/api/upload', file);
};

export const updateProduct = (id, data) => put(`/api/products/${id}`, data);
export const deleteProduct = (id) => requestJson(`/api/products/${id}`, { method: 'DELETE', auth: true });
export const fetchPersistence = () => get('/api/persistence');

// ── Live Listings ────────────────────────────────────────────────────────────
export const fetchListings = () => requestJson('/api/listings', { method: 'GET', auth: false });
export const fetchListingById = (id) => requestJson(`/api/listings/${encodeURIComponent(id)}`, { method: 'GET', auth: false });
export const insertListing = (listing) => post('/api/listings', listing, isLoggedIn());
export const updateListing = (id, listing) => put(`/api/listings/${encodeURIComponent(id)}`, listing);
export const deleteListing = (id) => requestJson(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });

// ── Favourites ────────────────────────────────────────────────────────────────
export const fetchFavourites  = ()   => get('/api/favourites').catch(() => []);
export const toggleFavouriteAPI = (id) => post(`/api/favourites/${id}`, {}, true);

// ── Orders ────────────────────────────────────────────────────────────────────
export const fetchOrders = () => get('/api/orders').catch(() => []);
export const saveOrder = (payload) => post('/api/orders', payload, isLoggedIn());
export const markRequestHandover = (requestId, payload) => post(`/api/requests/${encodeURIComponent(requestId)}/handover`, payload, isLoggedIn());

// ── Payment ───────────────────────────────────────────────────────────────────
export async function createBuyerAccessOrder(amount = 2900) {
  const path = '/api/payments/create-order';
  const body = {
    amount,
    planCode: 'buyer_access_annual_29',
  };
  const bases = getBuyerAccessBases();
  let lastError = null;

  for (const base of bases) {
    const url = apiUrl(path, base);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Create-order request timed out.')), BUYER_ACCESS_CREATE_ORDER_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[BuyerAccess] create-order response', {
        url,
        status: res.status,
        elapsedMs,
        body: data,
      });

      if (!res.ok) {
        const message = data?.message || data?.error?.message || data?.error || `Request failed (${res.status})`;
        const error = new Error(message);
        error.status = res.status;
        error.response = data;
        throw error;
      }

      if (base !== BASE) {
        console.warn('[api] fallback base used', { base, path });
      }
      return data;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error?.name === 'AbortError'
        ? 'Create-order request timed out.'
        : String(error?.message || error);
      console.error('[BuyerAccess] error', {
        step: 'create-order request',
        url,
        elapsedMs,
        status: error?.status || null,
        message,
        possibleCorsError: isCorsLikeError(error),
      });
      lastError = error?.name === 'AbortError' ? new Error('Create-order request timed out.') : error;
      if (!isRetryableBuyerAccessError(lastError)) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Create-order request failed.');
}
export async function verifyBuyerAccessPayment(payload) {
  const path = '/api/payments/verify';
  let lastError = null;

  for (const base of getBuyerAccessBases()) {
    try {
      const data = await requestJson(path, { method: 'POST', body: payload, auth: true, headers: {}, baseOverride: base });
      return data;
    } catch (error) {
      lastError = error;
      if (!isRetryableBuyerAccessError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Payment verification failed.');
}

export async function fetchBuyerAccessStatus() {
  const path = '/api/payments/status';
  let lastError = null;

  for (const base of getBuyerAccessBases()) {
    try {
      const data = await requestJson(path, { method: 'GET', auth: true, baseOverride: base });
      return data;
    } catch (error) {
      lastError = error;
      if (!isRetryableBuyerAccessError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Could not fetch buyer access status.');
}

// Backwards-compatible aliases for older call sites.
export const createRazorpayOrder = createBuyerAccessOrder;
export const verifyPayment = verifyBuyerAccessPayment;

// ── Notifications ─────────────────────────────────────────────────────────────
export const registerPushToken = (payload) => post('/api/notifications/token', payload, isLoggedIn());
export const disablePushToken = (token) => post('/api/notifications/token/disable', { token }, isLoggedIn());
export const fetchNotificationPreferences = (accountId) => requestJson(`/api/notifications/preferences/${encodeURIComponent(accountId)}`, { method: 'GET', auth: isLoggedIn() });
export const updateNotificationPreferences = (accountId, payload) => requestJson(`/api/notifications/preferences/${encodeURIComponent(accountId)}`, { method: 'PUT', body: payload, auth: isLoggedIn() });
export const fetchNotificationHistory = (accountId, limit = 50) => requestJson(`/api/notifications/history/${encodeURIComponent(accountId)}?limit=${encodeURIComponent(limit)}`, { method: 'GET', auth: isLoggedIn() });
export const fetchPendingKarmaActions = (accountId) => requestJson(`/api/karma/pending/${encodeURIComponent(accountId)}`, { method: 'GET', auth: isLoggedIn() }).catch(() => []);
export const emitNotificationEvent = (payload) => post('/api/notifications/events', payload, isLoggedIn());
export const triggerNearbyListingAlerts = (payload) => post('/api/notifications/nearby-listing', payload, isLoggedIn());
export const awardCommunityKarma = (payload) => post('/api/karma/community', payload, isLoggedIn());
export const reserveListing = (listingId, payload) => post(`/api/listings/${encodeURIComponent(listingId)}/reserve`, payload, isLoggedIn());
