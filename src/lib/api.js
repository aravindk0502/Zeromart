// All API calls go to our Express server.
// JWT is stored in localStorage and sent with every authenticated request.

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const apiUrl = (path) => `${BASE}${path}`;

function getToken() { return localStorage.getItem('zm_token'); }
export function setToken(t) { localStorage.setItem('zm_token', t); }
export function clearToken() { localStorage.removeItem('zm_token'); }
export function isLoggedIn() { return !!getToken(); }

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function post(path, body, auth = false) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function get(path) {
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function put(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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
  photo_url:       listing.photo || null,
  nearby_eligible: true,
  pickup_area:     listing.area || '',
}, true);

// ── Favourites ────────────────────────────────────────────────────────────────
export const fetchFavourites  = ()   => get('/api/favourites').catch(() => []);
export const toggleFavouriteAPI = (id) => post(`/api/favourites/${id}`, {}, true);

// ── Orders ────────────────────────────────────────────────────────────────────
export const fetchOrders = () => get('/api/orders').catch(() => []);

// ── Payment ───────────────────────────────────────────────────────────────────
export const createRazorpayOrder = (amount = 2900) => post('/api/create-order', { amount });
export const verifyPayment = (payload) => post('/api/verify-payment', payload, true);
