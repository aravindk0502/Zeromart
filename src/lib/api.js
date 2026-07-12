// All API calls go to our Express server.
// JWT is stored in localStorage and sent with every authenticated request.

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const IS_PRODUCTION = import.meta.env.PROD;

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

const getCandidateBases = () => {
  const bases = [];
  // In production, always prefer the configured API base for shared persistence.
  if (IS_PRODUCTION && BASE) return [BASE];

  if (BASE) bases.push(BASE);
  if (typeof window !== 'undefined' && window.location?.origin) bases.push(window.location.origin);
  return [...new Set(bases.map((value) => String(value || '').replace(/\/$/, '')).filter(Boolean))];
};

async function requestJson(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    headers = {},
  } = options;

  const bases = getCandidateBases();
  let lastError = null;

  for (const base of bases) {
    const url = apiUrl(path, base);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(auth ? authHeaders() : {}),
          ...headers,
        },
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
        lastError = new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
        continue;
      }

      if (base !== BASE) {
        console.warn('[api] fallback base used', { base, path });
      }
      return data;
    } catch (error) {
      console.error('[api] request error', {
        url,
        error: String(error?.message || error),
        possibleCorsError: isCorsLikeError(error),
      });
      lastError = error;
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
export const sendOtp    = (phone)      => post('/api/send-otp', { phone });
export const verifyOtp  = (phone, otp) => post('/api/verify-otp', { phone, otp });

// ── Profile ───────────────────────────────────────────────────────────────────
export const fetchProfile  = ()      => get('/api/profile');
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
export const insertListing = (listing) => post('/api/listings', listing, isLoggedIn());
export const updateListing = (id, listing) => put(`/api/listings/${encodeURIComponent(id)}`, listing);
export const deleteListing = (id) => requestJson(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });

// ── Favourites ────────────────────────────────────────────────────────────────
export const fetchFavourites  = ()   => get('/api/favourites').catch(() => []);
export const toggleFavouriteAPI = (id) => post(`/api/favourites/${id}`, {}, true);

// ── Orders ────────────────────────────────────────────────────────────────────
export const fetchOrders = () => get('/api/orders').catch(() => []);

// ── Payment ───────────────────────────────────────────────────────────────────
export const createRazorpayOrder = (amount = 2900) => post('/api/create-order', { amount });
export const verifyPayment = (payload) => post('/api/verify-payment', payload, true);
