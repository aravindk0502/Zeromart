import serverless from 'serverless-http';

let appHandler;

const SUPABASE_URL = String(process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || '';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const DEFAULT_SELLER_NAME = 'Drizn User';

function cleanSellerName(...names) {
  const value = names.find((name) => {
    const trimmed = String(name || '').trim();
    return trimmed && trimmed.toLowerCase() !== 'unknown';
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
    ...jsonHeaders,
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
  const sellerType = row.seller_type || metadata.sellerType || 'community';
  const latitude = numberOrNull(row.latitude ?? locationData.latitude ?? locationData.lat);
  const longitude = numberOrNull(row.longitude ?? locationData.longitude ?? locationData.lng);
  const imageUrl = row.image_url || metadata.image || metadata.photo || '';
  const sellerName = cleanSellerName(row.seller_name, row.store_name, metadata.sellerName, metadata.businessName);
  const sellerAvatar = metadata.sellerAvatar || metadata.profileImage || metadata.avatarUrl || metadata.logoUrl || '';

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
    sellerAvatar,
    sellerProfileImage: sellerAvatar,
    avatarUrl: sellerAvatar,
    sellerType,
    listingType: sellerType === 'business' ? 'business' : 'community',
    isBusinessProduct: sellerType === 'business',
    businessId: row.business_id || metadata.businessId || '',
    storeName: row.store_name || '',
    sellerKarma: Number(row.karma_score || 0),
    karma: Number(row.karma_score || 0),
    totalQuantity: Number(row.quantity || 0),
    quantity: Number(row.quantity || 0),
    availableQuantity: Number(row.available_quantity || 0),
    reservedQuantity: Number(row.reserved_quantity || 0),
    soldQuantity: Number(row.sold_quantity || 0),
    price: Number(row.price || 0),
    expiryDate: safeDate(row.expiry_date),
    expiryTime: row.expiry_time || '',
    status: row.status === 'active' ? 'Available' : row.status,
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
    metadata,
  };
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
  return profile.display_name
    || profile.business_name
    || profile.name
    || metadata.displayName
    || metadata.businessName
    || metadata.name
    || '';
}

function profileAvatar(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return profile.avatar_url
    || profile.logo_url
    || profile.profile_image
    || metadata.avatarUrl
    || metadata.logoUrl
    || metadata.profileImage
    || '';
}

function profileKarma(profile = {}) {
  const metadata = parseJsonValue(profile.metadata, {});
  return Number(profile.karma_points ?? profile.karma ?? profile.store_karma ?? metadata.karma ?? metadata.storeKarma ?? 0) || 0;
}

async function attachListingProfiles(rows = []) {
  const ids = [...new Set(rows.map((row) => String(row.seller_id || '').trim()).filter(Boolean))];
  if (!ids.length) return rows;
  try {
    const filter = ids.map((id) => encodeURIComponent(id)).join(',');
    const profiles = await supabaseFetch(`/profiles?id=in.(${filter})&select=*`);
    const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [String(profile.id), profile]));
    return rows.map((row) => {
      const profile = profileMap.get(String(row.seller_id || ''));
      if (!profile) return row;
      const metadata = parseJsonValue(row.metadata, {});
      const name = profileDisplayName(profile);
      const avatar = profileAvatar(profile);
      const karma = profileKarma(profile);
      return {
        ...row,
        seller_name: cleanSellerName(name, row.seller_name, row.store_name),
        karma_score: Number(row.karma_score || 0) || karma,
        metadata: {
          ...metadata,
          sellerName: cleanSellerName(name, metadata.sellerName, row.seller_name),
          sellerAvatar: avatar || metadata.sellerAvatar || metadata.profileImage || '',
          profileImage: avatar || metadata.profileImage || '',
        },
      };
    });
  } catch (error) {
    console.error('[api] profile join failed for listings', error?.message || error);
    return rows;
  }
}

function listingPayloadToSupabase(body = {}) {
  const locationData = body.locationData || body.location_data || {};
  const coordinates = body.coordinates || {};
  const sellerType = body.sellerType || body.seller_type || body.listingType || (body.isBusinessProduct ? 'business' : 'community');
  const id = String(body.serverId || body.id || `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const quantity = Math.max(0, Number(body.totalQuantity ?? body.quantity ?? body.availableQuantity ?? 1) || 1);
  const availableQuantity = Math.max(0, Number(body.availableQuantity ?? body.quantity ?? quantity) || 0);
  const latitude = numberOrNull(body.latitude ?? body.lat ?? coordinates.lat ?? locationData.latitude ?? locationData.lat);
  const longitude = numberOrNull(body.longitude ?? body.lng ?? coordinates.lng ?? locationData.longitude ?? locationData.lng);

  return {
    id,
    title: body.title || body.name || 'Untitled listing',
    category: body.category || 'Other',
    condition: body.condition || 'Good',
    description: body.description || '',
    image_url: body.imageUrl || body.image_url || body.photo_url || body.image || body.photo || '',
    seller_id: String(body.sellerId || body.seller_id || body.businessId || body.ownerMobile || 'guest'),
    seller_name: cleanSellerName(body.sellerName, body.seller_name, body.storeName, body.businessName),
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
      ...(body.metadata || {}),
      ownerMobile: body.ownerMobile || body.mobile || '',
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
    const url = `${restUrl}/listings?select=*&status=in.(active,available,live)&available_quantity=gt.0&order=created_at.desc`;
    const response = await fetch(url, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    if (!response.ok) {
      return sendJson(res, response.status, { error: 'Could not fetch listings', details: text.slice(0, 200) });
    }
    const today = new Date().toISOString().slice(0, 10);
    const rows = await attachListingProfiles(JSON.parse(text || '[]')
      .filter((row) => !row.expiry_date || String(row.expiry_date).slice(0, 10) >= today)
      .sort((a, b) => {
        const aRescue = a.expiry_date && String(a.expiry_date).slice(0, 10) <= today ? 0 : 1;
        const bRescue = b.expiry_date && String(b.expiry_date).slice(0, 10) <= today ? 0 : 1;
        if (aRescue !== bRescue) return aRescue - bRescue;
        if (a.seller_type !== b.seller_type) return a.seller_type === 'business' ? -1 : 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }));
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

  const routeHandler = await getAppHandler();
  return routeHandler(req, res);
}
