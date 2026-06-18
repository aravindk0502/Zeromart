const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const Razorpay = require('razorpay');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'zeromart-dev-secret-change-in-prod';

app.use(cors());
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] No DATABASE_URL — running without database (demo mode)');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      phone       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL DEFAULT 'ZeroMart User',
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
    // Demo mode: check in-memory store
    const stored = otpStore.get(phone);
    if (!stored || stored.otp !== String(otp) || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Incorrect or expired OTP' });
    }
    otpStore.delete(phone);
  }

  // Get or create user
  let user;
  if (process.env.DATABASE_URL) {
    const result = await pool.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING *`,
      [phone]
    );
    user = result.rows[0];
  } else {
    user = { id: `demo_${phone}`, phone, name: 'ZeroMart User', initials: 'ZM', mode: 'seller', is_buyer: false, karma: 0, credits: 0, vouchers: 0, has_seen_tour: false };
  }

  const token = jwt.sign({ id: user.id, phone }, JWT_SECRET, { expiresIn: '90d' });
  return res.json({ success: true, token, user });
});

// Get profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ id: req.user.id, phone: req.user.phone });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json(result.rows[0]);
});

// Update profile
app.put('/api/profile', authMiddleware, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ success: true });
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
  if (!process.env.DATABASE_URL) return res.json([]);
  const result = await pool.query(
    `SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC`
  );
  return res.json(result.rows);
});

// Create product
app.post('/api/products', authMiddleware, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ id: Date.now() });
  const { title, category, emoji, condition, description, photo_url, nearby_eligible } = req.body;
  const profile = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const u = profile.rows[0];
  const result = await pool.query(
    `INSERT INTO products (title, category, emoji, condition, description, photo_url, nearby_eligible, seller_id, seller_name, seller_karma, seller_initials)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [title, category, emoji, condition, description, photo_url, nearby_eligible ?? true,
     req.user.id, u?.name || 'You', u?.karma || 0, u?.initials || 'ME']
  );
  return res.json({ id: result.rows[0].id });
});

// Get favourites
app.get('/api/favourites', authMiddleware, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json([]);
  const result = await pool.query('SELECT product_id FROM favourites WHERE user_id = $1', [req.user.id]);
  return res.json(result.rows.map(r => r.product_id));
});

// Toggle favourite
app.post('/api/favourites/:productId', authMiddleware, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ success: true });
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
  if (!process.env.DATABASE_URL) return res.json([]);
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

  if (process.env.DATABASE_URL) {
    await pool.query('UPDATE users SET is_buyer=true, mode=$1 WHERE id=$2', ['buyer', req.user.id]);
  }
  return res.json({ success: true });
});

// ── Serve React ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'build')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`ZeroMart running on port ${PORT}`));
}).catch(err => {
  console.error('[DB init failed]', err.message);
  app.listen(PORT, () => console.log(`ZeroMart running (no DB) on port ${PORT}`));
});
