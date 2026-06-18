const express   = require('express');
const cors      = require('cors');
const crypto    = require('crypto');
const path      = require('path');
const Razorpay  = require('razorpay');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Send OTP (MSG91) ──────────────────────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Valid 10-digit phone number required' });
  }

  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    console.log(`[DEMO] OTP for ${phone}: 123456`);
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
    console.error('[send-otp]', err);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ── Verify OTP + sign into Supabase ──────────────────────────────────────────
app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

  const authKey     = process.env.MSG91_AUTH_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  // Step 1: verify OTP
  if (authKey) {
    try {
      const url = `https://control.msg91.com/api/v5/otp/verify?mobile=91${phone}&otp=${otp}`;
      const response = await fetch(url, { method: 'POST', headers: { authkey: authKey } });
      const data = await response.json();
      if (data.type !== 'success') return res.status(400).json({ error: 'Incorrect OTP' });
    } catch (err) {
      return res.status(500).json({ error: 'OTP verification failed' });
    }
  } else {
    // Demo: accept any 6-digit OTP
    if (String(otp).length !== 6) return res.status(400).json({ error: 'Enter 6-digit OTP' });
  }

  // Step 2: create/get Supabase user
  if (!supabaseUrl || !serviceKey) {
    return res.json({ success: true, demo: true, userId: `demo_${phone}` });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { users } } = await admin.auth.admin.listUsers();
    const existing = users.find(u => u.phone === `+91${phone}`);
    let userId;

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        phone: `+91${phone}`, phone_confirm: true,
      });
      if (error) throw error;
      userId = created.user.id;
    }

    const { data: session, error: sessionErr } = await admin.auth.admin.createSession({ user_id: userId });
    if (sessionErr) throw sessionErr;

    return res.json({
      success: true,
      access_token:  session.session.access_token,
      refresh_token: session.session.refresh_token,
      userId,
    });
  } catch (err) {
    console.error('[verify-otp]', err);
    return res.status(500).json({ error: 'Account setup failed' });
  }
});

// ── Create Razorpay order ─────────────────────────────────────────────────────
app.post('/api/create-order', async (req, res) => {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return res.json({ demo: true, order_id: 'demo_order', amount: 2900, currency: 'INR', key_id: 'demo' });
  }

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: req.body?.amount || 2900,
      currency: 'INR',
      receipt: `zm_${Date.now()}`,
      notes: { purpose: 'ZeroMart buyer access — lifetime' },
    });
    return res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId });
  } catch (err) {
    console.error('[create-order]', err);
    return res.status(500).json({ error: 'Could not create payment order' });
  }
});

// ── Verify Razorpay payment ───────────────────────────────────────────────────
app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body || {};

  const keySecret   = process.env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (keySecret) {
    const body     = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature mismatch' });
    }
  }

  if (supabaseUrl && serviceKey && userId) {
    const { createClient } = require('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from('profiles').update({ is_buyer: true, mode: 'buyer' }).eq('id', userId);
  }

  return res.json({ success: true });
});

// ── Serve React build (SPA) ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'build')));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => console.log(`ZeroMart server running on port ${PORT}`));
