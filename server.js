import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dns from 'dns/promises';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import pg from 'pg';
import multer from 'multer';
import WebSocket from 'ws';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

export const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'zeromart-dev-secret-change-in-prod';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_SELLER_NAME = 'Drizn User';

function cleanSellerName(...names) {
  const value = names.find((name) => {
    const trimmed = String(name || '').trim();
    return trimmed && trimmed.toLowerCase() !== 'unknown';
  });
  return String(value || DEFAULT_SELLER_NAME).trim();
}
const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = String(origin || '').replace(/\/$/, '');
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by ZeroMart CORS policy.'));
  },
}));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'zeromart-api' }));

// ── Database ──────────────────────────────────────────────────────────────────

const getEnv = (keys) => keys.map((key) => process.env[key]).find(Boolean) || '';
const rawDatabaseUrl = getEnv(['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']);
const dbHost = process.env.POSTGRES_HOST || process.env.PGHOST || '';
const dbUser = process.env.POSTGRES_USER || process.env.PGUSER || '';
const dbPassword = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '';
const dbName = process.env.POSTGRES_DATABASE || process.env.PGDATABASE || '';
const dbPort = process.env.POSTGRES_PORT || process.env.PGPORT || '5432';

const DATABASE_URL = rawDatabaseUrl.trim() || (
  dbHost && dbUser && dbName && dbPassword
    ? `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`
    : ''
);

const IS_VERCEL_SERVERLESS = Boolean(process.env.VERCEL);
let dbEnabled = Boolean(DATABASE_URL) && !IS_VERCEL_SERVERLESS;
let pool = null;

async function createDbPool() {
  if (!DATABASE_URL) return null;
  const baseConfig = {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };

  try {
    const parsed = new URL(DATABASE_URL);
    const hostname = parsed.hostname;
    if (!hostname) return new Pool(baseConfig);

    const { address } = await dns.lookup(hostname, { family: 4 });
    return new Pool({
      host: address,
      port: Number(parsed.port || dbPort || 5432),
      user: decodeURIComponent(parsed.username || dbUser || ''),
      password: decodeURIComponent(parsed.password || dbPassword || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || dbName || ''),
      ssl: { rejectUnauthorized: false, servername: hostname },
    });
  } catch (error) {
    console.warn('[DB] IPv4 hostname resolution failed, falling back to default connection settings');
    return new Pool(baseConfig);
  }
}

// Supabase Storage client (optional)
const normalizeSupabaseUrl = (value = '') => String(value || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createSupabaseClient(SUPABASE_URL, SUPABASE_KEY) : null;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'Drizn';

const requiredRuntimeEnv = {
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || '',
};

const getMissingRuntimeEnv = () => Object.entries(requiredRuntimeEnv)
  .filter(([, value]) => !String(value || '').trim())
  .map(([key]) => key);

const hasSharedPersistence = () => dbEnabled || canUseSupabaseTable();

const respondPersistenceNotConfigured = (res) => {
  const missing = getMissingRuntimeEnv();
  console.error('[PERSISTENCE] shared persistence unavailable', {
    dbEnabled,
    supabaseConfigured: canUseSupabaseTable(),
    missing,
  });
  return res.status(503).json({ error: 'Database not configured', missing });
};

// multer for parsing multipart form data (memory storage)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export async function initDB() {
  if (IS_VERCEL_SERVERLESS) {
    dbEnabled = false;
    console.log('[DB] Vercel serverless runtime detected — using Supabase-backed shared persistence');
    return;
  }

  if (!DATABASE_URL) {
    if (IS_PRODUCTION) {
      console.error('[DB] Database not configured: DATABASE_URL is missing');
    } else {
      console.log('[DB] No DATABASE_URL/POSTGRES connection details — running without database (demo mode)');
    }
    dbEnabled = false;
    return;
  }

  try {
    pool = await createDbPool();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      phone       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL DEFAULT 'Unknown',
      initials    TEXT NOT NULL DEFAULT 'ZM',
      mode        TEXT NOT NULL DEFAULT 'seller',
      is_buyer    BOOLEAN NOT NULL DEFAULT false,
      karma       INTEGER NOT NULL DEFAULT 0,
      credits     INTEGER NOT NULL DEFAULT 0,
      vouchers    INTEGER NOT NULL DEFAULT 0,
      has_seen_tour BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      category        TEXT NOT NULL,
      emoji           TEXT NOT NULL DEFAULT '📦',
      distance        FLOAT NOT NULL DEFAULT 0,
      condition       TEXT NOT NULL DEFAULT 'Good',
      description     TEXT,
      photo_url       TEXT,
      nearby_eligible BOOLEAN NOT NULL DEFAULT false,
      listed          TEXT NOT NULL DEFAULT 'just now',
      seller_id       INTEGER REFERENCES users(id),
      seller_name     TEXT NOT NULL,
      seller_karma    INTEGER NOT NULL DEFAULT 0,
      seller_initials TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS favourites (
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id               TEXT PRIMARY KEY,
      buyer_id         INTEGER REFERENCES users(id),
      product_id       INTEGER,
      product_title    TEXT NOT NULL,
      product_emoji    TEXT NOT NULL,
      product_category TEXT NOT NULL,
      seller_name      TEXT NOT NULL,
      seller_initials  TEXT NOT NULL,
      seller_karma     INTEGER NOT NULL DEFAULT 0,
      type             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      status_label     TEXT NOT NULL,
      eta              TEXT,
      steps            JSONB NOT NULL DEFAULT '[]',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id            TEXT PRIMARY KEY,
      phone         TEXT UNIQUE,
      name          TEXT NOT NULL DEFAULT 'Unknown',
      account_type  TEXT NOT NULL DEFAULT 'consumer',
      karma         INTEGER NOT NULL DEFAULT 0,
      location_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS listings (
      id                 TEXT PRIMARY KEY,
      title              TEXT NOT NULL,
      category           TEXT NOT NULL DEFAULT 'Other',
      condition          TEXT NOT NULL DEFAULT 'Good',
      description        TEXT,
      image_url          TEXT,
      seller_id          TEXT,
      seller_name        TEXT NOT NULL DEFAULT 'Unknown',
      seller_type        TEXT NOT NULL DEFAULT 'community',
      business_id        TEXT,
      store_name         TEXT,
      karma_score        INTEGER NOT NULL DEFAULT 0,
      quantity           INTEGER NOT NULL DEFAULT 1,
      available_quantity INTEGER NOT NULL DEFAULT 1,
      reserved_quantity  INTEGER NOT NULL DEFAULT 0,
      sold_quantity      INTEGER NOT NULL DEFAULT 0,
      price              NUMERIC(10,2) NOT NULL DEFAULT 0,
      expiry_date        DATE,
      expiry_time        TEXT,
      status             TEXT NOT NULL DEFAULT 'active',
      latitude           DOUBLE PRECISION,
      longitude          DOUBLE PRECISION,
      location           TEXT,
      area               TEXT,
      city               TEXT,
      state              TEXT,
      country            TEXT NOT NULL DEFAULT 'India',
      location_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status);
    CREATE INDEX IF NOT EXISTS listings_seller_type_idx ON listings (seller_type);
    CREATE INDEX IF NOT EXISTS listings_expiry_date_idx ON listings (expiry_date);
    CREATE INDEX IF NOT EXISTS listings_lat_lng_idx ON listings (latitude, longitude);

    CREATE TABLE IF NOT EXISTS requests (
      id          TEXT PRIMARY KEY,
      listing_id  TEXT REFERENCES listings(id) ON DELETE SET NULL,
      buyer_id    TEXT,
      seller_id   TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      quantity    INTEGER NOT NULL DEFAULT 1,
      details     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS karma_events (
      id          TEXT PRIMARY KEY,
      giver_id    TEXT,
      receiver_id TEXT,
      listing_id  TEXT,
      order_id    TEXT,
      points      INTEGER NOT NULL DEFAULT 1,
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Add pickup_area column if missing (safe to run repeatedly)
    DO $$ BEGIN
      ALTER TABLE products ADD COLUMN IF NOT EXISTS pickup_area TEXT DEFAULT '';
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

    ALTER TABLE users ALTER COLUMN name SET DEFAULT 'Unknown';
    UPDATE users SET name = 'Unknown' WHERE name = 'ZeroMart User';

    -- Seed listings if products table is empty
    INSERT INTO products (title, category, emoji, distance, condition, seller_name, seller_karma, seller_initials, description, nearby_eligible, listed)
    SELECT * FROM (VALUES
      ('Sony Bluetooth Speaker',     'Electronics', '🔊', 0.4, 'Good',      'Ravi K',    47,  'RK', 'Used for 6 months, works perfectly. Moving abroad.', true,  '2 hours ago'),
      ('Wooden Study Table',         'Furniture',   '🪑', 1.2, 'Very Good', 'Priya M',   83,  'PM', 'Solid teak wood. Kids outgrew it.', false, '5 hours ago'),
      ('Baby Stroller',              'Baby & Kids', '🍼', 0.7, 'Like New',  'Ananya R',  29,  'AR', 'Used only 3 months. Baby preferred to be carried!', true,  '1 day ago'),
      ('Yoga Mat',                   'Sports',      '🧘', 2.1, 'Good',      'Karthik S', 62,  'KS', '6mm thick mat, washed and clean.', false, '3 hours ago'),
      ('Stack of Engineering Books', 'Books',       '📚', 0.3, 'Good',      'Meera V',   115, 'MV', 'GATE prep books. Take all 12 books.', true,  '6 hours ago'),
      ('Air Fryer',                  'Appliances',  '🍳', 1.8, 'Very Good', 'Suresh P',  38,  'SP', 'Upgraded to a bigger one. 2.5L capacity.', false, '2 days ago'),
      ('Kids Bicycle',               'Sports',      '🚲', 0.6, 'Good',      'Lakshmi T', 74,  'LT', '14 inch wheels, suitable for 5–8 year olds.', true,  '4 hours ago'),
      ('Formal Shirts (5 pcs)',      'Clothing',    '👔', 3.0, 'Very Good', 'Vikram B',  21,  'VB', 'Size 40, wore each maybe 3–4 times.', false, '1 hour ago')
    ) AS t(title,category,emoji,distance,condition,seller_name,seller_karma,seller_initials,description,nearby_eligible,listed)
    WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);
  `);
  console.log('[DB] Tables ready');
  } catch (err) {
    console.error('[DB init failed]', err.message || err);
    dbEnabled = false;
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuthMiddleware(req, _res, next) {
  const header = req.headers.authorization;
  if (!header) return next();
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
  } catch {
    req.user = null;
  }
  return next();
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

function safeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function listingRowToClient(row) {
  if (!row) return null;
  const locationData = parseJsonValue(row.location_data, {});
  const metadata = parseJsonValue(row.metadata, {});
  const sellerType = row.seller_type || metadata.sellerType || 'community';
  const latitude = numberOrNull(row.latitude ?? locationData.latitude ?? locationData.lat);
  const longitude = numberOrNull(row.longitude ?? locationData.longitude ?? locationData.lng);
  const imageUrl = row.image_url || metadata.image || metadata.photo || '';
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

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
    sellerName: cleanSellerName(row.seller_name, row.store_name, metadata.sellerName, metadata.businessName),
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
    createdAt,
    updatedAt,
    metadata,
  };
}

function listingPayloadToDb(body = {}, user = null) {
  const locationData = body.locationData || body.location_data || {};
  const coordinates = body.coordinates || {};
  const sellerType = body.sellerType || body.seller_type || body.listingType || (body.isBusinessProduct ? 'business' : 'community');
  const id = String(body.serverId || body.id || crypto.randomUUID());
  const latitude = numberOrNull(body.latitude ?? body.lat ?? coordinates.lat ?? locationData.latitude ?? locationData.lat);
  const longitude = numberOrNull(body.longitude ?? body.lng ?? coordinates.lng ?? locationData.longitude ?? locationData.lng);
  const quantity = Math.max(0, Number(body.totalQuantity ?? body.quantity ?? body.availableQuantity ?? 1) || 1);
  const availableQuantity = Math.max(0, Number(body.availableQuantity ?? body.quantity ?? quantity) || 0);
  const imageUrl = body.imageUrl || body.image_url || body.photo_url || body.image || body.photo || '';
  const sellerAvatar = body.sellerAvatar
    || body.avatarUrl
    || body.avatar_url
    || body.profileImage
    || body.profile_image
    || (body.metadata && (body.metadata.sellerAvatar || body.metadata.avatarUrl || body.metadata.profileImage))
    || '';
  const metadata = {
    ...(body.metadata || {}),
    ownerMobile: body.ownerMobile || body.mobile || '',
    originalId: body.originalId || body.id || id,
    sellerInitials: body.sellerInitials || body.initials || '',
    sellerAvatar,
    avatarUrl: sellerAvatar,
    profileImage: sellerAvatar,
    isOwn: Boolean(body.isOwn),
  };

  return {
    id,
    title: body.title || body.name || 'Untitled listing',
    category: body.category || 'Other',
    condition: body.condition || 'Good',
    description: body.description || '',
    imageUrl,
    sellerId: String(user?.id || body.sellerId || body.seller_id || body.businessId || body.ownerMobile || 'guest'),
    sellerName: cleanSellerName(body.sellerName, body.seller_name, body.storeName, body.businessName, user?.name),
    sellerType: sellerType === 'business' ? 'business' : 'community',
    businessId: body.businessId || body.business_id || '',
    storeName: body.storeName || body.businessName || body.store_name || '',
    karmaScore: Number(body.sellerKarma ?? body.karmaScore ?? body.karma ?? 0) || 0,
    quantity,
    availableQuantity,
    reservedQuantity: Math.max(0, Number(body.reservedQuantity ?? 0) || 0),
    soldQuantity: Math.max(0, Number(body.soldQuantity ?? 0) || 0),
    price: Number(body.price ?? body.sellingPrice ?? 0) || 0,
    expiryDate: body.expiryDate || body.validTill || null,
    expiryTime: body.expiryTime || body.expiry_time || null,
    status: String(body.status || 'active').toLowerCase() === 'available' ? 'active' : String(body.status || 'active').toLowerCase(),
    latitude,
    longitude,
    location: body.location || body.pickupArea || body.pickupLocation || locationData.displayAddress || locationData.formattedAddress || '',
    area: body.area || locationData.area || locationData.locality || locationData.subLocality || '',
    city: body.city || locationData.city || '',
    state: body.state || locationData.state || '',
    country: body.country || locationData.country || 'India',
    locationData,
    metadata,
  };
}

function listingDbPayload(listing) {
  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    condition: listing.condition,
    description: listing.description,
    image_url: listing.imageUrl,
    seller_id: listing.sellerId,
    seller_name: listing.sellerName,
    seller_type: listing.sellerType,
    business_id: listing.businessId || null,
    store_name: listing.storeName || null,
    karma_score: listing.karmaScore,
    quantity: listing.quantity,
    available_quantity: listing.availableQuantity,
    reserved_quantity: listing.reservedQuantity,
    sold_quantity: listing.soldQuantity,
    price: listing.price,
    expiry_date: listing.expiryDate,
    expiry_time: listing.expiryTime,
    status: listing.status,
    latitude: listing.latitude,
    longitude: listing.longitude,
    location: listing.location,
    area: listing.area,
    city: listing.city,
    state: listing.state,
    country: listing.country,
    location_data: listing.locationData || {},
    metadata: listing.metadata || {},
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

function canUseSupabaseTable() {
  return Boolean(supabase);
}

async function fetchListingsViaSupabase() {
  if (!canUseSupabaseTable()) return null;
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .in('status', ['active', 'available', 'live'])
    .gt('available_quantity', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  return (data || [])
    .filter((row) => !isTestListingRow(row))
    .filter((row) => !row.expiry_date || String(row.expiry_date).slice(0, 10) >= today)
    .sort((a, b) => {
      const aRescue = a.expiry_date && String(a.expiry_date).slice(0, 10) <= today ? 0 : 1;
      const bRescue = b.expiry_date && String(b.expiry_date).slice(0, 10) <= today ? 0 : 1;
      if (aRescue !== bRescue) return aRescue - bRescue;
      if (a.seller_type !== b.seller_type) return a.seller_type === 'business' ? -1 : 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    })
    .map(listingRowToClient);
}

async function upsertListingViaSupabase(listing) {
  if (!canUseSupabaseTable()) return null;
  const { data, error } = await supabase
    .from('listings')
    .upsert(listingDbPayload(listing), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return listingRowToClient(data);
}

async function updateListingViaSupabase(id, listing, user = null) {
  if (!canUseSupabaseTable()) return null;
  const existing = await supabase
    .from('listings')
    .select('seller_id')
    .eq('id', id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const notFound = new Error('Not found');
    notFound.status = 404;
    throw notFound;
  }
  if (user?.id && existing.data.seller_id && String(existing.data.seller_id) !== String(user.id)) {
    const forbidden = new Error('Not allowed');
    forbidden.status = 403;
    throw forbidden;
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ ...listingDbPayload(listing), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return listingRowToClient(data);
}

async function hideListingViaSupabase(id, user = null) {
  if (!canUseSupabaseTable()) return null;
  const existing = await supabase
    .from('listings')
    .select('seller_id')
    .eq('id', id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const notFound = new Error('Not found');
    notFound.status = 404;
    throw notFound;
  }
  if (user?.id && existing.data.seller_id && String(existing.data.seller_id) !== String(user.id)) {
    const forbidden = new Error('Not allowed');
    forbidden.status = 403;
    throw forbidden;
  }
  const { error } = await supabase
    .from('listings')
    .update({ status: 'hidden', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return { success: true };
}

// ── OTP store (in-memory for demo; persists in DB when available) ─────────────
const otpStore = new Map(); // phone → { otp, expires }

// ── Routes ────────────────────────────────────────────────────────────────────

// Send OTP
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Valid 10-digit phone number required' });
  }

  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    const demoOtp = '123456';
    otpStore.set(phone, { otp: demoOtp, expires: Date.now() + 5 * 60 * 1000 });
    console.log(`[DEMO] OTP for ${phone}: ${demoOtp}`);
    return res.json({ success: true, demo: true });
  }

  try {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=91${phone}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (data.type === 'success') return res.json({ success: true });
    return res.status(500).json({ error: data.message || 'MSG91 error' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP → return JWT
app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

  const authKey = process.env.MSG91_AUTH_KEY;

  if (authKey) {
    try {
      const url = `https://control.msg91.com/api/v5/otp/verify?mobile=91${phone}&otp=${otp}`;
      const response = await fetch(url, { method: 'POST', headers: { authkey: authKey } });
      const data = await response.json();
      if (data.type !== 'success') return res.status(400).json({ error: 'Incorrect OTP' });
    } catch {
      return res.status(500).json({ error: 'OTP verification failed' });
    }
  } else {
    // Demo mode: accept any 6-digit OTP — no MSG91 keys configured
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ error: 'Enter a valid 6-digit OTP' });
    }
    otpStore.delete(phone);
  }

  // Get or create user
  let user;
  if (dbEnabled) {
    const result = await pool.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING *`,
      [phone]
    );
    user = result.rows[0];
  } else {
    user = { id: `demo_${phone}`, phone, name: 'Unknown', initials: 'UN', mode: 'seller', is_buyer: false, karma: 0, credits: 0, vouchers: 0, has_seen_tour: false };
  }

  const token = jwt.sign({ id: user.id, phone }, JWT_SECRET, { expiresIn: '90d' });
  return res.json({ success: true, token, user });
});

// Get profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ id: req.user.id, phone: req.user.phone });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json(result.rows[0]);
});

// Update profile
app.put('/api/profile', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ success: true });
  const { name, initials, mode, is_buyer, karma, credits, vouchers, has_seen_tour } = req.body;
  await pool.query(
    `UPDATE users SET
      name = COALESCE($1, name), initials = COALESCE($2, initials),
      mode = COALESCE($3, mode), is_buyer = COALESCE($4, is_buyer),
      karma = COALESCE($5, karma), credits = COALESCE($6, credits),
      vouchers = COALESCE($7, vouchers), has_seen_tour = COALESCE($8, has_seen_tour)
     WHERE id = $9`,
    [name, initials, mode, is_buyer, karma, credits, vouchers, has_seen_tour, req.user.id]
  );
  return res.json({ success: true });
});

// Get products
app.get('/api/products', async (req, res) => {
  if (!dbEnabled) return res.json([]);
  const result = await pool.query(
    `SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC`
  );
  return res.json(result.rows);
});

// Get live listings from the production shared listings table.
app.get('/api/listings', async (_req, res) => {
  if (!hasSharedPersistence() && IS_PRODUCTION) {
    return respondPersistenceNotConfigured(res);
  }
  if (!dbEnabled) {
    try {
      const listings = await fetchListingsViaSupabase();
      return res.json(listings || []);
    } catch (err) {
      console.error('[LISTINGS] Supabase fetch failed', err.message || err);
      return res.status(500).json({ error: 'Could not fetch listings' });
    }
  }
  try {
    const result = await pool.query(
      `SELECT *
       FROM listings
       WHERE status IN ('active', 'available', 'live')
         AND COALESCE(available_quantity, 0) > 0
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       ORDER BY
         CASE WHEN expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '2 days' THEN 0 ELSE 1 END,
         CASE WHEN seller_type = 'business' THEN 0 ELSE 1 END,
         created_at DESC`
    );
    return res.json(result.rows.filter((row) => !isTestListingRow(row)).map(listingRowToClient));
  } catch (err) {
    console.error('[LISTINGS] fetch failed', err.message || err);
    return res.status(500).json({ error: 'Could not fetch listings' });
  }
});

// Create or upsert a live listing. Auth is optional while sign-in is still being
// completed, but authenticated users always become the source owner.
app.post('/api/listings', optionalAuthMiddleware, async (req, res) => {
  if (!hasSharedPersistence() && IS_PRODUCTION) {
    return respondPersistenceNotConfigured(res);
  }
  const listing = listingPayloadToDb(req.body, req.user);
  if (!dbEnabled) {
    try {
      const saved = await upsertListingViaSupabase(listing);
      return res.status(201).json(saved || { ...req.body, id: listing.id, serverPersisted: false });
    } catch (err) {
      console.error('[LISTINGS] Supabase create failed', err.message || err);
      return res.status(500).json({ error: 'Could not save listing' });
    }
  }
  try {
    const result = await pool.query(
      `INSERT INTO listings (
        id, title, category, condition, description, image_url, seller_id, seller_name,
        seller_type, business_id, store_name, karma_score, quantity, available_quantity,
        reserved_quantity, sold_quantity, price, expiry_date, expiry_time, status,
        latitude, longitude, location, area, city, state, country, location_data, metadata
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29
      )
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        category=EXCLUDED.category,
        condition=EXCLUDED.condition,
        description=EXCLUDED.description,
        image_url=EXCLUDED.image_url,
        seller_id=EXCLUDED.seller_id,
        seller_name=EXCLUDED.seller_name,
        seller_type=EXCLUDED.seller_type,
        business_id=EXCLUDED.business_id,
        store_name=EXCLUDED.store_name,
        karma_score=EXCLUDED.karma_score,
        quantity=EXCLUDED.quantity,
        available_quantity=EXCLUDED.available_quantity,
        reserved_quantity=EXCLUDED.reserved_quantity,
        sold_quantity=EXCLUDED.sold_quantity,
        price=EXCLUDED.price,
        expiry_date=EXCLUDED.expiry_date,
        expiry_time=EXCLUDED.expiry_time,
        status=EXCLUDED.status,
        latitude=EXCLUDED.latitude,
        longitude=EXCLUDED.longitude,
        location=EXCLUDED.location,
        area=EXCLUDED.area,
        city=EXCLUDED.city,
        state=EXCLUDED.state,
        country=EXCLUDED.country,
        location_data=EXCLUDED.location_data,
        metadata=EXCLUDED.metadata,
        updated_at=now()
      RETURNING *`,
      [
        listing.id, listing.title, listing.category, listing.condition, listing.description, listing.imageUrl,
        listing.sellerId, listing.sellerName, listing.sellerType, listing.businessId, listing.storeName,
        listing.karmaScore, listing.quantity, listing.availableQuantity, listing.reservedQuantity,
        listing.soldQuantity, listing.price, listing.expiryDate, listing.expiryTime, listing.status,
        listing.latitude, listing.longitude, listing.location, listing.area, listing.city, listing.state,
        listing.country, JSON.stringify(listing.locationData), JSON.stringify(listing.metadata),
      ]
    );
    return res.status(201).json(listingRowToClient(result.rows[0]));
  } catch (err) {
    console.error('[LISTINGS] create failed', err.message || err);
    return res.status(500).json({ error: 'Could not save listing' });
  }
});

app.put('/api/listings/:id', optionalAuthMiddleware, async (req, res) => {
  if (!hasSharedPersistence() && IS_PRODUCTION) {
    return respondPersistenceNotConfigured(res);
  }
  const listing = listingPayloadToDb({ ...req.body, id: req.params.id }, req.user);
  if (!dbEnabled) {
    try {
      const saved = await updateListingViaSupabase(req.params.id, listing, req.user);
      return res.json(saved || { success: true, id: req.params.id });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'Not allowed' });
      if (err.status === 404) return res.status(404).json({ error: 'Not found' });
      console.error('[LISTINGS] Supabase update failed', err.message || err);
      return res.status(500).json({ error: 'Could not update listing' });
    }
  }
  try {
    const existing = await pool.query('SELECT seller_id FROM listings WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (req.user?.id && existing.rows[0].seller_id && String(existing.rows[0].seller_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const result = await pool.query(
      `UPDATE listings SET
        title=$2, category=$3, condition=$4, description=$5, image_url=$6,
        seller_name=$7, seller_type=$8, business_id=$9, store_name=$10,
        karma_score=$11, quantity=$12, available_quantity=$13,
        reserved_quantity=$14, sold_quantity=$15, price=$16, expiry_date=$17,
        expiry_time=$18, status=$19, latitude=$20, longitude=$21, location=$22,
        area=$23, city=$24, state=$25, country=$26, location_data=$27,
        metadata=$28, updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [
        listing.id, listing.title, listing.category, listing.condition, listing.description, listing.imageUrl,
        listing.sellerName, listing.sellerType, listing.businessId, listing.storeName, listing.karmaScore,
        listing.quantity, listing.availableQuantity, listing.reservedQuantity, listing.soldQuantity,
        listing.price, listing.expiryDate, listing.expiryTime, listing.status, listing.latitude,
        listing.longitude, listing.location, listing.area, listing.city, listing.state, listing.country,
        JSON.stringify(listing.locationData), JSON.stringify(listing.metadata),
      ]
    );
    return res.json(listingRowToClient(result.rows[0]));
  } catch (err) {
    console.error('[LISTINGS] update failed', err.message || err);
    return res.status(500).json({ error: 'Could not update listing' });
  }
});

app.delete('/api/listings/:id', optionalAuthMiddleware, async (req, res) => {
  if (!hasSharedPersistence() && IS_PRODUCTION) {
    return respondPersistenceNotConfigured(res);
  }
  if (!dbEnabled) {
    try {
      const result = await hideListingViaSupabase(req.params.id, req.user);
      return res.json(result || { success: true });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'Not allowed' });
      if (err.status === 404) return res.status(404).json({ error: 'Not found' });
      console.error('[LISTINGS] Supabase delete failed', err.message || err);
      return res.status(500).json({ error: 'Could not delete listing' });
    }
  }
  try {
    const existing = await pool.query('SELECT seller_id FROM listings WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (req.user?.id && existing.rows[0].seller_id && String(existing.rows[0].seller_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    await pool.query('UPDATE listings SET status=$2, updated_at=now() WHERE id=$1', [req.params.id, 'hidden']);
    return res.json({ success: true });
  } catch (err) {
    console.error('[LISTINGS] delete failed', err.message || err);
    return res.status(500).json({ error: 'Could not delete listing' });
  }
});

// Create product
app.post('/api/products', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ id: Date.now() });
  const { title, category, emoji, condition, description, photo_url, nearby_eligible, pickup_area } = req.body;
  const profile = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const u = profile.rows[0];
  const result = await pool.query(
    `INSERT INTO products (title, category, emoji, condition, description, photo_url, nearby_eligible, pickup_area, seller_id, seller_name, seller_karma, seller_initials)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [title, category, emoji, condition, description, photo_url, nearby_eligible ?? true,
     pickup_area || '',
     req.user.id, u?.name || 'You', u?.karma || 0, u?.initials || 'ME']
  );
  return res.json({ id: result.rows[0].id });
});

// Upload image: multipart/form-data 'file' field. Returns { url }
app.post('/api/upload', optionalAuthMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // If supabase is configured, upload to storage
    if (supabase) {
      const ext = (file.originalname || '').split('.').pop() || 'jpg';
      const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) {
        console.error('[UPLOAD] Supabase upload failed', uploadError.message || uploadError);
        return res.status(500).json({ error: 'Upload failed' });
      }
      // Get public URL
      const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
      return res.json({ url: data?.publicUrl || '' });
    }

    // Demo mode: return a data URL so client can persist it locally
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    return res.json({ url: dataUrl });
  } catch (err) {
    console.error('[UPLOAD] error', err.message || err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// Update product
app.put('/api/products/:id', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ success: true, id: Number(req.params.id) });
  const { id } = req.params;
  const { title, category, emoji, condition, description, photo_url, nearby_eligible, pickup_area } = req.body;
  try {
    const existing = await pool.query('SELECT seller_id FROM products WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (String(existing.rows[0].seller_id) !== String(req.user.id)) return res.status(403).json({ error: 'Not allowed' });
    await pool.query(
      `UPDATE products SET title=$1, category=$2, emoji=$3, condition=$4, description=$5, photo_url=$6, nearby_eligible=$7, pickup_area=$8, updated_at=now() WHERE id=$9`,
      [title, category, emoji || '📦', condition, description || '', photo_url || null, nearby_eligible ?? true, pickup_area || '', id]
    );
    return res.json({ success: true, id: Number(id) });
  } catch (err) {
    return res.status(500).json({ error: 'Could not update product' });
  }
});

// Delete product
app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ success: true });
  const { id } = req.params;
  try {
    const existing = await pool.query('SELECT seller_id FROM products WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (String(existing.rows[0].seller_id) !== String(req.user.id)) return res.status(403).json({ error: 'Not allowed' });
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete product' });
  }
});

// Expose whether database persistence is enabled
app.get('/api/persistence', (_req, res) => {
  return res.json({ db: hasSharedPersistence(), missing: getMissingRuntimeEnv() });
});

// Get favourites
app.get('/api/favourites', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json([]);
  const result = await pool.query('SELECT product_id FROM favourites WHERE user_id = $1', [req.user.id]);
  return res.json(result.rows.map(r => r.product_id));
});

// Toggle favourite
app.post('/api/favourites/:productId', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ success: true });
  const { productId } = req.params;
  const existing = await pool.query('SELECT 1 FROM favourites WHERE user_id=$1 AND product_id=$2', [req.user.id, productId]);
  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM favourites WHERE user_id=$1 AND product_id=$2', [req.user.id, productId]);
  } else {
    await pool.query('INSERT INTO favourites (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, productId]);
  }
  return res.json({ success: true });
});

// Get orders
app.get('/api/orders', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json([]);
  const result = await pool.query('SELECT * FROM orders WHERE buyer_id=$1 ORDER BY created_at DESC', [req.user.id]);
  return res.json(result.rows);
});

// Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.json({ demo: true, order_id: 'demo_order', amount: 2900, currency: 'INR', key_id: 'demo' });
  }
  try {
    const rzp   = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({ amount: 2900, currency: 'INR', receipt: `zm_${Date.now()}` });
    return res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId });
  } catch (err) {
    return res.status(500).json({ error: 'Could not create payment order' });
  }
});

// Verify Razorpay payment → mark user as buyer
app.post('/api/verify-payment', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keySecret && razorpay_signature) {
    const body     = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ error: 'Payment signature mismatch' });
  }

  if (dbEnabled) {
    await pool.query('UPDATE users SET is_buyer=true, mode=$1 WHERE id=$2', ['buyer', req.user.id]);
  }
  return res.json({ success: true });
});

// ── Optional local/static frontend serving ───────────────────────────────────
const frontendDirectory = path.join(__dirname, 'dist');
if (existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(frontendDirectory, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDB().then(() => {
    app.listen(PORT, () => console.log(`ZeroMart running on port ${PORT}`));
  }).catch(err => {
    console.error('[DB init failed]', err.message);
  });
}
