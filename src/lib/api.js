import { supabase, isOnline } from './supabase';

// ─── OTP ──────────────────────────────────────────────────────────────────────

export async function sendOtp(phone) {
  const res = await fetch('/api/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
  return data;
}

export async function verifyOtp(phone, otp) {
  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid OTP');
  // data.token is a Supabase custom token or session
  return data;
}

// ─── Razorpay ─────────────────────────────────────────────────────────────────

export async function createRazorpayOrder(amount = 2900) {
  const res = await fetch('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Payment setup failed');
  return data; // { order_id, amount, currency, key_id }
}

export async function verifyPayment(payload) {
  const res = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Payment verification failed');
  return data;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function fetchProducts() {
  if (!isOnline()) return null;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) { console.error('[ZeroMart] fetchProducts:', error); return null; }
  return data.map(p => ({
    id: p.id,
    title: p.title,
    category: p.category,
    emoji: p.emoji,
    distance: p.distance,
    condition: p.condition,
    description: p.description || '',
    photo: p.photo_url || null,
    nearbyEligible: p.nearby_eligible,
    listed: p.listed,
    seller: { name: p.seller_name, karma: p.seller_karma, initials: p.seller_initials },
    sellerId: p.seller_id,
  }));
}

export async function insertProduct(listing, user) {
  if (!isOnline()) return null;
  const session = await supabase.auth.getSession();
  const uid = session.data?.session?.user?.id;
  const { data, error } = await supabase
    .from('products')
    .insert({
      title: listing.title,
      category: listing.category,
      emoji: listing.emoji,
      condition: listing.condition,
      description: listing.description || '',
      photo_url: listing.photo || null,
      nearby_eligible: true,
      listed: 'just now',
      seller_id: uid || null,
      seller_name: user.name,
      seller_karma: user.karma,
      seller_initials: user.initials,
    })
    .select()
    .single();
  if (error) { console.error('[ZeroMart] insertProduct:', error); return null; }
  return data.id;
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export async function fetchFavourites(userId) {
  if (!isOnline() || !userId) return null;
  const { data, error } = await supabase
    .from('favourites')
    .select('product_id')
    .eq('user_id', userId);
  if (error) return null;
  return data.map(f => f.product_id);
}

export async function addFavourite(userId, productId) {
  if (!isOnline() || !userId) return;
  await supabase.from('favourites').insert({ user_id: userId, product_id: productId });
}

export async function removeFavourite(userId, productId) {
  if (!isOnline() || !userId) return;
  await supabase.from('favourites').delete().eq('user_id', userId).eq('product_id', productId);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(userId) {
  if (!isOnline() || !userId) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}

export async function upsertProfile(userId, updates) {
  if (!isOnline() || !userId) return;
  await supabase.from('profiles').upsert({ id: userId, ...updates }, { onConflict: 'id' });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function fetchOrders(userId) {
  if (!isOnline() || !userId) return null;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false });
  if (error) return null;
  return data;
}
