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
import admin from 'firebase-admin';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

export const app = express();
const PORT = process.env.PORT || 3001;
const FALLBACK_JWT_SECRET = 'zeromart-dev-secret-change-in-prod';
const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_SELLER_NAME = 'Drizn User';

if (IS_PRODUCTION && JWT_SECRET === FALLBACK_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set to a strong value in production.');
}

function cleanSellerName(...names) {
  const value = names.find((name) => {
    const trimmed = String(name || '').trim();
    return trimmed && trimmed.toLowerCase() !== 'unknown';
  });
  return String(value || DEFAULT_SELLER_NAME).trim();
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
const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.disable('x-powered-by');
if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

const rateLimitStore = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, keyPrefix, keyGenerator }) {
  return (req, res, next) => {
    const baseKey = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const key = `${keyPrefix}:${String(baseKey || 'unknown').slice(0, 256)}`;
    const now = Date.now();
    const bucket = rateLimitStore.get(key) || [];
    const recent = bucket.filter((timestamp) => (now - timestamp) < windowMs);

    if (recent.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests, please try again shortly.' });
    }

    recent.push(now);
    rateLimitStore.set(key, recent);

    if (rateLimitStore.size > 10000) {
      for (const [entryKey, timestamps] of rateLimitStore.entries()) {
        const active = timestamps.filter((timestamp) => (now - timestamp) < windowMs);
        if (active.length === 0) {
          rateLimitStore.delete(entryKey);
        } else {
          rateLimitStore.set(entryKey, active);
        }
      }
    }

    return next();
  };
}

const otpSendRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'otp-send',
  keyGenerator: (req) => `${normalizeIndianMobile(req.body?.phone || '') || 'unknown'}:${getClientIp(req)}`,
});

const otpVerifyRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: 'otp-verify',
  keyGenerator: (req) => `${normalizeIndianMobile(req.body?.phone || '') || 'unknown'}:${getClientIp(req)}`,
});

const uploadRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: 'upload',
  keyGenerator: (req) => String(req.user?.id || getClientIp(req)),
});

const listingMutationRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  keyPrefix: 'listing-mutation',
  keyGenerator: (req) => String(req.user?.id || getClientIp(req)),
});

const notificationWriteRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 80,
  keyPrefix: 'notification-write',
  keyGenerator: (req) => String(req.user?.id || getClientIp(req)),
});

const paymentRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyPrefix: 'payment',
  keyGenerator: (req) => String(req.user?.id || getClientIp(req)),
});

const webhookRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'webhook',
  keyGenerator: (req) => getClientIp(req),
});

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = String(origin || '').replace(/\/$/, '');
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    if (!IS_PRODUCTION && allowedOrigins.length === 0) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by ZeroMart CORS policy.'));
  },
}));
app.use(express.json({
  limit: '1mb',
  verify(req, _res, buffer) {
    if (req.originalUrl === '/api/payments/webhook') {
      req.rawBody = buffer.toString('utf8');
    }
  },
}));
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
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      phone       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL DEFAULT 'Unknown',
      initials    TEXT NOT NULL DEFAULT 'ZM',
      mode        TEXT NOT NULL DEFAULT 'seller',
      is_buyer    BOOLEAN NOT NULL DEFAULT false,
      buyer_access_activated_at TIMESTAMPTZ,
      buyer_access_expires_at TIMESTAMPTZ,
      buyer_access_order_id TEXT,
      buyer_access_payment_id TEXT,
      karma       INTEGER NOT NULL DEFAULT 0,
      credits     INTEGER NOT NULL DEFAULT 0,
      vouchers    INTEGER NOT NULL DEFAULT 0,
      has_seen_tour BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_access_activated_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_access_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_access_order_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_access_payment_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'personal';

    UPDATE users
       SET account_type = CASE
         WHEN LOWER(COALESCE(account_type, '')) IN ('business', 'store') THEN 'business'
         ELSE 'personal'
       END;

    DO $$ BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
    EXCEPTION WHEN undefined_table THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_account_type_uidx ON users (phone, account_type);
    CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);

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

    CREATE TABLE IF NOT EXISTS buyer_access_payments (
      id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_code              TEXT NOT NULL DEFAULT 'buyer_access_annual_29',
      amount_paise           INTEGER NOT NULL DEFAULT 2900,
      currency               TEXT NOT NULL DEFAULT 'INR',
      razorpay_order_id      TEXT UNIQUE,
      razorpay_payment_id    TEXT UNIQUE,
      razorpay_signature     TEXT,
      signature_verified     BOOLEAN NOT NULL DEFAULT false,
      status                 TEXT NOT NULL DEFAULT 'created',
      access_expires_at      TIMESTAMPTZ,
      metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS buyer_access_payments_order_idx ON buyer_access_payments(razorpay_order_id);
    CREATE UNIQUE INDEX IF NOT EXISTS buyer_access_payments_payment_idx ON buyer_access_payments(razorpay_payment_id);

    CREATE INDEX IF NOT EXISTS buyer_access_payments_user_idx ON buyer_access_payments(user_id);

    CREATE TABLE IF NOT EXISTS phone_change_requests (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      new_phone     TEXT NOT NULL,
      request_id    TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      expires_at    TIMESTAMPTZ NOT NULL,
      verified_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS phone_change_requests_user_idx ON phone_change_requests(user_id);
    CREATE INDEX IF NOT EXISTS phone_change_requests_phone_idx ON phone_change_requests(new_phone);
    CREATE UNIQUE INDEX IF NOT EXISTS phone_change_requests_pending_user_idx
      ON phone_change_requests(user_id) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS security_audit_events (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'info',
      phone_last4   TEXT,
      ip_address    TEXT,
      metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS security_audit_events_user_idx ON security_audit_events(user_id);
    CREATE INDEX IF NOT EXISTS security_audit_events_type_idx ON security_audit_events(event_type);
    CREATE INDEX IF NOT EXISTS security_audit_events_created_idx ON security_audit_events(created_at DESC);

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
      request_id  TEXT,
      points      INTEGER NOT NULL DEFAULT 1,
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE karma_events ADD COLUMN IF NOT EXISTS request_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS karma_events_request_id_uidx ON karma_events (request_id) WHERE request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS karma_events_receiver_idx ON karma_events (receiver_id, created_at DESC);

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

const BUYER_ACCESS_PLAN_CODE = 'buyer_access_annual_29';
const BUYER_ACCESS_AMOUNT_PAISE = 2900;
const BUYER_ACCESS_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

function getBuyerAccessExpiry(base = Date.now()) {
  return new Date(Number(base) + BUYER_ACCESS_DURATION_MS);
}

function isDateExpired(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function serializeUserBuyerAccess(row = {}) {
  const expiresAt = row.buyer_access_expires_at || null;
  const activatedAt = row.buyer_access_activated_at || null;
  const expired = isDateExpired(expiresAt);
  return {
    isBuyer: Boolean(row.is_buyer && !expired),
    buyerAccessActivatedAt: activatedAt,
    buyerAccessExpiresAt: expired ? null : expiresAt,
    buyerAccessOrderId: row.buyer_access_order_id || '',
    buyerAccessPaymentId: row.buyer_access_payment_id || '',
  };
}

async function normalizeExpiredBuyerAccess(userId, row) {
  if (!dbEnabled || !pool || !row || !row.is_buyer) return row;
  if (!isDateExpired(row.buyer_access_expires_at)) return row;
  const cleared = await pool.query(
    `UPDATE users
     SET is_buyer = false,
         buyer_access_activated_at = NULL,
         buyer_access_expires_at = NULL
     WHERE id = $1
     RETURNING *`,
    [userId]
  );
  return cleared.rows[0] || row;
}

async function upsertBuyerAccessPayment({ userId, planCode, amountPaise, currency = 'INR', razorpayOrderId = null, razorpayPaymentId = null, razorpaySignature = null, signatureVerified = false, status = 'created', accessExpiresAt = null, metadata = {} }) {
  if (!dbEnabled || !pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO buyer_access_payments (
       user_id,
       plan_code,
       amount_paise,
       currency,
       razorpay_order_id,
       razorpay_payment_id,
       razorpay_signature,
       signature_verified,
       status,
       access_expires_at,
       metadata,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
     ON CONFLICT (razorpay_order_id) DO UPDATE SET
       razorpay_payment_id = COALESCE(EXCLUDED.razorpay_payment_id, buyer_access_payments.razorpay_payment_id),
       razorpay_signature = COALESCE(EXCLUDED.razorpay_signature, buyer_access_payments.razorpay_signature),
       signature_verified = EXCLUDED.signature_verified,
       status = EXCLUDED.status,
       access_expires_at = COALESCE(EXCLUDED.access_expires_at, buyer_access_payments.access_expires_at),
       metadata = buyer_access_payments.metadata || EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      userId,
      planCode,
      amountPaise,
      currency,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      signatureVerified,
      status,
      accessExpiresAt,
      JSON.stringify(metadata || {}),
    ]
  );
  return rows[0] || null;
}

async function activateBuyerAccess({ userId, orderId, paymentId, signature = '', verified = false, metadata = {}, planCode = BUYER_ACCESS_PLAN_CODE, amountPaise = BUYER_ACCESS_AMOUNT_PAISE }) {
  const accessExpiresAt = getBuyerAccessExpiry();
  if (dbEnabled && pool) {
    await pool.query(
      `UPDATE users
       SET is_buyer = true,
           mode = 'buyer',
           buyer_access_activated_at = now(),
           buyer_access_expires_at = $2,
           buyer_access_order_id = $3,
           buyer_access_payment_id = $4
       WHERE id = $1`,
      [userId, accessExpiresAt, orderId || null, paymentId || null]
    );
    await upsertBuyerAccessPayment({
      userId,
      planCode,
      amountPaise,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      signatureVerified: verified,
      status: 'verified',
      accessExpiresAt,
      metadata,
    });
  }
  return { accessExpiresAt };
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
  const sellerName = cleanSellerName(row.seller_name, row.store_name, metadata.sellerName, metadata.businessName);
  const sellerAvatar = metadata.sellerLogo
    || metadata.logoUrl
    || metadata.sellerAvatar
    || metadata.profileImage
    || metadata.avatarUrl
    || '';
  const sellerInitials = String(
    metadata.sellerInitials
    || getInitialsFromName(sellerName)
    || 'DU'
  ).trim().toUpperCase().slice(0, 2) || 'DU';
  const sellerProfileMetadata = parseJsonValue(metadata.sellerProfile, {});
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
    sellerProfile: {
      id: String(sellerProfileMetadata.id || row.seller_id || row.business_id || '').trim(),
      name: sellerProfileMetadata.name || sellerName,
      initials: sellerProfileMetadata.initials || sellerInitials,
      avatarUrl: sellerProfileMetadata.avatarUrl || sellerAvatar,
      logoUrl: sellerProfileMetadata.logoUrl || metadata.logoUrl || metadata.sellerLogo || '',
      accountType: sellerProfileMetadata.accountType || (sellerType === 'business' ? 'business' : 'community'),
      area: sellerProfileMetadata.area || row.area || locationData.area || locationData.locality || '',
      city: sellerProfileMetadata.city || row.city || locationData.city || '',
      karma: Number(sellerProfileMetadata.karma ?? row.karma_score ?? 0) || 0,
      activeListings: Number(sellerProfileMetadata.activeListings || 0) || 0,
      joinedAt: sellerProfileMetadata.joinedAt || '',
      bio: String(sellerProfileMetadata.bio || '').trim(),
      verified: Boolean(sellerProfileMetadata.verified || sellerType === 'business'),
    },
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

let notificationSchemaReady = false;

const getFirebaseCredential = () => {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      return admin.credential.cert(JSON.parse(serviceAccountJson));
    } catch (error) {
      console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return admin.credential.cert({ projectId, clientEmail, privateKey });
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) return true;
  const credential = getFirebaseCredential();
  if (!credential) return false;
  try {
    admin.initializeApp({ credential });
    return true;
  } catch (error) {
    console.warn('[FCM] firebase-admin initialization failed', error.message || error);
    return false;
  }
};

async function ensureNotificationSchema() {
  if (!dbEnabled || !pool || notificationSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id BIGSERIAL PRIMARY KEY,
      account_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'web',
      enabled BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      invalidated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS push_tokens_account_id_idx ON push_tokens (account_id);
    CREATE INDEX IF NOT EXISTS push_tokens_enabled_idx ON push_tokens (enabled);

    CREATE TABLE IF NOT EXISTS notification_preferences (
      account_id TEXT PRIMARY KEY,
      transactional_enabled BOOLEAN NOT NULL DEFAULT true,
      marketing_enabled BOOLEAN NOT NULL DEFAULT false,
      nearby_enabled BOOLEAN NOT NULL DEFAULT true,
      favourites_enabled BOOLEAN NOT NULL DEFAULT true,
      muted_account_ids TEXT[] NOT NULL DEFAULT '{}',
      blocked_account_ids TEXT[] NOT NULL DEFAULT '{}',
      max_nearby_per_day INTEGER NOT NULL DEFAULT 5,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS app_notifications (
      id TEXT PRIMARY KEY,
      recipient_account_id TEXT NOT NULL,
      actor_account_id TEXT,
      event_type TEXT NOT NULL,
      listing_id TEXT,
      request_id TEXT,
      order_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS app_notifications_recipient_idx ON app_notifications (recipient_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS app_notifications_event_type_idx ON app_notifications (event_type);

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      recipient_account_id TEXT NOT NULL,
      actor_account_id TEXT,
      listing_id TEXT,
      request_id TEXT,
      order_id TEXT,
      dedupe_key TEXT UNIQUE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      push_attempted BOOLEAN NOT NULL DEFAULT false,
      push_sent BOOLEAN NOT NULL DEFAULT false,
      push_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS notification_events_recipient_idx ON notification_events (recipient_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS notification_events_type_idx ON notification_events (event_type, created_at DESC);
  `);
  notificationSchemaReady = true;
}

const isTransactionalEvent = (eventType = '') => String(eventType).startsWith('transaction_')
  || String(eventType).includes('request')
  || String(eventType).includes('reservation')
  || String(eventType).includes('karma');

async function shouldDeliverEventToRecipient({ recipientAccountId, actorAccountId, eventType }) {
  if (!dbEnabled || !pool) return true;
  await ensureNotificationSchema();
  const { rows } = await pool.query(
    `SELECT
      transactional_enabled,
      marketing_enabled,
      nearby_enabled,
      favourites_enabled,
      muted_account_ids,
      blocked_account_ids,
      max_nearby_per_day
     FROM notification_preferences
     WHERE account_id = $1`,
    [String(recipientAccountId)]
  );
  const pref = rows[0];
  if (!pref) return true;

  const actorId = String(actorAccountId || '');
  if (actorId) {
    if ((pref.blocked_account_ids || []).includes(actorId)) return false;
    if ((pref.muted_account_ids || []).includes(actorId)) return false;
  }

  const type = String(eventType || '').toLowerCase();
  if (type === 'nearby_listing' && pref.nearby_enabled === false) return false;
  if (type === 'favourite_listing' && pref.favourites_enabled === false) return false;
  if (type === 'marketing' && pref.marketing_enabled === false) return false;
  if (isTransactionalEvent(type) && pref.transactional_enabled === false) return false;

  if (type === 'nearby_listing') {
    const { rows: capRows } = await pool.query(
      `SELECT COUNT(*)::int AS sent_count
       FROM notification_events
       WHERE recipient_account_id = $1
         AND event_type = 'nearby_listing'
         AND created_at >= date_trunc('day', now())`,
      [String(recipientAccountId)]
    );
    const sentCount = Number(capRows[0]?.sent_count || 0);
    const maxPerDay = Math.max(1, Number(pref.max_nearby_per_day || 5));
    if (sentCount >= maxPerDay) return false;
  }

  return true;
}

async function markPushTokensInvalid(tokens = []) {
  if (!dbEnabled || !pool || !tokens.length) return;
  await ensureNotificationSchema();
  await pool.query(
    `UPDATE push_tokens
     SET enabled = false,
         invalidated_at = now(),
         updated_at = now()
     WHERE token = ANY($1::text[])`,
    [tokens]
  );
}

async function sendPushToAccount({ recipientAccountId, eventType, title, body, data = {} }) {
  if (!dbEnabled || !pool) return { attempted: false, sent: false, reason: 'db-disabled' };
  if (!initializeFirebaseAdmin()) return { attempted: false, sent: false, reason: 'fcm-not-configured' };
  await ensureNotificationSchema();

  const tokensResult = await pool.query(
    `SELECT token
     FROM push_tokens
     WHERE account_id = $1
       AND enabled = true
     ORDER BY last_seen_at DESC`,
    [String(recipientAccountId)]
  );
  const tokens = tokensResult.rows.map((row) => row.token).filter(Boolean);
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
    const response = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];
    response.responses.forEach((entry, index) => {
      if (entry.success) return;
      const code = String(entry.error?.code || '');
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        invalidTokens.push(tokens[index]);
      }
    });
    if (invalidTokens.length) await markPushTokensInvalid(invalidTokens);
    return {
      attempted: true,
      sent: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    return { attempted: true, sent: false, reason: error.message || 'push-send-failed' };
  }
}

const buildOpenPath = ({ eventType, listingId, requestId, orderId }) => {
  const type = String(eventType || '');
  if (type === 'new_request' || type === 'request_accepted' || type === 'request_declined' || type === 'karma_required' || type === 'karma_received') {
    return requestId ? `/request/${encodeURIComponent(requestId)}` : '/';
  }
  if (type === 'store_reservation_received' || type === 'reservation_confirmed') {
    return orderId ? `/business/orders?order=${encodeURIComponent(orderId)}` : '/business/orders';
  }
  if (listingId) return `/listing/${encodeURIComponent(listingId)}`;
  return '/';
};

const toFiniteNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const getCoordinatesFromMetadata = (metadata = {}) => {
  const lat = toFiniteNumber(metadata?.location?.latitude ?? metadata?.latitude ?? metadata?.lat);
  const lng = toFiniteNumber(metadata?.location?.longitude ?? metadata?.longitude ?? metadata?.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const haversineKm = (from, to) => {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
};

async function getNearbyRecipients({ actorAccountId, origin, radiusKm = 2 }) {
  if (!dbEnabled || !pool) return [];
  await ensureNotificationSchema();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (account_id) account_id, metadata
     FROM push_tokens
     WHERE enabled = true
       AND account_id <> $1
     ORDER BY account_id, last_seen_at DESC`,
    [String(actorAccountId || '')]
  );

  return rows
    .map((row) => {
      const coordinates = getCoordinatesFromMetadata(parseJsonValue(row.metadata, {}));
      if (!coordinates) return null;
      const distanceKm = haversineKm(origin, coordinates);
      if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return null;
      return {
        accountId: String(row.account_id),
        distanceKm,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.distanceKm - second.distanceKm);
}

async function createNotificationEvent({ eventType, recipientAccountId, actorAccountId = '', listingId = '', requestId = '', orderId = '', title = '', body = '', payload = {}, dedupeKey = '' }) {
  if (!dbEnabled || !pool) {
    return { accepted: false, reason: 'db-disabled' };
  }
  await ensureNotificationSchema();
  const deliver = await shouldDeliverEventToRecipient({ recipientAccountId, actorAccountId, eventType });
  if (!deliver) return { accepted: false, skipped: true, reason: 'preference-or-cap' };

  const eventId = crypto.randomUUID();
  const openPath = buildOpenPath({ eventType, listingId, requestId, orderId });
  const payloadWithPath = { ...payload, openPath };

  let inserted = true;
  try {
    await pool.query(
      `INSERT INTO notification_events (
         id,
         event_type,
         recipient_account_id,
         actor_account_id,
         listing_id,
         request_id,
         order_id,
         dedupe_key,
         payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        eventId,
        String(eventType),
        String(recipientAccountId),
        String(actorAccountId || ''),
        listingId || null,
        requestId || null,
        orderId || null,
        dedupeKey || null,
        payloadWithPath,
      ]
    );
  } catch (error) {
    const duplicate = String(error?.code || '') === '23505';
    if (!duplicate) throw error;
    inserted = false;
  }

  if (!inserted) {
    return { accepted: true, deduped: true };
  }

  await pool.query(
    `INSERT INTO app_notifications (
      id,
      recipient_account_id,
      actor_account_id,
      event_type,
      listing_id,
      request_id,
      order_id,
      title,
      body,
      payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      eventId,
      String(recipientAccountId),
      String(actorAccountId || ''),
      String(eventType),
      listingId || null,
      requestId || null,
      orderId || null,
      String(title || 'Drizn update'),
      String(body || ''),
      payloadWithPath,
    ]
  );

  const push = await sendPushToAccount({
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
      openPath,
    },
  });

  await pool.query(
    `UPDATE notification_events
     SET push_attempted = $2,
         push_sent = $3,
         push_error = $4
     WHERE id = $1`,
    [
      eventId,
      Boolean(push.attempted),
      Boolean(push.sent),
      push.sent ? null : (push.reason || null),
    ]
  );

  return {
    accepted: true,
    id: eventId,
    push,
    openPath,
  };
}

async function fetchListingsViaSupabase() {
  if (!canUseSupabaseTable()) return null;
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .in('status', ['active', 'available', 'live', 'requested', 'reserved'])
    .gt('available_quantity', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const notExpired = (row) => {
    if (!row.expiry_date) return true;
    const expiryDate = String(row.expiry_date).slice(0, 10);
    const expiryTime = String(row.expiry_time || '23:59').slice(0, 5);
    const expiryTs = new Date(`${expiryDate}T${expiryTime}:00`).getTime();
    return Number.isFinite(expiryTs) ? expiryTs > Date.now() : true;
  };

  return (data || [])
    .filter((row) => !isTestListingRow(row))
    .filter((row) => !['sold_out', 'expired', 'removed', 'hidden', 'deleted', 'inactive'].includes(String(row.status || '').toLowerCase()))
    .filter((row) => Number(row.available_quantity || 0) > 0)
    .filter(notExpired)
    .sort((a, b) => {
      const nowDate = new Date().toISOString().slice(0, 10);
      const aRescue = a.expiry_date && String(a.expiry_date).slice(0, 10) <= nowDate ? 0 : 1;
      const bRescue = b.expiry_date && String(b.expiry_date).slice(0, 10) <= nowDate ? 0 : 1;
      if (aRescue !== bRescue) return aRescue - bRescue;
      if (a.seller_type !== b.seller_type) return a.seller_type === 'business' ? -1 : 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    })
    .map(listingRowToClient);
}

async function reserveListingViaSupabase(listingId, quantity = 1) {
  if (!canUseSupabaseTable()) return null;
  const reserveQty = Math.max(1, Number(quantity || 1));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) {
      const notFound = new Error('This item is no longer available.');
      notFound.status = 404;
      throw notFound;
    }

    const row = current.data;
    const status = String(row.status || '').toLowerCase();
    if (['sold_out', 'expired', 'removed', 'hidden', 'deleted', 'inactive'].includes(status)) {
      const unavailable = new Error('This item is no longer available.');
      unavailable.status = 409;
      throw unavailable;
    }
    const available = Number(row.available_quantity || 0);
    if (available < reserveQty) {
      const soldOut = new Error('This item is no longer available.');
      soldOut.status = 409;
      throw soldOut;
    }

    const expiryDate = row.expiry_date ? String(row.expiry_date).slice(0, 10) : '';
    const expiryTime = String(row.expiry_time || '23:59').slice(0, 5);
    if (expiryDate) {
      const expiryTs = new Date(`${expiryDate}T${expiryTime}:00`).getTime();
      if (Number.isFinite(expiryTs) && expiryTs <= Date.now()) {
        const expired = new Error('This item is expired and no longer available.');
        expired.status = 409;
        throw expired;
      }
    }

    const nextAvailable = Math.max(0, available - reserveQty);
    const nextReserved = Math.max(0, Number(row.reserved_quantity || 0) + reserveQty);
    const nextStatus = nextAvailable === 0 ? 'sold_out' : row.status;
    const updatedAt = row.updated_at;

    const update = await supabase
      .from('listings')
      .update({
        available_quantity: nextAvailable,
        reserved_quantity: nextReserved,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('updated_at', updatedAt)
      .select('*')
      .maybeSingle();

    if (!update.error && update.data) return listingRowToClient(update.data);
  }

  const race = new Error('This item was just claimed by someone else.');
  race.status = 409;
  throw race;
}

async function reserveListingViaDb(listingId, quantity = 1) {
  if (!dbEnabled || !pool) return null;
  const reserveQty = Math.max(1, Number(quantity || 1));
  const result = await pool.query(
    `UPDATE listings
     SET available_quantity = available_quantity - $2,
         reserved_quantity = reserved_quantity + $2,
         status = CASE WHEN available_quantity - $2 <= 0 THEN 'sold_out' ELSE status END,
         updated_at = now()
     WHERE id = $1
       AND status NOT IN ('sold_out','expired','removed','hidden','deleted','inactive')
       AND available_quantity >= $2
       AND (
         expiry_date IS NULL
         OR (expiry_date + COALESCE(NULLIF(expiry_time,''), '23:59')::time) > now()
       )
     RETURNING *`,
    [listingId, reserveQty]
  );

  if (!result.rows[0]) {
    const unavailable = new Error('This item is no longer available.');
    unavailable.status = 409;
    throw unavailable;
  }
  return listingRowToClient(result.rows[0]);
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

function isDuplicateKeyError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

function normalizeRequestLifecycleStatus(input = '') {
  return String(input || '').trim().toLowerCase();
}

function isKarmaAllowedForRequestStatus(input = '') {
  const status = normalizeRequestLifecycleStatus(input);
  return status === 'handed_over' || status === 'karma_pending' || status === 'completed';
}

function createStableKarmaEventId(requestId = '') {
  const digest = crypto.createHash('sha256').update(String(requestId || '').trim()).digest('hex').slice(0, 24);
  return `karma_${digest}`;
}

async function computeCanonicalKarmaViaSupabase(receiverId) {
  const rows = await supabase
    .from('karma_events')
    .select('points')
    .eq('receiver_id', receiverId);
  if (rows.error) throw rows.error;
  return (rows.data || []).reduce((sum, row) => sum + (Number(row?.points || 0) || 0), 0);
}

async function computeCanonicalKarmaViaDb(receiverId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(points), 0)::int AS karma
       FROM karma_events
      WHERE receiver_id = $1`,
    [String(receiverId)]
  );
  return Number(result.rows[0]?.karma || 0) || 0;
}

async function syncCanonicalKarmaReadModelsViaSupabase({ sellerId, canonicalKarma, listingId = '' }) {
  if (!canUseSupabaseTable()) return [];
  const normalizedKarma = Math.max(0, Number(canonicalKarma || 0));
  const now = new Date().toISOString();

  await supabase
    .from('profiles')
    .upsert({ id: String(sellerId), karma: normalizedKarma, updated_at: now }, { onConflict: 'id' });

  const listingRows = await supabase
    .from('listings')
    .select('*')
    .or(`seller_id.eq.${String(sellerId)},business_id.eq.${String(sellerId)}`);
  if (listingRows.error) throw listingRows.error;

  const rowsById = new Map((listingRows.data || []).map((row) => [String(row.id), row]));
  if (listingId && !rowsById.has(String(listingId))) {
    const single = await supabase
      .from('listings')
      .select('*')
      .eq('id', String(listingId))
      .maybeSingle();
    if (!single.error && single.data) rowsById.set(String(single.data.id), single.data);
  }

  const updatedRows = [];
  for (const row of rowsById.values()) {
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
    const updated = await supabase
      .from('listings')
      .update({ karma_score: normalizedKarma, metadata: nextMetadata, updated_at: now })
      .eq('id', row.id)
      .select('*')
      .single();
    if (!updated.error && updated.data) {
      updatedRows.push(listingRowToClient(updated.data));
    }
  }
  return updatedRows;
}

async function syncCanonicalKarmaReadModelsViaDb({ sellerId, canonicalKarma, listingId = '' }) {
  if (!dbEnabled || !pool) return [];
  const normalizedKarma = Math.max(0, Number(canonicalKarma || 0));
  const updatedRows = [];

  await pool.query('UPDATE users SET karma = $1 WHERE id::text = $2', [normalizedKarma, String(sellerId)]);
  await pool.query(
    `INSERT INTO profiles (id, karma, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET karma = EXCLUDED.karma, updated_at = now()`,
    [String(sellerId), normalizedKarma]
  );

  const listingRows = await pool.query(
    `SELECT *
       FROM listings
      WHERE seller_id = $1
         OR business_id = $1
         OR ($2 <> '' AND id = $2)`,
    [String(sellerId), String(listingId || '')]
  );

  for (const row of listingRows.rows || []) {
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
    const updated = await pool.query(
      `UPDATE listings
          SET karma_score = $2,
              metadata = $3,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [row.id, normalizedKarma, JSON.stringify(nextMetadata)]
    );
    if (updated.rows[0]) updatedRows.push(listingRowToClient(updated.rows[0]));
  }
  return updatedRows;
}

async function awardCommunityKarmaViaSupabase({ sellerId, buyerId, requestId, listingId = '', note = '' }) {
  if (!canUseSupabaseTable()) return { code: 'KARMA_NOT_AVAILABLE', sellerId, karma: 0, listings: [] };
  const eventId = createStableKarmaEventId(requestId);
  let inserted = false;
  try {
    const created = await supabase
      .from('karma_events')
      .insert({
        id: eventId,
        giver_id: String(buyerId || ''),
        receiver_id: String(sellerId || ''),
        listing_id: listingId || null,
        order_id: String(requestId || ''),
        request_id: String(requestId || ''),
        points: 1,
        note: String(note || '').trim() || null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (created.error) throw created.error;
    inserted = true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const canonicalKarma = await computeCanonicalKarmaViaSupabase(String(sellerId || ''));
  const listings = await syncCanonicalKarmaReadModelsViaSupabase({
    sellerId: String(sellerId || ''),
    canonicalKarma,
    listingId: String(listingId || ''),
  });
  return {
    code: inserted ? 'KARMA_SUBMITTED' : 'KARMA_ALREADY_SUBMITTED',
    sellerId: String(sellerId || ''),
    karma: canonicalKarma,
    listings,
  };
}

async function awardCommunityKarmaViaDb({ sellerId, buyerId, requestId, listingId = '', note = '' }) {
  if (!dbEnabled || !pool) return { code: 'KARMA_NOT_AVAILABLE', sellerId, karma: 0, listings: [] };
  const client = await pool.connect();
  let resolvedSellerId = String(sellerId || '').trim();
  let inserted = false;
  let requestRow = null;
  let canonicalKarma = 0;
  try {
    await client.query('BEGIN');
    const requestResult = await client.query('SELECT * FROM requests WHERE id = $1 LIMIT 1', [String(requestId)]);
    requestRow = requestResult.rows[0] || null;

    if (requestRow) {
      const requestStatus = normalizeRequestLifecycleStatus(requestRow.status);
      if (!isKarmaAllowedForRequestStatus(requestStatus)) {
        const error = new Error('Good Karma is only available after handover.');
        error.status = 409;
        throw error;
      }
      resolvedSellerId = String(requestRow.seller_id || resolvedSellerId).trim();
      if (String(requestRow.buyer_id || '').trim() && String(requestRow.buyer_id || '').trim() !== String(buyerId || '').trim()) {
        const error = new Error('Only the receiving buyer can submit Good Karma for this request.');
        error.status = 403;
        throw error;
      }
    }

    if (!resolvedSellerId) {
      const error = new Error('sellerId is required');
      error.status = 400;
      throw error;
    }

    const eventId = createStableKarmaEventId(requestId);
    const insertedEvent = await client.query(
      `INSERT INTO karma_events (id, giver_id, receiver_id, listing_id, order_id, request_id, points, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING id`,
      [
        eventId,
        String(buyerId || ''),
        resolvedSellerId,
        String(listingId || requestRow?.listing_id || '') || null,
        String(requestId),
        String(requestId),
        1,
        String(note || '').trim() || null,
      ]
    );
    inserted = Boolean(insertedEvent.rows[0]);

    const karmaResult = await client.query(
      `SELECT COALESCE(SUM(points), 0)::int AS karma
         FROM karma_events
        WHERE receiver_id = $1`,
      [resolvedSellerId]
    );
    canonicalKarma = Number(karmaResult.rows[0]?.karma || 0) || 0;

    if (requestRow && normalizeRequestLifecycleStatus(requestRow.status) !== 'completed') {
      const currentDetails = parseJsonValue(requestRow.details, {});
      const nextDetails = {
        ...currentDetails,
        karmaGiven: true,
        karmaSubmittedAt: new Date().toISOString(),
      };
      await client.query(
        `UPDATE requests
            SET status = 'completed',
                details = $2,
                updated_at = now()
          WHERE id = $1`,
        [String(requestId), JSON.stringify(nextDetails)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }

  const listings = await syncCanonicalKarmaReadModelsViaDb({
    sellerId: resolvedSellerId,
    canonicalKarma,
    listingId: String(listingId || requestRow?.listing_id || ''),
  });

  return {
    code: inserted ? 'KARMA_SUBMITTED' : 'KARMA_ALREADY_SUBMITTED',
    sellerId: resolvedSellerId,
    karma: canonicalKarma,
    listings,
  };
}

const MSG91_TIMEOUT_MS = 15000;
const MSG91_MAX_ATTEMPTS = 2;
const MSG91_RETRY_DELAY_MS = 350;

function normalizeIndianMobile(input = '') {
  const digits = String(input || '').replace(/\D/g, '');
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  return '';
}

function normalizePhoneDigits(input = '') {
  const mobile = normalizeIndianMobile(input);
  return mobile ? mobile.slice(-10) : '';
}

function normalizeAuthAccountType(input = '') {
  const value = String(input || '').trim().toLowerCase();
  return value === 'business' || value === 'store' ? 'business' : 'personal';
}

function getPhoneCandidates(phoneDigits = '') {
  if (!/^\d{10}$/.test(String(phoneDigits || ''))) return [];
  return [String(phoneDigits), `91${String(phoneDigits)}`];
}

async function findUserByNormalizedPhone(client, phoneDigits, accountType = 'personal') {
  const normalized = normalizePhoneDigits(phoneDigits);
  if (!normalized) return null;
  const normalizedAccountType = normalizeAuthAccountType(accountType);
  const result = await client.query(
    `SELECT *
       FROM users
      WHERE (
            phone = ANY($1::text[])
            OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2
          )
        AND COALESCE(account_type, 'personal') = $3
      ORDER BY id ASC
      LIMIT 1`,
    [getPhoneCandidates(normalized), normalized, normalizedAccountType]
  );
  return result.rows[0] || null;
}

async function isPhoneInUseByAnotherUser(client, phoneDigits, excludeUserId, accountType = 'personal') {
  const normalized = normalizePhoneDigits(phoneDigits);
  if (!normalized) return false;
  const normalizedAccountType = normalizeAuthAccountType(accountType);
  const result = await client.query(
    `SELECT id
       FROM users
      WHERE id <> $3
        AND COALESCE(account_type, 'personal') = $4
        AND (
          phone = ANY($1::text[])
          OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2
        )
      LIMIT 1`,
    [getPhoneCandidates(normalized), normalized, excludeUserId, normalizedAccountType]
  );
  return Boolean(result.rows[0]);
}

function isMsg91TransientError(error) {
  if (!error) return false;
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return name === 'aborterror'
    || name === 'timeouterror'
    || /aborted|timed out|timeout|network|fetch failed|socket|econnreset|econnrefused|enotfound|eai_again/.test(message);
}

function isMsg91TransientResponse(response) {
  const status = Number(response?.status || 0);
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withMsg91Retry(operationName, execute, details = {}) {
  let lastError = null;
  let lastResult = null;
  for (let attempt = 1; attempt <= MSG91_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await execute();
      lastResult = result;
      if (attempt < MSG91_MAX_ATTEMPTS && isMsg91TransientResponse(result?.response)) {
        console.warn('[MSG91] transient provider response, retrying', {
          operation: operationName,
          attempt,
          status: Number(result?.response?.status || 0),
          ...details,
        });
        await waitMs(MSG91_RETRY_DELAY_MS);
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MSG91_MAX_ATTEMPTS && isMsg91TransientError(error)) {
        console.warn('[MSG91] transient provider error, retrying', {
          operation: operationName,
          attempt,
          message: String(error?.message || error),
          ...details,
        });
        await waitMs(MSG91_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
  if (lastResult) return lastResult;
  throw lastError || new Error('MSG91 request failed');
}

async function parseProviderBody(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

function safePhoneLast4(input = '') {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.slice(-4);
}

async function logSecurityAuditEvent({ req, userId = null, eventType, status = 'info', phone = '', metadata = {} }) {
  if (!dbEnabled || !pool || !eventType) return;
  try {
    await pool.query(
      `INSERT INTO security_audit_events (user_id, event_type, status, phone_last4, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        userId ? Number(userId) : null,
        String(eventType),
        String(status || 'info'),
        safePhoneLast4(phone),
        getClientIp(req),
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (error) {
    console.warn('[audit] failed to persist security event', {
      eventType,
      status,
      message: String(error?.message || error),
    });
  }
}

function requireMsg91Config(res) {
  const authKey = String(process.env.MSG91_AUTH_KEY || '').trim();
  const templateId = String(process.env.MSG91_TEMPLATE_ID || '').trim();
  if (!authKey || !templateId) {
    res.status(503).json({
      error: 'OTP service is not configured',
      code: 'MSG91_NOT_CONFIGURED',
    });
    return null;
  }
  return { authKey, templateId };
}

async function sendMsg91Otp({ authKey, templateId, mobile }) {
  const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobile)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
  });
  const body = await parseProviderBody(response);
  return { response, body, url };
}

async function verifyMsg91Otp({ authKey, mobile, otp }) {
  const url = `https://control.msg91.com/api/v5/otp/verify?mobile=${encodeURIComponent(mobile)}&otp=${encodeURIComponent(String(otp || '').trim())}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
  });
  const body = await parseProviderBody(response);
  return { response, body, url };
}

async function resendMsg91Otp({ authKey, mobile, retryType = 'text' }) {
  const normalizedRetryType = ['text', 'voice'].includes(String(retryType || '').toLowerCase())
    ? String(retryType).toLowerCase()
    : 'text';
  const url = `https://control.msg91.com/api/v5/otp/retry?mobile=${encodeURIComponent(mobile)}&retrytype=${encodeURIComponent(normalizedRetryType)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
  });
  const body = await parseProviderBody(response);
  return { response, body, url };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Send OTP via MSG91
app.post(['/api/auth/send-otp', '/api/send-otp'], otpSendRateLimit, async (req, res) => {
  const { phone, accountType } = req.body || {};
  const mobile = normalizeIndianMobile(phone);
  const normalizedAccountType = normalizeAuthAccountType(accountType);
  if (!mobile) {
    return res.status(400).json({ error: 'Valid Indian mobile number required' });
  }

  const config = requireMsg91Config(res);
  if (!config) return;

  try {
    const { response, body, url } = await withMsg91Retry('send-otp', () => sendMsg91Otp({
      authKey: config.authKey,
      templateId: config.templateId,
      mobile,
    }), {
      mobile,
      accountType: normalizedAccountType,
    });
    if (response.ok && String(body?.type || '').toLowerCase() === 'success') {
      console.info('[MSG91] send otp success', {
        status: response.status,
        url,
        type: body?.type,
        message: body?.message,
        requestId: body?.request_id || body?.requestId || null,
      });
      return res.json({
        success: true,
        mobile,
        accountType: normalizedAccountType,
        providerType: body?.type || 'success',
        providerMessage: body?.message || '',
        requestId: body?.request_id || body?.requestId || null,
      });
    }

    console.error('[MSG91] send otp failed', { status: response.status, url, body });
    return res.status(502).json({
      error: body?.message || body?.error || 'MSG91 send OTP failed',
      providerStatus: response.status,
      providerBody: body,
    });
  } catch (error) {
    const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
    console.error('[MSG91] send otp error', {
      mobile,
      message: String(error?.message || error),
      timedOut,
    });
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'OTP provider timeout while sending OTP' : 'Failed to send OTP',
    });
  }
});

// Resend OTP via MSG91
app.post('/api/auth/resend-otp', otpSendRateLimit, async (req, res) => {
  const { phone, retryType, accountType } = req.body || {};
  const mobile = normalizeIndianMobile(phone);
  const normalizedAccountType = normalizeAuthAccountType(accountType);
  if (!mobile) {
    return res.status(400).json({ error: 'Valid Indian mobile number required' });
  }

  const config = requireMsg91Config(res);
  if (!config) return;

  try {
    const { response, body, url } = await withMsg91Retry('resend-otp', () => resendMsg91Otp({
      authKey: config.authKey,
      mobile,
      retryType,
    }), {
      mobile,
      accountType: normalizedAccountType,
    });
    if (response.ok && String(body?.type || '').toLowerCase() === 'success') {
      console.info('[MSG91] resend otp success', {
        status: response.status,
        url,
        type: body?.type,
        message: body?.message,
        requestId: body?.request_id || body?.requestId || null,
      });
      return res.json({
        success: true,
        mobile,
        accountType: normalizedAccountType,
        providerType: body?.type || 'success',
        providerMessage: body?.message || '',
        requestId: body?.request_id || body?.requestId || null,
      });
    }

    console.error('[MSG91] resend otp failed', { status: response.status, url, body });
    return res.status(502).json({
      error: body?.message || body?.error || 'MSG91 resend OTP failed',
      providerStatus: response.status,
      providerBody: body,
    });
  } catch (error) {
    const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
    console.error('[MSG91] resend otp error', {
      mobile,
      message: String(error?.message || error),
      timedOut,
    });
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'OTP provider timeout while resending OTP' : 'Failed to resend OTP',
    });
  }
});

// Verify OTP and create session
app.post(['/api/auth/verify-otp', '/api/verify-otp'], otpVerifyRateLimit, async (req, res) => {
  const { phone, otp, accountType } = req.body || {};
  const mobile = normalizeIndianMobile(phone);
  const normalizedAccountType = normalizeAuthAccountType(accountType);
  if (!mobile || !/^\d{4}$/.test(String(otp || '').trim())) {
    return res.status(400).json({ error: 'Valid mobile number and 4-digit OTP are required' });
  }

  const config = requireMsg91Config(res);
  if (!config) return;

  try {
    const { response, body, url } = await withMsg91Retry('verify-otp', () => verifyMsg91Otp({
      authKey: config.authKey,
      mobile,
      otp,
    }), {
      mobile,
      accountType: normalizedAccountType,
    });

    if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
      console.error('[MSG91] verify otp failed', { status: response.status, url, body });
      return res.status(400).json({
        error: body?.message || body?.error || 'Incorrect OTP',
        providerStatus: response.status,
        providerBody: body,
      });
    }

    const phoneDigits = normalizePhoneDigits(mobile);
    let user;
    if (dbEnabled) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await findUserByNormalizedPhone(client, phoneDigits, normalizedAccountType);
        if (existing) {
          let normalizedExisting = existing;
          if (existing.phone !== phoneDigits) {
            try {
              const normalized = await client.query(
                `UPDATE users
                    SET phone = $1,
                        account_type = $3
                  WHERE id = $2
                  RETURNING *`,
                [phoneDigits, existing.id, normalizedAccountType]
              );
              normalizedExisting = normalized.rows[0] || existing;
            } catch (error) {
              if (error?.code !== '23505') throw error;
              const canonical = await client.query(
                `SELECT *
                   FROM users
                  WHERE phone = $1
                    AND COALESCE(account_type, 'personal') = $2
                  ORDER BY id ASC
                  LIMIT 1`,
                [phoneDigits, normalizedAccountType]
              );
              normalizedExisting = canonical.rows[0] || existing;
            }
          }
          user = normalizedExisting;
        } else {
          const inserted = await client.query(
            `INSERT INTO users (phone, account_type) VALUES ($1, $2)
             RETURNING *`,
            [phoneDigits, normalizedAccountType]
          );
          user = inserted.rows[0] || null;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      user = await normalizeExpiredBuyerAccess(user?.id, user);
    } else {
      user = {
        id: `demo_${normalizedAccountType}_${phoneDigits}`,
        phone: phoneDigits,
        account_type: normalizedAccountType,
        name: 'Unknown',
        initials: 'UN',
        mode: 'seller',
        is_buyer: false,
        karma: 0,
        credits: 0,
        vouchers: 0,
        has_seen_tour: false,
      };
    }

    const token = jwt.sign({ id: user.id, phone: phoneDigits, accountType: normalizeAuthAccountType(user?.account_type || normalizedAccountType) }, JWT_SECRET, { expiresIn: '90d' });
    console.info('[MSG91] verify otp success', {
      status: response.status,
      url,
      type: body?.type,
      message: body?.message,
      requestId: body?.request_id || body?.requestId || null,
      userId: user.id,
    });
    return res.json({
      success: true,
      token,
      requestId: body?.request_id || body?.requestId || null,
      user: {
        ...user,
        ...serializeUserBuyerAccess(user),
      },
    });
  } catch (error) {
    const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
    console.error('[MSG91] verify otp error', {
      mobile,
      message: String(error?.message || error),
      timedOut,
    });
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'OTP provider timeout while verifying OTP' : 'OTP verification failed',
    });
  }
});

app.post('/api/profile/phone-change/initiate', authMiddleware, otpSendRateLimit, async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ error: 'Phone number updates require database access' });
  }

  const { newPhone } = req.body || {};
  const normalizedPhoneDigits = normalizePhoneDigits(newPhone);
  if (!normalizedPhoneDigits) {
    return res.status(400).json({ error: 'Valid Indian mobile number required' });
  }

  const currentUserId = Number(req.user?.id || 0);
  if (!currentUserId) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const config = requireMsg91Config(res);
  if (!config) return;

  const client = await pool.connect();
  try {
    const currentRow = await client.query('SELECT phone, account_type FROM users WHERE id = $1 LIMIT 1', [currentUserId]);
    const currentPhoneDigits = normalizePhoneDigits(currentRow.rows[0]?.phone || '');
    const currentAccountType = normalizeAuthAccountType(currentRow.rows[0]?.account_type || req.user?.accountType || 'personal');
    if (currentPhoneDigits && currentPhoneDigits === normalizedPhoneDigits) {
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_initiate',
        status: 'rejected_same_number',
        phone: normalizedPhoneDigits,
      });
      return res.status(400).json({ error: 'New phone number must be different from current number' });
    }

    const alreadyUsed = await isPhoneInUseByAnotherUser(client, normalizedPhoneDigits, currentUserId, currentAccountType);
    if (alreadyUsed) {
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_initiate',
        status: 'rejected_phone_in_use',
        phone: normalizedPhoneDigits,
      });
      return res.status(409).json({ error: 'This phone number is already linked to another account' });
    }

    const mobile = `91${normalizedPhoneDigits}`;
    const { response, body, url } = await sendMsg91Otp({
      authKey: config.authKey,
      templateId: config.templateId,
      mobile,
    });

    if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
      console.error('[MSG91] phone change send otp failed', { status: response.status, url, userId: currentUserId, body });
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_initiate',
        status: 'provider_failed',
        phone: normalizedPhoneDigits,
        metadata: {
          providerStatus: response.status,
          providerType: body?.type || null,
          requestId: body?.request_id || body?.requestId || null,
        },
      });
      return res.status(502).json({
        error: body?.message || body?.error || 'Could not send OTP for phone change',
        providerStatus: response.status,
      });
    }

    const expiresAt = new Date(Date.now() + (10 * 60 * 1000));
    await client.query('BEGIN');
    await client.query(
      `UPDATE phone_change_requests
          SET status = 'replaced',
              updated_at = now()
        WHERE user_id = $1
          AND status = 'pending'`,
      [currentUserId]
    );
    await client.query(
      `INSERT INTO phone_change_requests (user_id, new_phone, request_id, status, attempt_count, expires_at, updated_at)
       VALUES ($1, $2, $3, 'pending', 0, $4, now())`,
      [
        currentUserId,
        normalizedPhoneDigits,
        body?.request_id || body?.requestId || null,
        expiresAt.toISOString(),
      ]
    );
    await client.query('COMMIT');

    await logSecurityAuditEvent({
      req,
      userId: currentUserId,
      eventType: 'phone_change_initiate',
      status: 'otp_sent',
      phone: normalizedPhoneDigits,
      metadata: {
        requestId: body?.request_id || body?.requestId || null,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return res.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      requestId: body?.request_id || body?.requestId || null,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
    await logSecurityAuditEvent({
      req,
      userId: currentUserId,
      eventType: 'phone_change_initiate',
      status: timedOut ? 'provider_timeout' : 'error',
      phone: normalizedPhoneDigits,
      metadata: {
        message: String(error?.message || error),
      },
    });
    console.error('[phone-change] initiate failed', {
      userId: currentUserId,
      message: String(error?.message || error),
      timedOut,
    });
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'OTP provider timeout while sending OTP' : 'Failed to start phone number change',
    });
  } finally {
    client.release();
  }
});

app.post('/api/profile/phone-change/confirm', authMiddleware, otpVerifyRateLimit, async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ error: 'Phone number updates require database access' });
  }

  const { newPhone, otp } = req.body || {};
  const normalizedPhoneDigits = normalizePhoneDigits(newPhone);
  const normalizedOtp = String(otp || '').trim();
  if (!normalizedPhoneDigits || !/^\d{4}$/.test(normalizedOtp)) {
    return res.status(400).json({ error: 'Valid mobile number and 4-digit OTP are required' });
  }

  const currentUserId = Number(req.user?.id || 0);
  if (!currentUserId) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const config = requireMsg91Config(res);
  if (!config) return;

  const client = await pool.connect();
  try {
    const currentUser = await client.query('SELECT account_type FROM users WHERE id = $1 LIMIT 1', [currentUserId]);
    const currentAccountType = normalizeAuthAccountType(currentUser.rows[0]?.account_type || req.user?.accountType || 'personal');

    const pending = await client.query(
      `SELECT *
         FROM phone_change_requests
        WHERE user_id = $1
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
      [currentUserId]
    );
    const pendingRow = pending.rows[0] || null;
    if (!pendingRow) {
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'rejected_no_pending',
        phone: normalizedPhoneDigits,
      });
      return res.status(404).json({ error: 'No pending phone change request found' });
    }

    if (normalizePhoneDigits(pendingRow.new_phone) !== normalizedPhoneDigits) {
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'rejected_phone_mismatch',
        phone: normalizedPhoneDigits,
      });
      return res.status(400).json({ error: 'Phone number does not match pending request' });
    }

    if (new Date(pendingRow.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE phone_change_requests
            SET status = 'expired', updated_at = now()
          WHERE id = $1`,
        [pendingRow.id]
      );
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'otp_expired',
        phone: normalizedPhoneDigits,
      });
      return res.status(410).json({ error: 'Phone change OTP has expired. Please request a new OTP.' });
    }

    const mobile = `91${normalizedPhoneDigits}`;
    const { response, body, url } = await withMsg91Retry('phone-change-verify-otp', () => verifyMsg91Otp({
      authKey: config.authKey,
      mobile,
      otp: normalizedOtp,
    }), {
      mobile,
      accountType: currentAccountType,
    });

    if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
      await client.query(
        `UPDATE phone_change_requests
            SET attempt_count = attempt_count + 1,
                updated_at = now()
          WHERE id = $1`,
        [pendingRow.id]
      );
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'otp_failed',
        phone: normalizedPhoneDigits,
        metadata: {
          providerStatus: response.status,
          providerType: body?.type || null,
          requestId: body?.request_id || body?.requestId || null,
        },
      });
      console.warn('[phone-change] otp verify failed', {
        userId: currentUserId,
        requestId: pendingRow.id,
        status: response.status,
        url,
      });
      return res.status(400).json({
        error: body?.message || body?.error || 'Incorrect OTP',
        providerStatus: response.status,
      });
    }

    let user = null;
    await client.query('BEGIN');
    const lockedRequest = await client.query(
      `SELECT *
         FROM phone_change_requests
        WHERE id = $1
          AND user_id = $2
          AND status = 'pending'
        FOR UPDATE`,
      [pendingRow.id, currentUserId]
    );
    const lockedRow = lockedRequest.rows[0] || null;
    if (!lockedRow) {
      await client.query('ROLLBACK');
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'rejected_inactive_request',
        phone: normalizedPhoneDigits,
      });
      return res.status(409).json({ error: 'Phone change request is no longer active' });
    }

    if (new Date(lockedRow.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE phone_change_requests
            SET status = 'expired', updated_at = now()
          WHERE id = $1`,
        [lockedRow.id]
      );
      await client.query('COMMIT');
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'otp_expired',
        phone: normalizedPhoneDigits,
      });
      return res.status(410).json({ error: 'Phone change OTP has expired. Please request a new OTP.' });
    }

    const alreadyUsed = await isPhoneInUseByAnotherUser(client, normalizedPhoneDigits, currentUserId, currentAccountType);
    if (alreadyUsed) {
      await client.query('ROLLBACK');
      await logSecurityAuditEvent({
        req,
        userId: currentUserId,
        eventType: 'phone_change_confirm',
        status: 'rejected_phone_in_use',
        phone: normalizedPhoneDigits,
      });
      return res.status(409).json({ error: 'This phone number is already linked to another account' });
    }

    try {
      const updated = await client.query(
        `UPDATE users
            SET phone = $1
          WHERE id = $2
          RETURNING *`,
        [normalizedPhoneDigits, currentUserId]
      );
      user = updated.rows[0] || null;
    } catch (error) {
      if (error?.code === '23505') {
        await client.query('ROLLBACK');
        await logSecurityAuditEvent({
          req,
          userId: currentUserId,
          eventType: 'phone_change_confirm',
          status: 'rejected_phone_in_use',
          phone: normalizedPhoneDigits,
        });
        return res.status(409).json({ error: 'This phone number is already linked to another account' });
      }
      throw error;
    }

    await client.query(
      `UPDATE phone_change_requests
          SET status = 'verified',
              verified_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [lockedRow.id]
    );
    await client.query('COMMIT');

    await logSecurityAuditEvent({
      req,
      userId: currentUserId,
      eventType: 'phone_change_confirm',
      status: 'success',
      phone: normalizedPhoneDigits,
      metadata: {
        requestRowId: lockedRow.id,
      },
    });

    user = await normalizeExpiredBuyerAccess(user?.id, user);
    const token = jwt.sign({ id: user.id, phone: normalizedPhoneDigits, accountType: normalizeAuthAccountType(user?.account_type || req.user?.accountType || 'personal') }, JWT_SECRET, { expiresIn: '90d' });
    return res.json({
      success: true,
      token,
      user: {
        ...user,
        ...serializeUserBuyerAccess(user),
      },
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
    await logSecurityAuditEvent({
      req,
      userId: currentUserId,
      eventType: 'phone_change_confirm',
      status: timedOut ? 'provider_timeout' : 'error',
      phone: normalizedPhoneDigits,
      metadata: {
        message: String(error?.message || error),
      },
    });
    console.error('[phone-change] confirm failed', {
      userId: currentUserId,
      message: String(error?.message || error),
      timedOut,
    });
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'OTP provider timeout while verifying OTP' : 'Failed to confirm phone number change',
    });
  } finally {
    client.release();
  }
});

// Get profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  if (!dbEnabled) return res.json({ id: req.user.id, phone: req.user.phone, account_type: normalizeAuthAccountType(req.user?.accountType || 'personal') });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  const row = await normalizeExpiredBuyerAccess(req.user.id, result.rows[0]);
  return res.json({
    ...row,
    ...serializeUserBuyerAccess(row),
  });
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
app.post('/api/listings', authMiddleware, listingMutationRateLimit, async (req, res) => {
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

app.put('/api/listings/:id', authMiddleware, listingMutationRateLimit, async (req, res) => {
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

app.delete('/api/listings/:id', authMiddleware, listingMutationRateLimit, async (req, res) => {
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

app.post('/api/listings/:id/reserve', authMiddleware, listingMutationRateLimit, async (req, res) => {
  try {
    const listingId = String(req.params.id || '').trim();
    if (!listingId) {
      return res.status(400).json({ success: false, error: 'Listing id is required.' });
    }

    const quantity = Math.max(1, Number(req.body?.quantity || 1));

    let listing = null;
    if (canUseSupabaseTable()) {
      listing = await reserveListingViaSupabase(listingId, quantity);
    } else if (dbEnabled && pool) {
      listing = await reserveListingViaDb(listingId, quantity);
    }

    if (!listing) {
      return res.status(503).json({ success: false, error: 'Reservation backend unavailable.' });
    }

    return res.json({ success: true, listing });
  } catch (error) {
    const code = Number(error?.status || 500);
    const safeCode = Number.isFinite(code) && code >= 400 && code < 600 ? code : 500;
    const message = safeCode < 500 ? error.message : 'Unable to reserve listing right now.';
    if (safeCode >= 500) {
      console.error('reserve listing error', error);
    }
    return res.status(safeCode).json({ success: false, error: message });
  }
});

app.post('/api/karma/community', authMiddleware, async (req, res) => {
  const sellerId = String(req.body?.sellerId || '').trim();
  const requestId = String(req.body?.requestId || req.body?.orderId || '').trim();
  const listingId = String(req.body?.listingId || req.body?.itemId || '').trim();
  const buyerId = String(req.body?.buyerId || req.user?.id || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }
  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId is required' });
  }
  try {
    const result = dbEnabled
      ? await awardCommunityKarmaViaDb({ sellerId, buyerId, requestId, listingId, note })
      : await awardCommunityKarmaViaSupabase({ sellerId, buyerId, requestId, listingId, note });
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error('[KARMA] community award failed', error.message || error);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'Could not award community karma' });
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
app.post('/api/upload', authMiddleware, uploadRateLimit, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      return res.status(400).json({ error: 'Only JPG, PNG, WEBP, and GIF images are allowed' });
    }

    // If supabase is configured, upload to storage
    if (supabase) {
      const rawExt = (file.originalname || '').split('.').pop() || 'jpg';
      const ext = String(rawExt).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
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

app.post('/api/notifications/token', authMiddleware, notificationWriteRateLimit, async (req, res) => {
  const { accountId, token, platform = 'web', metadata = {}, enabled = true } = req.body || {};
  const resolvedAccountId = String(req.user?.id || '').trim();
  if (!resolvedAccountId || !token) {
    return res.status(400).json({ error: 'token is required' });
  }
  if (accountId && String(accountId).trim() !== resolvedAccountId) {
    return res.status(403).json({ error: 'Not allowed to set token for another account' });
  }
  if (!dbEnabled || !pool) {
    return res.json({ success: true, persisted: false });
  }
  try {
    await ensureNotificationSchema();
    await pool.query(
      `INSERT INTO push_tokens (account_id, token, platform, enabled, metadata, last_seen_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,now(),now())
       ON CONFLICT (token) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         platform = EXCLUDED.platform,
         enabled = EXCLUDED.enabled,
         metadata = COALESCE(push_tokens.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         invalidated_at = CASE WHEN EXCLUDED.enabled THEN NULL ELSE push_tokens.invalidated_at END,
         last_seen_at = now(),
         updated_at = now()`,
      [resolvedAccountId, token, String(platform || 'web'), Boolean(enabled), metadata || {}]
    );
    return res.json({ success: true, persisted: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] token upsert failed', error.message || error);
    return res.status(500).json({ error: 'Could not register token' });
  }
});

app.post('/api/notifications/token/disable', authMiddleware, notificationWriteRateLimit, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });
  if (!dbEnabled || !pool) return res.json({ success: true, persisted: false });
  try {
    await ensureNotificationSchema();
    await markPushTokensInvalid([String(token)]);
    return res.json({ success: true, persisted: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] token disable failed', error.message || error);
    return res.status(500).json({ error: 'Could not disable token' });
  }
});

app.get('/api/notifications/preferences/:accountId', authMiddleware, async (req, res) => {
  const accountId = String(req.params.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  if (String(req.user?.id || '') !== accountId) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!dbEnabled || !pool) {
    return res.json({
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
    await ensureNotificationSchema();
    const { rows } = await pool.query(
      `SELECT *
       FROM notification_preferences
       WHERE account_id = $1`,
      [accountId]
    );
    const pref = rows[0] || {};
    return res.json({
      accountId,
      transactionalEnabled: pref.transactional_enabled ?? true,
      marketingEnabled: pref.marketing_enabled ?? false,
      nearbyEnabled: pref.nearby_enabled ?? true,
      favouritesEnabled: pref.favourites_enabled ?? true,
      mutedAccountIds: pref.muted_account_ids || [],
      blockedAccountIds: pref.blocked_account_ids || [],
      maxNearbyPerDay: Number(pref.max_nearby_per_day || 5),
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] preferences fetch failed', error.message || error);
    return res.status(500).json({ error: 'Could not fetch preferences' });
  }
});

app.put('/api/notifications/preferences/:accountId', authMiddleware, notificationWriteRateLimit, async (req, res) => {
  const accountId = String(req.params.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  if (String(req.user?.id || '') !== accountId) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!dbEnabled || !pool) return res.json({ success: true, persisted: false });
  const {
    transactionalEnabled = true,
    marketingEnabled = false,
    nearbyEnabled = true,
    favouritesEnabled = true,
    mutedAccountIds = [],
    blockedAccountIds = [],
    maxNearbyPerDay = 5,
  } = req.body || {};
  try {
    await ensureNotificationSchema();
    await pool.query(
      `INSERT INTO notification_preferences (
        account_id,
        transactional_enabled,
        marketing_enabled,
        nearby_enabled,
        favourites_enabled,
        muted_account_ids,
        blocked_account_ids,
        max_nearby_per_day,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (account_id) DO UPDATE SET
        transactional_enabled = EXCLUDED.transactional_enabled,
        marketing_enabled = EXCLUDED.marketing_enabled,
        nearby_enabled = EXCLUDED.nearby_enabled,
        favourites_enabled = EXCLUDED.favourites_enabled,
        muted_account_ids = EXCLUDED.muted_account_ids,
        blocked_account_ids = EXCLUDED.blocked_account_ids,
        max_nearby_per_day = EXCLUDED.max_nearby_per_day,
        updated_at = now()`,
      [
        accountId,
        Boolean(transactionalEnabled),
        Boolean(marketingEnabled),
        Boolean(nearbyEnabled),
        Boolean(favouritesEnabled),
        Array.isArray(mutedAccountIds) ? mutedAccountIds.map((value) => String(value)) : [],
        Array.isArray(blockedAccountIds) ? blockedAccountIds.map((value) => String(value)) : [],
        Math.max(1, Number(maxNearbyPerDay || 5)),
      ]
    );
    return res.json({ success: true, persisted: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] preferences update failed', error.message || error);
    return res.status(500).json({ error: 'Could not update preferences' });
  }
});

app.get('/api/notifications/history/:accountId', authMiddleware, async (req, res) => {
  const accountId = String(req.params.accountId || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  if (String(req.user?.id || '') !== accountId) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!dbEnabled || !pool) return res.json([]);
  try {
    await ensureNotificationSchema();
    const { rows } = await pool.query(
      `SELECT id, event_type, listing_id, request_id, order_id, title, body, payload, read, created_at
       FROM app_notifications
       WHERE recipient_account_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [accountId, limit]
    );
    return res.json(rows);
  } catch (error) {
    console.error('[NOTIFICATIONS] history fetch failed', error.message || error);
    return res.status(500).json({ error: 'Could not fetch history' });
  }
});

app.post('/api/notifications/events', authMiddleware, notificationWriteRateLimit, async (req, res) => {
  const {
    eventType,
    recipientAccountId,
    actorAccountId,
    listingId,
    requestId,
    orderId,
    title,
    body,
    payload,
    dedupeKey,
  } = req.body || {};

  if (!eventType || !recipientAccountId) {
    return res.status(400).json({ error: 'eventType and recipientAccountId are required' });
  }

  if (!dbEnabled || !pool) {
    return res.json({ success: true, persisted: false, push: { attempted: false, sent: false } });
  }

  try {
    const result = await createNotificationEvent({
      eventType,
      recipientAccountId: String(recipientAccountId),
      actorAccountId: String(req.user?.id || ''),
      listingId: listingId ? String(listingId) : '',
      requestId: requestId ? String(requestId) : '',
      orderId: orderId ? String(orderId) : '',
      title: String(title || 'Drizn update'),
      body: String(body || ''),
      payload: payload || {},
      dedupeKey: dedupeKey ? String(dedupeKey) : '',
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFICATIONS] event create failed', error.message || error);
    // Fail-open contract: primary business flows must not fail because push failed.
    return res.json({ success: true, accepted: false, push: { attempted: false, sent: false }, error: String(error.message || error) });
  }
});

app.post('/api/notifications/nearby-listing', authMiddleware, notificationWriteRateLimit, async (req, res) => {
  const {
    actorAccountId,
    listingId,
    title,
    category,
    latitude,
    longitude,
    area,
    city,
    radiusKm = 2,
  } = req.body || {};

  const ownerId = String(req.user?.id || '').trim();
  if (actorAccountId && String(actorAccountId).trim() !== ownerId) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  if (!ownerId || !listingId || lat === null || lng === null) {
    return res.status(400).json({ error: 'actorAccountId, listingId, latitude, and longitude are required' });
  }
  if (!dbEnabled || !pool) {
    return res.json({ success: true, persisted: false, notifiedCount: 0 });
  }

  try {
    const recipients = await getNearbyRecipients({
      actorAccountId: ownerId,
      origin: { lat, lng },
      radiusKm: Math.max(0.5, Math.min(10, Number(radiusKm) || 2)),
    });

    const today = new Date().toISOString().slice(0, 10);
    let notifiedCount = 0;
    for (const recipient of recipients) {
      const result = await createNotificationEvent({
        eventType: 'nearby_listing',
        recipientAccountId: recipient.accountId,
        actorAccountId: ownerId,
        listingId: String(listingId),
        title: 'New nearby listing',
        body: `${String(title || 'A listing')} is available within 2 km${area || city ? ` near ${[area, city].filter(Boolean).join(', ')}` : ''}.`,
        dedupeKey: `nearby_listing:${listingId}:${recipient.accountId}:${today}`,
        payload: {
          category: String(category || ''),
          distanceKm: Number(recipient.distanceKm.toFixed(2)),
          area: String(area || ''),
          city: String(city || ''),
        },
      });
      if (result.accepted && !result.skipped && !result.deduped) notifiedCount += 1;
    }

    return res.json({
      success: true,
      persisted: true,
      candidates: recipients.length,
      notifiedCount,
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] nearby listing dispatch failed', error.message || error);
    // Fail-open: listing creation/update should remain successful.
    return res.json({ success: true, persisted: false, notifiedCount: 0, error: String(error.message || error) });
  }
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

// Buyer access payment flow
app.post(['/api/payments/create-order', '/api/create-order'], authMiddleware, paymentRateLimit, async (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const planCode = String(req.body?.planCode || '').trim() || BUYER_ACCESS_PLAN_CODE;
  const requestedAmount = Number(req.body?.amount ?? BUYER_ACCESS_AMOUNT_PAISE);
  if (planCode !== BUYER_ACCESS_PLAN_CODE) {
    return res.status(400).json({ error: 'Unsupported payment plan' });
  }
  if (requestedAmount !== BUYER_ACCESS_AMOUNT_PAISE) {
    return res.status(400).json({ error: 'Invalid payment amount' });
  }

  if (!keyId || !keySecret) {
    return res.status(503).json({
      error: 'Razorpay is not configured on the server',
      code: 'RAZORPAY_NOT_CONFIGURED',
    });
  }

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const receipt = `buyer_access_${req.user.id}_${Date.now()}`;
    const order = await rzp.orders.create({
      amount: BUYER_ACCESS_AMOUNT_PAISE,
      currency: 'INR',
      receipt,
      notes: {
        planCode: BUYER_ACCESS_PLAN_CODE,
        purpose: BUYER_ACCESS_PLAN_CODE,
        userId: String(req.user.id),
      },
    });

    if (dbEnabled) {
      await upsertBuyerAccessPayment({
        userId: req.user.id,
        planCode: BUYER_ACCESS_PLAN_CODE,
        amountPaise: BUYER_ACCESS_AMOUNT_PAISE,
        currency: 'INR',
        razorpayOrderId: order.id,
        signatureVerified: false,
        status: 'created',
        metadata: { receipt },
      });
    }

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      planCode: BUYER_ACCESS_PLAN_CODE,
      purpose: BUYER_ACCESS_PLAN_CODE,
    });
  } catch (err) {
    console.error('[PAYMENTS] order creation failed', err.message || err);
    return res.status(500).json({ error: 'Could not create payment order' });
  }
});

app.post(['/api/payments/verify', '/api/verify-payment'], authMiddleware, paymentRateLimit, async (req, res) => {
  const {
    planCode,
    amount,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body || {};

  if (String(planCode || BUYER_ACCESS_PLAN_CODE) !== BUYER_ACCESS_PLAN_CODE) {
    return res.status(400).json({ error: 'Unsupported payment plan' });
  }
  if (Number(amount || BUYER_ACCESS_AMOUNT_PAISE) !== BUYER_ACCESS_AMOUNT_PAISE) {
    return res.status(400).json({ error: 'Invalid payment amount' });
  }
  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: 'Payment details are incomplete' });
  }

  if (dbEnabled && pool) {
    const existingPayment = await pool.query(
      `SELECT *
       FROM buyer_access_payments
       WHERE razorpay_order_id = $1
       LIMIT 1`,
      [razorpay_order_id]
    );
    const row = existingPayment.rows[0];
    if (row?.signature_verified) {
      return res.json({
        success: true,
        buyerAccessActivated: true,
        buyerAccessActivatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        buyerAccessExpiresAt: row.access_expires_at ? new Date(row.access_expires_at).toISOString() : null,
        planCode: BUYER_ACCESS_PLAN_CODE,
        idempotent: true,
      });
    }
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keySecret) {
    if (!razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature missing' });
    }
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature mismatch' });
    }
  }

  const activation = await activateBuyerAccess({
    userId: req.user.id,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature || '',
    verified: true,
    metadata: {
      source: 'checkout',
      verifiedAt: new Date().toISOString(),
    },
  });

  return res.json({
    success: true,
    buyerAccessActivated: true,
    buyerAccessActivatedAt: new Date().toISOString(),
    buyerAccessExpiresAt: activation.accessExpiresAt.toISOString(),
    planCode: BUYER_ACCESS_PLAN_CODE,
  });
});

app.get('/api/payments/status', authMiddleware, async (req, res) => {
  if (!dbEnabled || !pool) {
    return res.json({
      isBuyer: false,
      buyerAccessActivatedAt: null,
      buyerAccessExpiresAt: null,
      planCode: BUYER_ACCESS_PLAN_CODE,
    });
  }

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  const row = await normalizeExpiredBuyerAccess(req.user.id, result.rows[0]);
  return res.json({
    ...serializeUserBuyerAccess(row),
    planCode: BUYER_ACCESS_PLAN_CODE,
  });
});

app.post(['/api/payments/webhook', '/api/webhook/razorpay'], webhookRateLimit, async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  const payload = String(req.rawBody || '');

  if (!webhookSecret) {
    console.error('[PAYMENTS] webhook received but RAZORPAY_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ error: 'Webhook endpoint is not configured' });
  }

  if (!signature) return res.status(400).json({ error: 'Webhook signature missing' });
  const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
  if (expected !== signature) return res.status(400).json({ error: 'Webhook signature mismatch' });

  let event = null;
  try {
    event = payload ? JSON.parse(payload) : null;
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  const paymentEntity = event?.payload?.payment?.entity || null;
  const orderEntity = event?.payload?.order?.entity || null;
  const orderId = paymentEntity?.order_id || orderEntity?.id || '';
  const paymentId = paymentEntity?.id || '';
  if (!orderId || !paymentId || String(paymentEntity?.notes?.planCode || orderEntity?.notes?.planCode || BUYER_ACCESS_PLAN_CODE) !== BUYER_ACCESS_PLAN_CODE) {
    return res.json({ received: true, ignored: true });
  }

  if (dbEnabled && pool) {
    const paymentRows = await pool.query('SELECT * FROM buyer_access_payments WHERE razorpay_order_id = $1 LIMIT 1', [orderId]);
    const userId = paymentRows.rows[0]?.user_id;
    if (userId) {
      await activateBuyerAccess({
        userId,
        orderId,
        paymentId,
        signature: event?.payload?.payment?.entity?.notes?.razorpay_signature || '',
        verified: true,
        metadata: { source: 'webhook', event: event?.event || 'payment.captured' },
      });
    }
  }

  return res.json({ received: true });
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
