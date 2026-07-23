import crypto from 'crypto';
import express from 'express';

const ADMIN_ROLES = {
  super_admin: 'super_admin',
  operations: 'operations',
  support: 'support',
  finance: 'finance',
  content: 'content',
  read_only: 'read_only',
};

const ROLE_ORDER = [
  ADMIN_ROLES.super_admin,
  ADMIN_ROLES.operations,
  ADMIN_ROLES.support,
  ADMIN_ROLES.finance,
  ADMIN_ROLES.content,
  ADMIN_ROLES.read_only,
];

const DEFAULT_ROLE_PERMISSIONS = {
  [ADMIN_ROLES.super_admin]: ['*'],
  [ADMIN_ROLES.operations]: [
    'dashboard:read', 'users:read', 'businesses:read', 'businesses:moderate', 'listings:read', 'orders:read', 'audit_logs:read',
  ],
  [ADMIN_ROLES.support]: [
    'dashboard:read', 'users:read', 'users:note', 'businesses:read', 'businesses:note', 'requests:read', 'orders:read', 'notifications:read',
  ],
  [ADMIN_ROLES.finance]: [
    'dashboard:read', 'payments:read', 'payments:export', 'subscriptions:read', 'audit_logs:read',
  ],
  [ADMIN_ROLES.content]: [
    'dashboard:read', 'businesses:read', 'businesses:moderate', 'listings:read', 'listings:moderate', 'notifications:send', 'notifications:template',
  ],
  [ADMIN_ROLES.read_only]: [
    'dashboard:read', 'users:read', 'businesses:read', 'listings:read', 'orders:read', 'payments:read',
  ],
};

const ADMIN_SESSION_TTL_HOURS = Math.max(1, Number(process.env.ADMIN_SESSION_TTL_HOURS || 12) || 12);
const ADMIN_LOGIN_MAX_ATTEMPTS = Math.max(3, Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 8) || 8);
const ADMIN_LOGIN_WINDOW_MS = Math.max(60_000, Number(process.env.ADMIN_LOGIN_WINDOW_MS || (15 * 60 * 1000)) || (15 * 60 * 1000));
const ADMIN_SCRYPT_N = 16384;
const ADMIN_SCRYPT_R = 8;
const ADMIN_SCRYPT_P = 1;
const ADMIN_SCRYPT_KEYLEN = 64;
const MSG91_TIMEOUT_MS = Math.max(4_000, Number(process.env.MSG91_TIMEOUT_MS || 15_000) || 15_000);

function normalizeRole(input = '') {
  const value = String(input || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ROLE_ORDER.includes(value)) return value;
  if (value === 'superadmin') return ADMIN_ROLES.super_admin;
  if (value === 'readonly') return ADMIN_ROLES.read_only;
  return '';
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function normalizeIndianMobile(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^\d{10}$/.test(local) ? `91${local}` : '';
}

function normalizePermissionList(list = []) {
  const values = Array.isArray(list) ? list : [];
  return [...new Set(values
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))];
}

function mergePermissions(role = ADMIN_ROLES.read_only, custom = []) {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS[ADMIN_ROLES.read_only];
  return normalizePermissionList([...rolePermissions, ...normalizePermissionList(custom)]);
}

function hashSessionToken(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildPinHash(pin = '', salt = '') {
  return crypto.scryptSync(String(pin), String(salt), ADMIN_SCRYPT_KEYLEN, {
    N: ADMIN_SCRYPT_N,
    r: ADMIN_SCRYPT_R,
    p: ADMIN_SCRYPT_P,
  }).toString('hex');
}

function createPinSecret(pin = '') {
  const normalizedPin = String(pin || '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = buildPinHash(normalizedPin, salt);
  return { salt, hash };
}

function verifyPin(pin = '', salt = '', expectedHash = '') {
  if (!pin || !salt || !expectedHash) return false;
  const computed = buildPinHash(pin, salt);
  const a = Buffer.from(String(computed), 'hex');
  const b = Buffer.from(String(expectedHash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseSeedMembers() {
  const raw = String(process.env.ADMIN_TEAM_SEED || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAdminAuthHeader(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function readQueryFallback(req, key) {
  const raw = String(req.originalUrl || req.url || '');
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) return '';
  try {
    const params = new URLSearchParams(raw.slice(queryIndex + 1));
    return String(params.get(key) || '').trim();
  } catch {
    return '';
  }
}

function resolveAdminPhone(req) {
  return normalizePhone(
    req.body?.phone
    || req.query?.phone
    || readQueryFallback(req, 'phone')
    || req.headers['x-admin-phone']
    || '',
  );
}

function resolveAdminOtp(req) {
  return String(
    req.body?.otp
    || req.query?.otp
    || readQueryFallback(req, 'otp')
    || req.headers['x-admin-otp']
    || '',
  ).trim();
}

function resolveAdminPin(req) {
  return String(
    req.body?.pin
    || req.query?.pin
    || readQueryFallback(req, 'pin')
    || req.headers['x-admin-pin']
    || '',
  ).trim();
}

async function parseProviderBody(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

function requireMsg91Config() {
  const authKey = String(process.env.MSG91_AUTH_KEY || '').trim();
  const templateId = String(process.env.MSG91_TEMPLATE_ID || '').trim();
  if (!authKey || !templateId) {
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
  return { response, body };
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
  return { response, body };
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
  return { response, body };
}

function parseDashboardDateRange(query = {}) {
  const now = new Date();
  const period = String(query.period || 'month').trim().toLowerCase();
  const fromRaw = String(query.from || '').trim();
  const toRaw = String(query.to || '').trim();

  let toDate = toRaw ? new Date(toRaw) : now;
  if (Number.isNaN(toDate.getTime())) toDate = now;

  let fromDate = null;
  if (fromRaw) {
    const parsed = new Date(fromRaw);
    if (!Number.isNaN(parsed.getTime())) fromDate = parsed;
  }

  if (!fromDate) {
    fromDate = new Date(toDate);
    if (period === 'today' || period === 'day') {
      fromDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      fromDate.setDate(fromDate.getDate() - 6);
      fromDate.setHours(0, 0, 0, 0);
    } else {
      fromDate.setMonth(fromDate.getMonth() - 1);
    }
  }

  if (fromDate > toDate) {
    const swap = new Date(fromDate);
    fromDate = toDate;
    toDate = swap;
  }

  return {
    period,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
  };
}

function parsePagination(query = {}, defaultLimit = 25, maxLimit = 100) {
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit || defaultLimit) || defaultLimit));
  const page = Math.max(1, Number(query.page || 1) || 1);
  const offset = (page - 1) * limit;
  return { limit, page, offset };
}

function normalizeUserAdminStatus(input = '') {
  const status = String(input || '').trim().toLowerCase();
  if (status === 'active' || status === 'suspended' || status === 'blocked') return status;
  return '';
}

function normalizeBusinessAdminStatus(input = '') {
  const status = String(input || '').trim().toLowerCase();
  if (status === 'active' || status === 'suspended' || status === 'blocked') return status;
  return '';
}

export function registerAdminModule({ app, getPool, isDbEnabled, createRateLimiter, getClientIp }) {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  const loginLimiter = createRateLimiter({
    windowMs: ADMIN_LOGIN_WINDOW_MS,
    max: ADMIN_LOGIN_MAX_ATTEMPTS,
    keyPrefix: 'admin-login',
    keyGenerator: (req) => `${normalizePhone(req.body?.phone || '') || 'unknown'}:${getClientIp(req)}`,
  });

  const sensitiveWriteLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 80,
    keyPrefix: 'admin-sensitive-write',
    keyGenerator: (req) => String(req.admin?.id || getClientIp(req)),
  });

  const otpSendLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 6,
    keyPrefix: 'admin-otp-send',
    keyGenerator: (req) => `${normalizePhone(req.body?.phone || '') || 'unknown'}:${getClientIp(req)}`,
  });

  const otpVerifyLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 12,
    keyPrefix: 'admin-otp-verify',
    keyGenerator: (req) => `${normalizePhone(req.body?.phone || '') || 'unknown'}:${getClientIp(req)}`,
  });

  async function writeAuditLog({ adminId = null, action = '', targetType = '', targetId = '', metadata = {}, req = null }) {
    if (!isDbEnabled() || !getPool()) return;
    try {
      await getPool().query(
        `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          adminId,
          String(action || '').slice(0, 160),
          String(targetType || '').slice(0, 80),
          String(targetId || '').slice(0, 160),
          metadata || {},
          req ? String(getClientIp(req) || '').slice(0, 120) : null,
          req ? String(req.headers['user-agent'] || '').slice(0, 300) : null,
        ],
      );
    } catch {
      // Audit logs are non-blocking.
    }
  }

  async function resolveRolePermissions(role = ADMIN_ROLES.read_only) {
    if (!isDbEnabled() || !getPool()) return DEFAULT_ROLE_PERMISSIONS[role] || [];
    const result = await getPool().query(
      'SELECT permissions FROM admin_role_permissions WHERE role = $1 LIMIT 1',
      [role],
    );
    const fromDb = result.rows[0]?.permissions;
    if (Array.isArray(fromDb)) return normalizePermissionList(fromDb);
    return DEFAULT_ROLE_PERMISSIONS[role] || [];
  }

  function hasPermission(admin, requiredPermission = '') {
    if (!requiredPermission) return true;
    const permissions = normalizePermissionList(admin?.permissions || []);
    return permissions.includes('*') || permissions.includes(requiredPermission);
  }

  function requirePermission(permission) {
    return (req, res, next) => {
      if (!req.admin) return res.status(401).json({ error: 'Admin authentication required' });
      if (!hasPermission(req.admin, permission)) {
        return res.status(403).json({ error: 'Insufficient admin permissions', requiredPermission: permission });
      }
      return next();
    };
  }

  function requireSuperAdmin(req, res, next) {
    if (!req.admin) return res.status(401).json({ error: 'Admin authentication required' });
    if (req.admin.role !== ADMIN_ROLES.super_admin && !hasPermission(req.admin, '*')) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    return next();
  }

  async function adminAuthMiddleware(req, res, next) {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const token = parseAdminAuthHeader(req);
    if (!token) return res.status(401).json({ error: 'Missing admin token' });

    const tokenHash = hashSessionToken(token);
    const sessionResult = await getPool().query(
      `SELECT s.id, s.admin_id, s.expires_at, s.revoked_at,
              a.phone, a.normalized_phone, a.display_name, a.role, a.permissions, a.status
         FROM admin_sessions s
         JOIN admin_accounts a ON a.id = s.admin_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND a.status = 'active'
        LIMIT 1`,
      [tokenHash],
    );

    const row = sessionResult.rows[0];
    if (!row) return res.status(401).json({ error: 'Invalid or expired admin session' });

    req.admin = {
      id: row.admin_id,
      phone: row.phone,
      normalizedPhone: row.normalized_phone,
      name: row.display_name,
      role: row.role,
      permissions: normalizePermissionList(row.permissions),
      sessionId: row.id,
    };

    await getPool().query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [row.id]).catch(() => {});
    return next();
  }

  async function getAdminFromToken(token = '', { updateLastSeen = false } = {}) {
    if (!isDbEnabled() || !getPool()) return null;
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) return null;

    const tokenHash = hashSessionToken(normalizedToken);
    const sessionResult = await getPool().query(
      `SELECT s.id, s.admin_id,
              a.phone, a.normalized_phone, a.display_name, a.role, a.permissions
         FROM admin_sessions s
         JOIN admin_accounts a ON a.id = s.admin_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND a.status = 'active'
        LIMIT 1`,
      [tokenHash],
    );

    const row = sessionResult.rows[0];
    if (!row) return null;

    if (updateLastSeen) {
      await getPool().query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [row.id]).catch(() => {});
    }

    return {
      id: row.admin_id,
      phone: row.phone,
      normalizedPhone: row.normalized_phone,
      name: row.display_name,
      role: row.role,
      permissions: normalizePermissionList(row.permissions),
      sessionId: row.id,
    };
  }

  async function ensureAdminSchema() {
    if (!isDbEnabled() || !getPool()) return;

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS admin_accounts (
        id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        phone             TEXT UNIQUE NOT NULL,
        normalized_phone  TEXT UNIQUE NOT NULL,
        display_name      TEXT NOT NULL,
        role              TEXT NOT NULL,
        permissions       JSONB NOT NULL DEFAULT '[]'::jsonb,
        password_salt     TEXT NOT NULL,
        password_hash     TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'active',
        suspended_reason  TEXT,
        last_login_at     TIMESTAMPTZ,
        created_by        TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_role_permissions (
        role         TEXT PRIMARY KEY,
        permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        admin_id      TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
        token_hash    TEXT NOT NULL UNIQUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at    TIMESTAMPTZ NOT NULL,
        last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_address    TEXT,
        user_agent    TEXT,
        revoked_at    TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        admin_id      TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL,
        action        TEXT NOT NULL,
        target_type   TEXT,
        target_id     TEXT,
        metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address    TEXT,
        user_agent    TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_user_status (
        user_id         TEXT PRIMARY KEY,
        status          TEXT NOT NULL DEFAULT 'active',
        reason          TEXT,
        updated_by      TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_user_notes (
        id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id         TEXT NOT NULL,
        admin_id        TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL,
        note            TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_business_status (
        business_id      TEXT PRIMARY KEY,
        status           TEXT NOT NULL DEFAULT 'active',
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        reason           TEXT,
        updated_by       TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_business_notes (
        id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        business_id     TEXT NOT NULL,
        admin_id        TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL,
        note            TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS admin_accounts_role_idx ON admin_accounts(role);
      CREATE INDEX IF NOT EXISTS admin_accounts_status_idx ON admin_accounts(status);
      CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at DESC);
      CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx ON admin_audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS admin_user_status_status_idx ON admin_user_status(status);
      CREATE INDEX IF NOT EXISTS admin_user_notes_user_idx ON admin_user_notes(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS admin_business_status_status_idx ON admin_business_status(status);
      CREATE INDEX IF NOT EXISTS admin_business_status_verification_idx ON admin_business_status(verification_status);
      CREATE INDEX IF NOT EXISTS admin_business_notes_business_idx ON admin_business_notes(business_id, created_at DESC);
    `);

    for (const role of ROLE_ORDER) {
      await getPool().query(
        `INSERT INTO admin_role_permissions (role, permissions)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (role) DO UPDATE SET
           permissions = EXCLUDED.permissions,
           updated_at = now()`,
        [role, JSON.stringify(DEFAULT_ROLE_PERMISSIONS[role] || [])],
      );
    }

    const superPhone = normalizePhone(process.env.ADMIN_BOOTSTRAP_PHONE || '');
    const superPin = String(process.env.ADMIN_BOOTSTRAP_PIN || '').trim();
    const superName = String(process.env.ADMIN_BOOTSTRAP_NAME || 'Drizn Super Admin').trim();

    if (superPhone) {
      const existing = await getPool().query(
        'SELECT id FROM admin_accounts WHERE normalized_phone = $1 LIMIT 1',
        [superPhone],
      );
      if (!existing.rows[0]) {
        const bootstrapSecret = superPin || crypto.randomBytes(24).toString('hex');
        const secret = createPinSecret(bootstrapSecret);
        await getPool().query(
          `INSERT INTO admin_accounts (
            phone, normalized_phone, display_name, role, permissions, password_salt, password_hash, status
          ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'active')`,
          [
            superPhone,
            superPhone,
            superName,
            ADMIN_ROLES.super_admin,
            JSON.stringify(mergePermissions(ADMIN_ROLES.super_admin)),
            secret.salt,
            secret.hash,
          ],
        );
      }
    }

    const teamSeeds = parseSeedMembers();
    for (const seed of teamSeeds) {
      const seedPhone = normalizePhone(seed?.phone || '');
      const seedPin = String(seed?.pin || '').trim();
      const seedRole = normalizeRole(seed?.role || ADMIN_ROLES.read_only);
      if (!seedPhone || !seedPin || !seedRole || seedRole === ADMIN_ROLES.super_admin) continue;

      const existing = await getPool().query(
        'SELECT id FROM admin_accounts WHERE normalized_phone = $1 LIMIT 1',
        [seedPhone],
      );
      if (existing.rows[0]) continue;

      const seedSecret = createPinSecret(seedPin);
      const customPermissions = normalizePermissionList(seed?.permissions || []);
      await getPool().query(
        `INSERT INTO admin_accounts (
          phone, normalized_phone, display_name, role, permissions, password_salt, password_hash, status
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'active')`,
        [
          seedPhone,
          seedPhone,
          String(seed?.name || `${seedRole} team member`),
          seedRole,
          JSON.stringify(mergePermissions(seedRole, customPermissions)),
          seedSecret.salt,
          seedSecret.hash,
        ],
      );
    }
  }

  async function createAdminSession(adminRow, req) {
    await getPool().query('UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL', [adminRow.id]);

    const sessionToken = crypto.randomBytes(48).toString('base64url');
    const sessionHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);

    await getPool().query(
      `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        adminRow.id,
        sessionHash,
        expiresAt.toISOString(),
        String(getClientIp(req) || '').slice(0, 120),
        String(req.headers['user-agent'] || '').slice(0, 300),
      ],
    );

    await getPool().query('UPDATE admin_accounts SET last_login_at = now(), updated_at = now() WHERE id = $1', [adminRow.id]);
    await writeAuditLog({ adminId: adminRow.id, action: 'admin_login_success', targetType: 'admin_account', targetId: adminRow.id, req });

    return {
      success: true,
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
      admin: {
        id: adminRow.id,
        phone: adminRow.phone,
        displayName: adminRow.display_name,
        role: adminRow.role,
        permissions: normalizePermissionList(adminRow.permissions),
      },
    };
  }

  async function ensureBootstrapAdminAccount(phone = '') {
    const bootstrapPhone = normalizePhone(process.env.ADMIN_BOOTSTRAP_PHONE || '');
    if (!bootstrapPhone || phone !== bootstrapPhone) return null;

    const existing = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );
    if (existing.rows[0]) return existing.rows[0];

    const superName = String(process.env.ADMIN_BOOTSTRAP_NAME || 'Drizn Super Admin').trim();
    const superPin = String(process.env.ADMIN_BOOTSTRAP_PIN || '').trim();
    const bootstrapSecret = superPin || crypto.randomBytes(24).toString('hex');
    const secret = createPinSecret(bootstrapSecret);

    await getPool().query(
      `INSERT INTO admin_accounts (
        phone, normalized_phone, display_name, role, permissions, password_salt, password_hash, status
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'active')
      ON CONFLICT (normalized_phone) DO NOTHING`,
      [
        phone,
        phone,
        superName,
        ADMIN_ROLES.super_admin,
        JSON.stringify(mergePermissions(ADMIN_ROLES.super_admin)),
        secret.salt,
        secret.hash,
      ],
    );

    const created = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );
    return created.rows[0] || null;
  }

  router.post('/auth/send-otp', otpSendLimiter, async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const phone = resolveAdminPhone(req);
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit admin phone number.' });
    }

    const adminResult = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );
    let adminRow = adminResult.rows[0] || null;
    if (!adminRow) {
      adminRow = await ensureBootstrapAdminAccount(phone);
    }
    if (!adminRow) {
      await writeAuditLog({ action: 'admin_otp_send_failed', targetType: 'admin_account', targetId: phone, metadata: { reason: 'not_found' }, req });
      return res.status(401).json({ error: 'Admin account not found.' });
    }
    if (adminRow.status !== 'active') {
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_send_denied', targetType: 'admin_account', targetId: adminRow.id, metadata: { reason: 'suspended' }, req });
      return res.status(403).json({ error: 'Admin account is suspended.' });
    }

    const config = requireMsg91Config();
    if (!config) {
      return res.status(503).json({ error: 'OTP service is not configured', code: 'MSG91_NOT_CONFIGURED' });
    }

    const mobile = normalizeIndianMobile(phone);
    if (!mobile) {
      return res.status(400).json({ error: 'Enter a valid Indian mobile number.' });
    }

    try {
      const { response, body } = await sendMsg91Otp({ authKey: config.authKey, templateId: config.templateId, mobile });
      if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
        await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_send_failed', targetType: 'admin_account', targetId: adminRow.id, metadata: { providerStatus: response.status }, req });
        return res.status(502).json({ error: body?.message || body?.error || 'Failed to send OTP' });
      }
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_sent', targetType: 'admin_account', targetId: adminRow.id, req });
      return res.status(200).json({
        success: true,
        requestId: body?.request_id || body?.requestId || null,
        providerMessage: body?.message || '',
      });
    } catch (error) {
      const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
      return res.status(timedOut ? 504 : 500).json({
        error: timedOut ? 'OTP provider timeout while sending OTP' : 'Failed to send OTP',
      });
    }
  });

  router.post('/auth/resend-otp', otpSendLimiter, async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const phone = resolveAdminPhone(req);
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit admin phone number.' });
    }

    const adminResult = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );
    let adminRow = adminResult.rows[0] || null;
    if (!adminRow) {
      adminRow = await ensureBootstrapAdminAccount(phone);
    }
    if (!adminRow) return res.status(401).json({ error: 'Admin account not found.' });
    if (adminRow.status !== 'active') return res.status(403).json({ error: 'Admin account is suspended.' });

    const config = requireMsg91Config();
    if (!config) {
      return res.status(503).json({ error: 'OTP service is not configured', code: 'MSG91_NOT_CONFIGURED' });
    }

    const mobile = normalizeIndianMobile(phone);
    if (!mobile) {
      return res.status(400).json({ error: 'Enter a valid Indian mobile number.' });
    }

    try {
      const { response, body } = await resendMsg91Otp({ authKey: config.authKey, mobile, retryType: req.body?.retryType || 'text' });
      if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
        return res.status(502).json({ error: body?.message || body?.error || 'Failed to resend OTP' });
      }
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_resent', targetType: 'admin_account', targetId: adminRow.id, req });
      return res.status(200).json({
        success: true,
        requestId: body?.request_id || body?.requestId || null,
        providerMessage: body?.message || '',
      });
    } catch (error) {
      const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
      return res.status(timedOut ? 504 : 500).json({
        error: timedOut ? 'OTP provider timeout while resending OTP' : 'Failed to resend OTP',
      });
    }
  });

  router.post('/auth/verify-otp', otpVerifyLimiter, async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const phone = resolveAdminPhone(req);
    const otp = resolveAdminOtp(req);
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit admin phone number.' });
    }
    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({ error: 'Enter a valid 4-digit OTP.' });
    }

    const result = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );
    let adminRow = result.rows[0] || null;
    if (!adminRow) {
      adminRow = await ensureBootstrapAdminAccount(phone);
    }
    if (!adminRow) {
      await writeAuditLog({ action: 'admin_otp_verify_failed', targetType: 'admin_account', targetId: phone, metadata: { reason: 'not_found' }, req });
      return res.status(401).json({ error: 'Admin account not found.' });
    }
    if (adminRow.status !== 'active') {
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_verify_denied', targetType: 'admin_account', targetId: adminRow.id, metadata: { reason: 'suspended' }, req });
      return res.status(403).json({ error: 'Admin account is suspended.' });
    }

    const config = requireMsg91Config();
    if (!config) {
      return res.status(503).json({ error: 'OTP service is not configured', code: 'MSG91_NOT_CONFIGURED' });
    }

    const mobile = normalizeIndianMobile(phone);
    if (!mobile) {
      return res.status(400).json({ error: 'Enter a valid Indian mobile number.' });
    }

    try {
      const { response, body } = await verifyMsg91Otp({ authKey: config.authKey, mobile, otp });
      if (!(response.ok && String(body?.type || '').toLowerCase() === 'success')) {
        await writeAuditLog({ adminId: adminRow.id, action: 'admin_otp_verify_failed', targetType: 'admin_account', targetId: adminRow.id, metadata: { providerStatus: response.status }, req });
        return res.status(400).json({ error: body?.message || body?.error || 'Incorrect OTP' });
      }

      const sessionPayload = await createAdminSession(adminRow, req);
      return res.status(200).json(sessionPayload);
    } catch (error) {
      const timedOut = String(error?.name || '').toLowerCase() === 'timeouterror' || /aborted|timed out/i.test(String(error?.message || ''));
      return res.status(timedOut ? 504 : 500).json({
        error: timedOut ? 'OTP provider timeout while verifying OTP' : 'OTP verification failed',
      });
    }
  });

  router.post('/auth/login', loginLimiter, async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const phone = resolveAdminPhone(req);
    const pin = resolveAdminPin(req);
    if (!phone || !/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit admin phone number.' });
    if (!pin || pin.length < 4) return res.status(400).json({ error: 'Enter a valid admin PIN.' });

    const result = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, password_salt, password_hash, status
         FROM admin_accounts
        WHERE normalized_phone = $1
        LIMIT 1`,
      [phone],
    );

    const adminRow = result.rows[0];
    if (!adminRow) {
      await writeAuditLog({ action: 'admin_login_failed', targetType: 'admin_account', targetId: phone, metadata: { reason: 'not_found' }, req });
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    if (adminRow.status !== 'active') {
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_login_denied', targetType: 'admin_account', targetId: adminRow.id, metadata: { reason: 'suspended' }, req });
      return res.status(403).json({ error: 'Admin account is suspended.' });
    }

    if (!verifyPin(pin, adminRow.password_salt, adminRow.password_hash)) {
      await writeAuditLog({ adminId: adminRow.id, action: 'admin_login_failed', targetType: 'admin_account', targetId: adminRow.id, metadata: { reason: 'invalid_pin' }, req });
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const sessionPayload = await createAdminSession(adminRow, req);
    return res.status(200).json(sessionPayload);
  });

  router.get('/auth/me', async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const token = parseAdminAuthHeader(req);
    if (!token) {
      return res.status(200).json({ success: true, authenticated: false, admin: null });
    }

    const admin = await getAdminFromToken(token, { updateLastSeen: true });
    if (!admin) {
      return res.status(200).json({ success: true, authenticated: false, admin: null });
    }

    return res.status(200).json({
      success: true,
      authenticated: true,
      admin: {
        id: admin.id,
        phone: admin.phone,
        displayName: admin.name,
        role: admin.role,
        permissions: admin.permissions,
      },
    });
  });

  router.use(adminAuthMiddleware);

  router.post('/auth/logout', async (req, res) => {
    if (req.admin?.sessionId) {
      await getPool().query('UPDATE admin_sessions SET revoked_at = now() WHERE id = $1', [req.admin.sessionId]);
      await writeAuditLog({ adminId: req.admin.id, action: 'admin_logout', targetType: 'admin_session', targetId: req.admin.sessionId, req });
    }
    return res.status(200).json({ success: true });
  });

  router.get('/dashboard/overview', requirePermission('dashboard:read'), async (req, res) => {
    const { period, fromIso, toIso } = parseDashboardDateRange(req.query || {});
    const recentLimit = Math.min(25, Math.max(5, Number(req.query.recentLimit || 10) || 10));

    const [
      totalsResult,
      newUsersResult,
      activeUsersResult,
      totalBusinessesResult,
      totalListingsResult,
      activeListingsResult,
      completedCollectionsResult,
      revenueResult,
      totalKarmaResult,
      pendingRequestsResult,
      failedPaymentsResult,
      recentSignupsResult,
    ] = await Promise.all([
      getPool().query('SELECT COUNT(*)::bigint AS count FROM users'),
      getPool().query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::bigint AS today_count,
           COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS week_count,
           COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::bigint AS month_count
         FROM users`,
      ),
      getPool().query(
        `WITH active_sources AS (
           SELECT CAST(id AS TEXT) AS actor_id
             FROM users
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           UNION
           SELECT CAST(buyer_id AS TEXT) AS actor_id
             FROM orders
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           UNION
           SELECT CAST(seller_id AS TEXT) AS actor_id
             FROM requests
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           UNION
           SELECT CAST(buyer_id AS TEXT) AS actor_id
             FROM requests
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           UNION
           SELECT CAST(seller_id AS TEXT) AS actor_id
             FROM listings
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
         )
         SELECT COUNT(DISTINCT actor_id)::bigint AS count
           FROM active_sources
          WHERE actor_id IS NOT NULL
            AND actor_id <> ''`,
        [fromIso, toIso],
      ),
      getPool().query(
        `SELECT GREATEST(
           (SELECT COUNT(*)::bigint FROM users WHERE LOWER(COALESCE(account_type, '')) = 'business'),
           (SELECT COUNT(*)::bigint FROM profiles WHERE LOWER(COALESCE(account_type, '')) IN ('business', 'store'))
         ) AS count`,
      ),
      getPool().query('SELECT COUNT(*)::bigint AS count FROM listings'),
      getPool().query(
        `SELECT COUNT(*)::bigint AS count
           FROM listings
          WHERE LOWER(COALESCE(status, 'active')) = 'active'
            AND COALESCE(available_quantity, 0) > 0`,
      ),
      getPool().query(
        `SELECT COUNT(*)::bigint AS count
           FROM requests
          WHERE LOWER(COALESCE(status, '')) IN ('completed', 'collected', 'fulfilled')`,
      ),
      getPool().query(
        `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS amount_paise
           FROM buyer_access_payments
          WHERE LOWER(COALESCE(status, '')) IN ('captured', 'paid', 'success')
            AND COALESCE(signature_verified, false) = true`,
      ),
      getPool().query('SELECT COALESCE(SUM(points), 0)::bigint AS points FROM karma_events'),
      getPool().query(
        `SELECT COUNT(*)::bigint AS count
           FROM requests
          WHERE LOWER(COALESCE(status, 'pending')) = 'pending'`,
      ),
      getPool().query(
        `SELECT COUNT(*)::bigint AS count
           FROM buyer_access_payments
          WHERE LOWER(COALESCE(status, '')) IN ('failed', 'failure', 'cancelled', 'canceled')`,
      ),
      getPool().query(
        `SELECT id, phone, name, COALESCE(account_type, 'personal') AS account_type, created_at
           FROM users
          ORDER BY created_at DESC
          LIMIT $1`,
        [recentLimit],
      ),
    ]);

    return res.status(200).json({
      success: true,
      filters: {
        period,
        from: fromIso,
        to: toIso,
      },
      summary: {
        totalUsers: Number(totalsResult.rows[0]?.count || 0),
        newUsersToday: Number(newUsersResult.rows[0]?.today_count || 0),
        newUsersWeek: Number(newUsersResult.rows[0]?.week_count || 0),
        newUsersMonth: Number(newUsersResult.rows[0]?.month_count || 0),
        activeUsers: Number(activeUsersResult.rows[0]?.count || 0),
        totalBusinesses: Number(totalBusinessesResult.rows[0]?.count || 0),
        totalListings: Number(totalListingsResult.rows[0]?.count || 0),
        activeListings: Number(activeListingsResult.rows[0]?.count || 0),
        completedCollections: Number(completedCollectionsResult.rows[0]?.count || 0),
        revenue: {
          amountPaise: Number(revenueResult.rows[0]?.amount_paise || 0),
          currency: 'INR',
        },
        totalKarma: Number(totalKarmaResult.rows[0]?.points || 0),
        pendingRequests: Number(pendingRequestsResult.rows[0]?.count || 0),
        failedPayments: Number(failedPaymentsResult.rows[0]?.count || 0),
      },
      recentSignups: recentSignupsResult.rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        name: row.name,
        accountType: row.account_type,
        createdAt: row.created_at,
      })),
    });
  });

  async function resolveUserIdentity(rawUserRef = '') {
    const userRef = String(rawUserRef || '').trim();
    if (!userRef) return null;

    const result = await getPool().query(
      `SELECT id::text AS user_id,
              id,
              phone,
              name,
              COALESCE(NULLIF(account_type, ''), 'personal') AS account_type,
              created_at
         FROM users
        WHERE id::text = $1 OR phone = $1
        LIMIT 1`,
      [userRef],
    );

    return result.rows[0] || null;
  }

  async function buildUserDetailPayload(user) {
    const userId = String(user?.user_id || '');
    const userPhone = String(user?.phone || '');
    const safeLikePhone = userPhone ? `%${userPhone}%` : '';

    const [
      statusResult,
      profileResult,
      listingsResult,
      requestsResult,
      ordersResult,
      favouritesResult,
      notificationsResult,
      karmaResult,
      paymentsResult,
      loginHistoryResult,
      reportsResult,
      notesResult,
      activityTimelineResult,
    ] = await Promise.all([
      getPool().query(
        `SELECT user_id, status, reason, updated_by, updated_at
           FROM admin_user_status
          WHERE user_id = $1
          LIMIT 1`,
        [userId],
      ),
      getPool().query(
        `SELECT id, phone, name, account_type, karma, location_data, created_at, updated_at
           FROM profiles
          WHERE phone = $1
          LIMIT 1`,
        [userPhone],
      ),
      getPool().query(
        `SELECT id, title, category, status, quantity, available_quantity, created_at, expiry_date, location, city
           FROM listings
          WHERE seller_id = $1 OR COALESCE(metadata->>'ownerMobile', '') = $2
          ORDER BY created_at DESC
          LIMIT 80`,
        [userId, userPhone],
      ),
      getPool().query(
        `SELECT id, listing_id, seller_id, status, quantity, created_at, updated_at
           FROM requests
          WHERE buyer_id = $1
          ORDER BY created_at DESC
          LIMIT 120`,
        [userId],
      ),
      getPool().query(
        `SELECT id, product_id, product_title, status, status_label, type, created_at
           FROM orders
          WHERE buyer_id::text = $1
          ORDER BY created_at DESC
          LIMIT 120`,
        [userId],
      ),
      getPool().query(
        `SELECT f.product_id, p.title, p.category, p.created_at
           FROM favourites f
      LEFT JOIN products p ON p.id = f.product_id
          WHERE f.user_id::text = $1
          ORDER BY p.created_at DESC
          LIMIT 80`,
        [userId],
      ),
      getPool().query(
        `SELECT id, title, body, channel, status, created_at
           FROM app_notifications
          WHERE recipient_account_id = $1 OR ($2 <> '' AND recipient_account_id ILIKE $3)
          ORDER BY created_at DESC
          LIMIT 120`,
        [userId, userPhone, safeLikePhone],
      ),
      getPool().query(
        `SELECT id, giver_id, receiver_id, listing_id, order_id, request_id, points, note, created_at
           FROM karma_events
          WHERE receiver_id = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [userId],
      ),
      getPool().query(
        `SELECT id, plan_code, amount_paise, currency, razorpay_order_id, razorpay_payment_id,
                signature_verified, status, metadata, created_at, updated_at
           FROM buyer_access_payments
          WHERE user_id::text = $1
          ORDER BY created_at DESC
          LIMIT 120`,
        [userId],
      ),
      getPool().query(
        `SELECT id, event_type, status, phone_last4, ip_address, metadata, created_at
           FROM security_audit_events
          WHERE user_id::text = $1 OR ($2 <> '' AND phone_last4 = RIGHT($2, 4))
          ORDER BY created_at DESC
          LIMIT 120`,
        [userId, userPhone],
      ),
      getPool().query(
        `SELECT id, event_type, status, metadata, created_at
           FROM security_audit_events
          WHERE (user_id::text = $1 OR ($2 <> '' AND phone_last4 = RIGHT($2, 4)))
            AND status IN ('warning', 'error')
          ORDER BY created_at DESC
          LIMIT 60`,
        [userId, userPhone],
      ),
      getPool().query(
        `SELECT n.id, n.user_id, n.note, n.created_at,
                a.id AS admin_id, a.display_name AS admin_name, a.role AS admin_role
           FROM admin_user_notes n
      LEFT JOIN admin_accounts a ON a.id = n.admin_id
          WHERE n.user_id = $1
          ORDER BY n.created_at DESC
          LIMIT 120`,
        [userId],
      ),
      getPool().query(
        `SELECT * FROM (
           SELECT 'listing_created' AS event_type, id AS entity_id, status, created_at, jsonb_build_object('title', title) AS payload
             FROM listings
            WHERE seller_id = $1 OR COALESCE(metadata->>'ownerMobile', '') = $2
           UNION ALL
           SELECT 'request_created' AS event_type, id AS entity_id, status, created_at, jsonb_build_object('listingId', listing_id) AS payload
             FROM requests
            WHERE buyer_id = $1
           UNION ALL
           SELECT 'order_event' AS event_type, id AS entity_id, status, created_at, jsonb_build_object('productTitle', product_title) AS payload
             FROM orders
            WHERE buyer_id::text = $1
           UNION ALL
           SELECT 'payment_event' AS event_type, id AS entity_id, status, created_at, jsonb_build_object('amountPaise', amount_paise) AS payload
             FROM buyer_access_payments
            WHERE user_id::text = $1
           UNION ALL
           SELECT event_type, id AS entity_id, status, created_at, metadata AS payload
             FROM security_audit_events
            WHERE user_id::text = $1 OR ($2 <> '' AND phone_last4 = RIGHT($2, 4))
         ) timeline
         ORDER BY created_at DESC
         LIMIT 300`,
        [userId, userPhone],
      ),
    ]);

    const statusRow = statusResult.rows[0] || null;
    const profileRow = profileResult.rows[0] || null;
    const loginHistory = loginHistoryResult.rows;
    const lastLogin = loginHistory.find((entry) => String(entry.event_type || '').toLowerCase().includes('login')) || null;
    const locationData = profileRow?.location_data || {};
    const primaryCity = String(locationData?.city || locationData?.locality || '').trim();

    const acceptedRequests = requestsResult.rows.filter((item) => String(item.status || '').toLowerCase() === 'accepted').length;
    const declinedRequests = requestsResult.rows.filter((item) => String(item.status || '').toLowerCase() === 'declined').length;
    const collectedRequests = requestsResult.rows.filter((item) => ['completed', 'collected', 'fulfilled'].includes(String(item.status || '').toLowerCase())).length;
    const totalAmountPaidPaise = paymentsResult.rows
      .filter((item) => ['captured', 'paid', 'success'].includes(String(item.status || '').toLowerCase()))
      .reduce((acc, item) => acc + Number(item.amount_paise || 0), 0);

    const paymentStatus = paymentsResult.rows[0]?.status || 'none';

    return {
      profile: {
        userId,
        name: user.name,
        phone: user.phone,
        email: null,
        accountType: user.account_type,
        signupAt: user.created_at,
        lastLoginAt: lastLogin?.created_at || null,
        lastActiveAt: activityTimelineResult.rows[0]?.created_at || user.created_at,
        sessionDuration: null,
        city: primaryCity,
        locality: String(locationData?.locality || '').trim(),
        locationData,
        profilePicture: String(
          locationData?.profileImage
            || locationData?.profile_image
            || locationData?.profileImageUrl
            || locationData?.avatar
            || '',
        ),
        karma: Number(profileRow?.karma || 0),
        listingsCount: listingsResult.rows.length,
        productsRequested: requestsResult.rows.length,
        productsCollected: collectedRequests,
        purchasePaymentHistoryCount: paymentsResult.rows.length,
        paymentStatus,
        totalAmountPaidPaise,
        accountStatus: statusRow?.status || 'active',
        statusReason: statusRow?.reason || '',
        deviceSessionInfo: loginHistory[0]?.metadata || null,
      },
      loginHistory,
      activityTimeline: activityTimelineResult.rows,
      listings: listingsResult.rows,
      requests: {
        rows: requestsResult.rows,
        acceptedCount: acceptedRequests,
        declinedCount: declinedRequests,
        collectedCount: collectedRequests,
      },
      orders: ordersResult.rows,
      favourites: favouritesResult.rows,
      notifications: notificationsResult.rows,
      karmaHistory: karmaResult.rows,
      payments: paymentsResult.rows,
      reports: reportsResult.rows,
      supportNotes: notesResult.rows,
    };
  }

  router.get('/users', requirePermission('users:read'), async (req, res) => {
    const { limit, page, offset } = parsePagination(req.query || {}, 25, 100);
    const searchRaw = String(req.query.search || '').trim();
    const accountType = String(req.query.accountType || '').trim().toLowerCase();
    const cityFilter = String(req.query.city || '').trim().toLowerCase();
    const statusFilter = normalizeUserAdminStatus(req.query.status || '');

    const searchLike = searchRaw ? `%${searchRaw}%` : '';
    const cityLike = cityFilter ? `%${cityFilter}%` : '';

    const whereClause = `
      WHERE ($1 = '' OR u.name ILIKE $2 OR u.phone ILIKE $2 OR u.id::text = $1)
        AND ($3 = '' OR LOWER(COALESCE(u.account_type, 'personal')) = $3)
        AND ($4 = '' OR LOWER(COALESCE(us.status, 'active')) = $4)
        AND (
          $5 = ''
          OR LOWER(COALESCE(p.location_data->>'city', '')) LIKE $6
          OR LOWER(COALESCE(p.location_data->>'locality', '')) LIKE $6
        )
    `;

    const listResult = await getPool().query(
      `SELECT
         u.id::text AS user_id,
         u.name,
         u.phone,
         NULL::text AS email,
         COALESCE(NULLIF(u.account_type, ''), 'personal') AS account_type,
         u.created_at,
         COALESCE(us.status, 'active') AS account_status,
         us.reason AS status_reason,
         p.karma,
         p.location_data,
         COALESCE(p.location_data->>'city', '') AS city,
         COALESCE(p.location_data->>'locality', '') AS locality,
         COALESCE(p.location_data->>'profileImage', p.location_data->>'profile_image', p.location_data->>'profileImageUrl', p.location_data->>'avatar', '') AS profile_picture,
         COALESCE(lc.listings_count, 0) AS listings_count,
         COALESCE(rc.requests_count, 0) AS products_requested,
         COALESCE(rc.collected_count, 0) AS products_collected,
         COALESCE(pc.payment_count, 0) AS payment_count,
         COALESCE(pc.total_paid_paise, 0) AS total_amount_paid_paise,
         COALESCE(pc.last_payment_status, 'none') AS payment_status,
         login.last_login_at,
         activity.last_active_at,
         activity.last_activity_metadata
       FROM users u
  LEFT JOIN profiles p ON p.phone = u.phone
  LEFT JOIN admin_user_status us ON us.user_id = u.id::text
  LEFT JOIN LATERAL (
       SELECT COUNT(*)::bigint AS listings_count
         FROM listings l
        WHERE l.seller_id = u.id::text OR COALESCE(l.metadata->>'ownerMobile', '') = u.phone
     ) lc ON true
  LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::bigint AS requests_count,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(r.status, '')) IN ('completed', 'collected', 'fulfilled'))::bigint AS collected_count
         FROM requests r
        WHERE r.buyer_id = u.id::text
     ) rc ON true
  LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::bigint AS payment_count,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(bp.status, '')) IN ('captured', 'paid', 'success') THEN bp.amount_paise ELSE 0 END), 0)::bigint AS total_paid_paise,
         (ARRAY_AGG(bp.status ORDER BY bp.created_at DESC))[1] AS last_payment_status
         FROM buyer_access_payments bp
        WHERE bp.user_id::text = u.id::text
     ) pc ON true
  LEFT JOIN LATERAL (
       SELECT se.created_at AS last_login_at
         FROM security_audit_events se
        WHERE se.user_id::text = u.id::text
           OR (u.phone <> '' AND se.phone_last4 = RIGHT(u.phone, 4))
        ORDER BY se.created_at DESC
        LIMIT 1
     ) login ON true
  LEFT JOIN LATERAL (
       SELECT timeline.created_at AS last_active_at, timeline.metadata AS last_activity_metadata
         FROM (
           SELECT created_at, metadata FROM security_audit_events se WHERE se.user_id::text = u.id::text
           UNION ALL
           SELECT created_at, metadata FROM listings l WHERE l.seller_id = u.id::text OR COALESCE(l.metadata->>'ownerMobile', '') = u.phone
           UNION ALL
           SELECT created_at, details AS metadata FROM requests r WHERE r.buyer_id = u.id::text
           UNION ALL
           SELECT created_at, metadata FROM buyer_access_payments bp WHERE bp.user_id::text = u.id::text
         ) timeline
        ORDER BY timeline.created_at DESC
        LIMIT 1
     ) activity ON true
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $7 OFFSET $8`,
      [searchRaw, searchLike, accountType, statusFilter, cityFilter, cityLike, limit, offset],
    );

    const countResult = await getPool().query(
      `SELECT COUNT(*)::bigint AS total
         FROM users u
    LEFT JOIN profiles p ON p.phone = u.phone
    LEFT JOIN admin_user_status us ON us.user_id = u.id::text
        ${whereClause}`,
      [searchRaw, searchLike, accountType, statusFilter, cityFilter, cityLike],
    );

    return res.status(200).json({
      success: true,
      rows: listResult.rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        accountType: row.account_type,
        signupAt: row.created_at,
        lastLoginAt: row.last_login_at,
        lastActiveAt: row.last_active_at,
        sessionDuration: null,
        city: row.city,
        locality: row.locality,
        locationData: row.location_data || {},
        profilePicture: row.profile_picture || '',
        karma: Number(row.karma || 0),
        listingsCount: Number(row.listings_count || 0),
        productsRequested: Number(row.products_requested || 0),
        productsCollected: Number(row.products_collected || 0),
        purchasePaymentHistoryCount: Number(row.payment_count || 0),
        paymentStatus: row.payment_status || 'none',
        totalAmountPaidPaise: Number(row.total_amount_paid_paise || 0),
        accountStatus: row.account_status || 'active',
        statusReason: row.status_reason || '',
        deviceSessionInfo: row.last_activity_metadata || null,
      })),
      pagination: {
        page,
        limit,
        total: Number(countResult.rows[0]?.total || 0),
      },
    });
  });

  router.get('/users/:userId', requirePermission('users:read'), async (req, res) => {
    const user = await resolveUserIdentity(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const detail = await buildUserDetailPayload(user);
    return res.status(200).json({ success: true, ...detail });
  });

  router.put('/users/:userId/status', sensitiveWriteLimiter, requireSuperAdmin, async (req, res) => {
    const user = await resolveUserIdentity(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const nextStatus = normalizeUserAdminStatus(req.body?.status || '');
    const reason = String(req.body?.reason || '').trim().slice(0, 240);
    if (!nextStatus) {
      return res.status(400).json({ error: 'Valid status is required (active, suspended, blocked).' });
    }

    await getPool().query(
      `INSERT INTO admin_user_status (user_id, status, reason, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id) DO UPDATE SET
         status = EXCLUDED.status,
         reason = EXCLUDED.reason,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [user.user_id, nextStatus, reason, req.admin.id],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_user_status_updated',
      targetType: 'user',
      targetId: user.user_id,
      metadata: { status: nextStatus, reason },
      req,
    });

    return res.status(200).json({
      success: true,
      userId: user.user_id,
      accountStatus: nextStatus,
      reason,
    });
  });

  router.post('/users/:userId/notes', sensitiveWriteLimiter, requirePermission('users:note'), async (req, res) => {
    const user = await resolveUserIdentity(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'Note is required.' });
    if (note.length > 2000) return res.status(400).json({ error: 'Note is too long.' });

    const created = await getPool().query(
      `INSERT INTO admin_user_notes (user_id, admin_id, note)
       VALUES ($1,$2,$3)
       RETURNING id, user_id, note, created_at`,
      [user.user_id, req.admin.id, note],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_user_note_added',
      targetType: 'user',
      targetId: user.user_id,
      metadata: { noteLength: note.length },
      req,
    });

    return res.status(201).json({ success: true, note: created.rows[0] });
  });

  router.get('/users/:userId/export', requirePermission('users:read'), async (req, res) => {
    const user = await resolveUserIdentity(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const detail = await buildUserDetailPayload(user);
    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_user_exported',
      targetType: 'user',
      targetId: user.user_id,
      metadata: { format: 'json' },
      req,
    });

    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      userId: user.user_id,
      data: detail,
    });
  });

  async function resolveBusinessIdentity(rawBusinessRef = '') {
    const businessRef = String(rawBusinessRef || '').trim();
    if (!businessRef) return null;

    const result = await getPool().query(
      `SELECT DISTINCT
          u.id::text AS business_id,
          u.id,
          u.phone,
          u.name,
          COALESCE(NULLIF(u.account_type, ''), 'business') AS account_type,
          u.created_at
         FROM users u
    LEFT JOIN listings l ON l.seller_id = u.id::text OR l.business_id = u.id::text
        WHERE (u.id::text = $1 OR u.phone = $1)
          AND (
            LOWER(COALESCE(u.account_type, '')) = 'business'
            OR LOWER(COALESCE(l.seller_type, '')) = 'business'
            OR l.business_id IS NOT NULL
          )
        LIMIT 1`,
      [businessRef],
    );

    return result.rows[0] || null;
  }

  async function buildBusinessDetailPayload(business) {
    const businessId = String(business?.business_id || '');
    const businessPhone = String(business?.phone || '');
    const phoneLike = businessPhone ? `%${businessPhone}%` : '';

    const [
      statusResult,
      profileResult,
      listingsResult,
      requestsReceivedResult,
      notificationsResult,
      karmaResult,
      paymentsResult,
      notesResult,
      loginHistoryResult,
      activityTimelineResult,
    ] = await Promise.all([
      getPool().query(
        `SELECT business_id, status, verification_status, reason, updated_by, updated_at
           FROM admin_business_status
          WHERE business_id = $1
          LIMIT 1`,
        [businessId],
      ),
      getPool().query(
        `SELECT id, phone, name, account_type, karma, location_data, created_at, updated_at
           FROM profiles
          WHERE phone = $1
          LIMIT 1`,
        [businessPhone],
      ),
      getPool().query(
        `SELECT id, title, category, status, quantity, available_quantity, sold_quantity,
                created_at, expiry_date, location, area, city, store_name, metadata
           FROM listings
          WHERE seller_id = $1 OR business_id = $1 OR COALESCE(metadata->>'ownerMobile', '') = $2
          ORDER BY created_at DESC
          LIMIT 300`,
        [businessId, businessPhone],
      ),
      getPool().query(
        `SELECT id, listing_id, buyer_id, status, quantity, details, created_at, updated_at
           FROM requests
          WHERE seller_id = $1
          ORDER BY created_at DESC
          LIMIT 300`,
        [businessId],
      ),
      getPool().query(
        `SELECT id, title, body, channel, status, created_at
           FROM app_notifications
          WHERE recipient_account_id = $1 OR ($2 <> '' AND recipient_account_id ILIKE $3)
          ORDER BY created_at DESC
          LIMIT 200`,
        [businessId, businessPhone, phoneLike],
      ),
      getPool().query(
        `SELECT id, giver_id, receiver_id, listing_id, order_id, request_id, points, note, created_at
           FROM karma_events
          WHERE receiver_id = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [businessId],
      ),
      getPool().query(
        `SELECT id, plan_code, amount_paise, currency, razorpay_order_id, razorpay_payment_id,
                signature_verified, status, metadata, created_at, updated_at
           FROM buyer_access_payments
          WHERE user_id::text = $1
          ORDER BY created_at DESC
          LIMIT 160`,
        [businessId],
      ),
      getPool().query(
        `SELECT n.id, n.business_id, n.note, n.created_at,
                a.id AS admin_id, a.display_name AS admin_name, a.role AS admin_role
           FROM admin_business_notes n
      LEFT JOIN admin_accounts a ON a.id = n.admin_id
          WHERE n.business_id = $1
          ORDER BY n.created_at DESC
          LIMIT 160`,
        [businessId],
      ),
      getPool().query(
        `SELECT id, event_type, status, phone_last4, ip_address, metadata, created_at
           FROM security_audit_events
          WHERE user_id::text = $1 OR ($2 <> '' AND phone_last4 = RIGHT($2, 4))
          ORDER BY created_at DESC
          LIMIT 200`,
        [businessId, businessPhone],
      ),
      getPool().query(
        `SELECT * FROM (
           SELECT 'listing_event' AS event_type, id AS entity_id, status, created_at, jsonb_build_object('title', title) AS payload
             FROM listings
            WHERE seller_id = $1 OR business_id = $1 OR COALESCE(metadata->>'ownerMobile', '') = $2
           UNION ALL
           SELECT 'request_event' AS event_type, id AS entity_id, status, created_at, details AS payload
             FROM requests
            WHERE seller_id = $1
           UNION ALL
           SELECT 'payment_event' AS event_type, id AS entity_id, status, created_at, metadata AS payload
             FROM buyer_access_payments
            WHERE user_id::text = $1
           UNION ALL
           SELECT event_type, id AS entity_id, status, created_at, metadata AS payload
             FROM security_audit_events
            WHERE user_id::text = $1 OR ($2 <> '' AND phone_last4 = RIGHT($2, 4))
         ) timeline
         ORDER BY created_at DESC
         LIMIT 300`,
        [businessId, businessPhone],
      ),
    ]);

    const statusRow = statusResult.rows[0] || null;
    const profileRow = profileResult.rows[0] || null;
    const locationData = profileRow?.location_data || {};
    const lastLogin = loginHistoryResult.rows.find((entry) => String(entry.event_type || '').toLowerCase().includes('login')) || null;
    const latestListing = listingsResult.rows[0] || null;

    const activeListings = listingsResult.rows.filter((item) => String(item.status || '').toLowerCase() === 'active').length;
    const nearExpiryListings = listingsResult.rows.filter((item) => {
      const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
      if (!expiry || Number.isNaN(expiry.getTime())) return false;
      const now = new Date();
      const inThreeDays = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
      return expiry >= now && expiry <= inThreeDays;
    }).length;

    const requestsReceived = requestsReceivedResult.rows.length;
    const acceptedCount = requestsReceivedResult.rows.filter((item) => String(item.status || '').toLowerCase() === 'accepted').length;
    const declinedCount = requestsReceivedResult.rows.filter((item) => String(item.status || '').toLowerCase() === 'declined').length;
    const completedCount = requestsReceivedResult.rows.filter((item) => ['completed', 'collected', 'fulfilled'].includes(String(item.status || '').toLowerCase())).length;

    const totalRevenuePaise = paymentsResult.rows
      .filter((item) => ['captured', 'paid', 'success'].includes(String(item.status || '').toLowerCase()))
      .reduce((acc, item) => acc + Number(item.amount_paise || 0), 0);

    return {
      profile: {
        businessId,
        storeName: String(latestListing?.store_name || profileRow?.name || business.name || 'Business Store'),
        ownerName: business.name,
        phone: business.phone,
        email: null,
        address: String(locationData?.address || locationData?.street || ''),
        city: String(locationData?.city || latestListing?.city || ''),
        locality: String(locationData?.locality || latestListing?.area || ''),
        signupAt: business.created_at,
        lastLoginAt: lastLogin?.created_at || null,
        verificationStatus: statusRow?.verification_status || 'unverified',
        subscriptionPaymentStatus: paymentsResult.rows[0]?.status || 'none',
        totalProductsListed: listingsResult.rows.length,
        activeProducts: activeListings,
        nearExpiryProducts: nearExpiryListings,
        ordersReceived: requestsReceived,
        acceptedOrders: acceptedCount,
        declinedOrders: declinedCount,
        completedOrders: completedCount,
        storeKarma: Number(profileRow?.karma || 0),
        revenuePaise: totalRevenuePaise,
        accountStatus: statusRow?.status || 'active',
        statusReason: statusRow?.reason || '',
        logoProfileImage: String(
          locationData?.storeLogo
            || locationData?.storeImage
            || locationData?.profileImage
            || locationData?.profile_image
            || locationData?.profileImageUrl
            || '',
        ),
        verificationDocuments: locationData?.verificationDocuments || locationData?.documents || null,
      },
      listings: listingsResult.rows,
      ordersReceived: requestsReceivedResult.rows,
      notifications: notificationsResult.rows,
      karmaHistory: karmaResult.rows,
      payments: paymentsResult.rows,
      loginHistory: loginHistoryResult.rows,
      supportNotes: notesResult.rows,
      activityTimeline: activityTimelineResult.rows,
      storeLocations: {
        primary: {
          address: String(locationData?.address || locationData?.street || ''),
          city: String(locationData?.city || latestListing?.city || ''),
          locality: String(locationData?.locality || latestListing?.area || ''),
          locationData,
        },
      },
    };
  }

  router.get('/businesses', requirePermission('businesses:read'), async (req, res) => {
    const { limit, page, offset } = parsePagination(req.query || {}, 25, 100);
    const searchRaw = String(req.query.search || '').trim();
    const cityRaw = String(req.query.city || '').trim().toLowerCase();
    const statusFilter = normalizeBusinessAdminStatus(req.query.status || '');
    const verificationFilter = String(req.query.verificationStatus || '').trim().toLowerCase();

    const searchLike = searchRaw ? `%${searchRaw}%` : '';
    const cityLike = cityRaw ? `%${cityRaw}%` : '';
    const baseRowsResult = await getPool().query(
      `WITH listing_raw AS (
         SELECT
           COALESCE(NULLIF(l.business_id, ''), NULLIF(l.seller_id, '')) AS business_ref,
           REGEXP_REPLACE(COALESCE(l.metadata->>'ownerMobile', ''), '\\D', '', 'g') AS owner_phone,
           COALESCE(l.store_name, l.seller_name) AS store_name,
           COALESCE(l.city, '') AS city,
           COALESCE(l.area, '') AS locality,
           l.created_at,
           l.expiry_date,
           COALESCE(l.status, 'active') AS status
         FROM listings l
         WHERE LOWER(COALESCE(l.seller_type, '')) = 'business' OR l.business_id IS NOT NULL OR l.store_name IS NOT NULL
       ),
       listing_stats_by_id AS (
         SELECT
           business_ref,
           (ARRAY_AGG(store_name ORDER BY created_at DESC))[1] AS store_name,
           (ARRAY_AGG(city ORDER BY created_at DESC))[1] AS city,
           (ARRAY_AGG(locality ORDER BY created_at DESC))[1] AS locality,
           COUNT(*)::bigint AS total_products_listed,
           COUNT(*) FILTER (WHERE LOWER(status) = 'active')::bigint AS active_products,
           COUNT(*) FILTER (
             WHERE expiry_date IS NOT NULL
               AND expiry_date >= CURRENT_DATE
               AND expiry_date <= (CURRENT_DATE + interval '3 days')
           )::bigint AS near_expiry_products
         FROM listing_raw
         WHERE business_ref IS NOT NULL
         GROUP BY business_ref
       ),
       listing_stats_by_phone AS (
         SELECT
           owner_phone,
           (ARRAY_AGG(store_name ORDER BY created_at DESC))[1] AS store_name,
           (ARRAY_AGG(city ORDER BY created_at DESC))[1] AS city,
           (ARRAY_AGG(locality ORDER BY created_at DESC))[1] AS locality,
           COUNT(*)::bigint AS total_products_listed,
           COUNT(*) FILTER (WHERE LOWER(status) = 'active')::bigint AS active_products,
           COUNT(*) FILTER (
             WHERE expiry_date IS NOT NULL
               AND expiry_date >= CURRENT_DATE
               AND expiry_date <= (CURRENT_DATE + interval '3 days')
           )::bigint AS near_expiry_products
         FROM listing_raw
         WHERE business_ref IS NULL AND owner_phone <> ''
         GROUP BY owner_phone
       )
       SELECT
         u.id::text AS business_id,
         u.name AS owner_name,
         u.phone,
         NULL::text AS email,
         u.created_at,
         COALESCE(lsid.store_name, lsph.store_name, p.name, u.name, 'Business Store') AS store_name,
         COALESCE(p.location_data->>'address', p.location_data->>'street', '') AS address,
         COALESCE(p.location_data->>'city', lsid.city, lsph.city, '') AS city,
         COALESCE(p.location_data->>'locality', lsid.locality, lsph.locality, '') AS locality,
         COALESCE(bs.verification_status, 'unverified') AS verification_status,
         COALESCE(bs.status, 'active') AS account_status,
         bs.reason AS status_reason,
         COALESCE(p.karma, 0) AS store_karma,
         COALESCE(lsid.total_products_listed, lsph.total_products_listed, 0) AS total_products_listed,
         COALESCE(lsid.active_products, lsph.active_products, 0) AS active_products,
         COALESCE(lsid.near_expiry_products, lsph.near_expiry_products, 0) AS near_expiry_products,
         COALESCE(p.location_data->>'storeLogo', p.location_data->>'storeImage', p.location_data->>'profileImage', p.location_data->>'profile_image', p.location_data->>'profileImageUrl', '') AS logo_profile_image
       FROM users u
  LEFT JOIN profiles p ON p.phone = u.phone
  LEFT JOIN admin_business_status bs ON bs.business_id = u.id::text
  LEFT JOIN listing_stats_by_id lsid ON lsid.business_ref = u.id::text
  LEFT JOIN listing_stats_by_phone lsph ON lsph.owner_phone = REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g')
      WHERE (LOWER(COALESCE(u.account_type, '')) = 'business' OR lsid.business_ref IS NOT NULL OR lsph.owner_phone IS NOT NULL)
        AND ($1 = '' OR u.name ILIKE $2 OR u.phone ILIKE $2 OR u.id::text = $1 OR COALESCE(lsid.store_name, lsph.store_name, '') ILIKE $2)
        AND ($3 = '' OR LOWER(COALESCE(bs.status, 'active')) = $3)
        AND ($4 = '' OR LOWER(COALESCE(bs.verification_status, 'unverified')) = $4)
        AND (
          $5 = ''
          OR LOWER(COALESCE(p.location_data->>'city', lsid.city, lsph.city, '')) LIKE $6
          OR LOWER(COALESCE(p.location_data->>'locality', lsid.locality, lsph.locality, '')) LIKE $6
        )
      ORDER BY u.created_at DESC
      LIMIT $7 OFFSET $8`,
      [searchRaw, searchLike, statusFilter, verificationFilter, cityRaw, cityLike, limit, offset],
    );

    const countResult = await getPool().query(
      `WITH listing_raw AS (
         SELECT
           COALESCE(NULLIF(l.business_id, ''), NULLIF(l.seller_id, '')) AS business_ref,
           REGEXP_REPLACE(COALESCE(l.metadata->>'ownerMobile', ''), '\\D', '', 'g') AS owner_phone,
           COALESCE(l.store_name, l.seller_name) AS store_name
         FROM listings l
         WHERE LOWER(COALESCE(l.seller_type, '')) = 'business' OR l.business_id IS NOT NULL OR l.store_name IS NOT NULL
       ),
       listing_stats_by_id AS (
         SELECT business_ref, (ARRAY_AGG(store_name))[1] AS store_name
         FROM listing_raw
         WHERE business_ref IS NOT NULL
         GROUP BY business_ref
       ),
       listing_stats_by_phone AS (
         SELECT owner_phone, (ARRAY_AGG(store_name))[1] AS store_name
         FROM listing_raw
         WHERE business_ref IS NULL AND owner_phone <> ''
         GROUP BY owner_phone
       )
       SELECT COUNT(*)::bigint AS total
         FROM users u
    LEFT JOIN profiles p ON p.phone = u.phone
    LEFT JOIN admin_business_status bs ON bs.business_id = u.id::text
    LEFT JOIN listing_stats_by_id lsid ON lsid.business_ref = u.id::text
    LEFT JOIN listing_stats_by_phone lsph ON lsph.owner_phone = REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g')
        WHERE (LOWER(COALESCE(u.account_type, '')) = 'business' OR lsid.business_ref IS NOT NULL OR lsph.owner_phone IS NOT NULL)
          AND ($1 = '' OR u.name ILIKE $2 OR u.phone ILIKE $2 OR u.id::text = $1 OR COALESCE(lsid.store_name, lsph.store_name, '') ILIKE $2)
          AND ($3 = '' OR LOWER(COALESCE(bs.status, 'active')) = $3)
          AND ($4 = '' OR LOWER(COALESCE(bs.verification_status, 'unverified')) = $4)
          AND (
            $5 = ''
            OR LOWER(COALESCE(p.location_data->>'city', '')) LIKE $6
            OR LOWER(COALESCE(p.location_data->>'locality', '')) LIKE $6
          )`,
      [searchRaw, searchLike, statusFilter, verificationFilter, cityRaw, cityLike],
    );

    const businessIds = baseRowsResult.rows.map((row) => String(row.business_id || '')).filter(Boolean);

    const requestStatsMap = new Map();
    const paymentStatsMap = new Map();
    const lastLoginMap = new Map();

    if (businessIds.length > 0) {
      const [requestStatsResult, paymentStatsResult, loginStatsResult] = await Promise.all([
        getPool().query(
          `SELECT seller_id AS business_id,
                  COUNT(*)::bigint AS orders_received,
                  COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'accepted')::bigint AS accepted_orders,
                  COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'declined')::bigint AS declined_orders,
                  COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('completed', 'collected', 'fulfilled'))::bigint AS completed_orders
             FROM requests
            WHERE seller_id = ANY($1::text[])
            GROUP BY seller_id`,
          [businessIds],
        ),
        getPool().query(
          `SELECT user_id::text AS business_id,
                  COUNT(*)::bigint AS payment_history_count,
                  COALESCE(SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('captured', 'paid', 'success') THEN amount_paise ELSE 0 END), 0)::bigint AS revenue_paise,
                  (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS subscription_payment_status
             FROM buyer_access_payments
            WHERE user_id::text = ANY($1::text[])
            GROUP BY user_id::text`,
          [businessIds],
        ),
        getPool().query(
          `SELECT user_id::text AS business_id, MAX(created_at) AS last_login_at
             FROM security_audit_events
            WHERE user_id::text = ANY($1::text[])
            GROUP BY user_id::text`,
          [businessIds],
        ),
      ]);

      requestStatsResult.rows.forEach((row) => {
        requestStatsMap.set(String(row.business_id), row);
      });
      paymentStatsResult.rows.forEach((row) => {
        paymentStatsMap.set(String(row.business_id), row);
      });
      loginStatsResult.rows.forEach((row) => {
        lastLoginMap.set(String(row.business_id), row.last_login_at || null);
      });
    }

    return res.status(200).json({
      success: true,
      rows: baseRowsResult.rows.map((row) => {
        const requestStats = requestStatsMap.get(String(row.business_id)) || {};
        const paymentStats = paymentStatsMap.get(String(row.business_id)) || {};
        return {
          businessId: row.business_id,
          storeName: row.store_name,
          ownerName: row.owner_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          city: row.city,
          locality: row.locality,
          signupAt: row.created_at,
          lastLoginAt: lastLoginMap.get(String(row.business_id)) || null,
          verificationStatus: row.verification_status,
          subscriptionPaymentStatus: paymentStats.subscription_payment_status || 'none',
          totalProductsListed: Number(row.total_products_listed || 0),
          activeProducts: Number(row.active_products || 0),
          nearExpiryProducts: Number(row.near_expiry_products || 0),
          ordersReceived: Number(requestStats.orders_received || 0),
          acceptedOrders: Number(requestStats.accepted_orders || 0),
          declinedOrders: Number(requestStats.declined_orders || 0),
          completedOrders: Number(requestStats.completed_orders || 0),
          storeKarma: Number(row.store_karma || 0),
          revenuePaise: Number(paymentStats.revenue_paise || 0),
          paymentHistoryCount: Number(paymentStats.payment_history_count || 0),
          accountStatus: row.account_status,
          statusReason: row.status_reason || '',
          logoProfileImage: row.logo_profile_image || '',
        };
      }),
      pagination: {
        page,
        limit,
        total: Number(countResult.rows[0]?.total || 0),
      },
    });
  });

  router.get('/businesses/:businessId', requirePermission('businesses:read'), async (req, res) => {
    const business = await resolveBusinessIdentity(req.params.businessId);
    if (!business) return res.status(404).json({ error: 'Business not found.' });

    const detail = await buildBusinessDetailPayload(business);
    return res.status(200).json({ success: true, ...detail });
  });

  router.put('/businesses/:businessId/status', sensitiveWriteLimiter, requirePermission('businesses:moderate'), async (req, res) => {
    const business = await resolveBusinessIdentity(req.params.businessId);
    if (!business) return res.status(404).json({ error: 'Business not found.' });

    const nextStatus = normalizeBusinessAdminStatus(req.body?.status || '');
    const verificationStatusRaw = String(req.body?.verificationStatus || '').trim().toLowerCase();
    const verificationStatus = (verificationStatusRaw === 'verified' || verificationStatusRaw === 'unverified') ? verificationStatusRaw : '';
    const reason = String(req.body?.reason || '').trim().slice(0, 240);

    if (!nextStatus && !verificationStatus) {
      return res.status(400).json({ error: 'Provide status and/or verificationStatus update.' });
    }

    await getPool().query(
      `INSERT INTO admin_business_status (business_id, status, verification_status, reason, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (business_id) DO UPDATE SET
         status = CASE WHEN $2 <> '' THEN $2 ELSE admin_business_status.status END,
         verification_status = CASE WHEN $3 <> '' THEN $3 ELSE admin_business_status.verification_status END,
         reason = $4,
         updated_by = $5,
         updated_at = now()`,
      [business.business_id, nextStatus || 'active', verificationStatus || 'unverified', reason, req.admin.id],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_business_status_updated',
      targetType: 'business',
      targetId: business.business_id,
      metadata: { status: nextStatus, verificationStatus, reason },
      req,
    });

    return res.status(200).json({
      success: true,
      businessId: business.business_id,
      status: nextStatus || undefined,
      verificationStatus: verificationStatus || undefined,
      reason,
    });
  });

  router.post('/businesses/:businessId/notes', sensitiveWriteLimiter, requirePermission('businesses:note'), async (req, res) => {
    const business = await resolveBusinessIdentity(req.params.businessId);
    if (!business) return res.status(404).json({ error: 'Business not found.' });

    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'Note is required.' });
    if (note.length > 2000) return res.status(400).json({ error: 'Note is too long.' });

    const created = await getPool().query(
      `INSERT INTO admin_business_notes (business_id, admin_id, note)
       VALUES ($1,$2,$3)
       RETURNING id, business_id, note, created_at`,
      [business.business_id, req.admin.id, note],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_business_note_added',
      targetType: 'business',
      targetId: business.business_id,
      metadata: { noteLength: note.length },
      req,
    });

    return res.status(201).json({ success: true, note: created.rows[0] });
  });

  router.get('/businesses/:businessId/export', requirePermission('businesses:read'), async (req, res) => {
    const business = await resolveBusinessIdentity(req.params.businessId);
    if (!business) return res.status(404).json({ error: 'Business not found.' });

    const detail = await buildBusinessDetailPayload(business);
    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_business_exported',
      targetType: 'business',
      targetId: business.business_id,
      metadata: { format: 'json' },
      req,
    });

    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      businessId: business.business_id,
      data: detail,
    });
  });

  router.get('/team-members', requirePermission('dashboard:read'), async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50) || 50));
    const offset = Math.max(0, Number(req.query.offset || 0) || 0);

    const result = await getPool().query(
      `SELECT id, phone, normalized_phone, display_name, role, permissions, status, suspended_reason, last_login_at, created_at, updated_at
         FROM admin_accounts
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return res.status(200).json({
      success: true,
      rows: result.rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        normalizedPhone: row.normalized_phone,
        displayName: row.display_name,
        role: row.role,
        permissions: normalizePermissionList(row.permissions),
        status: row.status,
        suspendedReason: row.suspended_reason || '',
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: { limit, offset },
    });
  });

  router.post('/team-members', sensitiveWriteLimiter, requireSuperAdmin, async (req, res) => {
    const phone = normalizePhone(req.body?.phone || '');
    const pin = String(req.body?.pin || '').trim();
    const role = normalizeRole(req.body?.role || '');
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    const customPermissions = normalizePermissionList(req.body?.permissions || []);

    if (!phone || !/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Valid team member phone is required.' });
    if (!pin || pin.length < 4) return res.status(400).json({ error: 'Valid team member PIN is required.' });
    if (!role || role === ADMIN_ROLES.super_admin) return res.status(400).json({ error: 'Valid non-super role is required.' });
    if (!displayName) return res.status(400).json({ error: 'Display name is required.' });

    const exists = await getPool().query('SELECT id FROM admin_accounts WHERE normalized_phone = $1 LIMIT 1', [phone]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Admin account already exists for this phone.' });

    const rolePermissions = await resolveRolePermissions(role);
    const secret = createPinSecret(pin);

    const created = await getPool().query(
      `INSERT INTO admin_accounts (
        phone, normalized_phone, display_name, role, permissions, password_salt, password_hash, status, created_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'active',$8)
      RETURNING id, phone, normalized_phone, display_name, role, permissions, status, created_at`,
      [
        phone,
        phone,
        displayName,
        role,
        JSON.stringify(mergePermissions(role, [...rolePermissions, ...customPermissions])),
        secret.salt,
        secret.hash,
        req.admin.id,
      ],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_team_member_created',
      targetType: 'admin_account',
      targetId: created.rows[0].id,
      metadata: { role },
      req,
    });

    const row = created.rows[0];
    return res.status(201).json({
      success: true,
      member: {
        id: row.id,
        phone: row.phone,
        normalizedPhone: row.normalized_phone,
        displayName: row.display_name,
        role: row.role,
        permissions: normalizePermissionList(row.permissions),
        status: row.status,
        createdAt: row.created_at,
      },
    });
  });

  router.put('/team-members/:adminId/role', sensitiveWriteLimiter, requireSuperAdmin, async (req, res) => {
    const adminId = String(req.params.adminId || '').trim();
    const role = normalizeRole(req.body?.role || '');
    if (!adminId || !role) return res.status(400).json({ error: 'Admin id and valid role are required.' });
    if (role === ADMIN_ROLES.super_admin) return res.status(400).json({ error: 'Promoting to Super Admin requires manual provisioning.' });

    const existing = await getPool().query('SELECT id, role FROM admin_accounts WHERE id = $1 LIMIT 1', [adminId]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Admin account not found.' });

    const rolePermissions = await resolveRolePermissions(role);
    const updated = await getPool().query(
      `UPDATE admin_accounts
          SET role = $2,
              permissions = $3::jsonb,
              updated_at = now()
        WHERE id = $1
      RETURNING id, display_name, role, permissions, status, updated_at`,
      [adminId, role, JSON.stringify(mergePermissions(role, rolePermissions))],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_role_updated',
      targetType: 'admin_account',
      targetId: adminId,
      metadata: { previousRole: existing.rows[0].role, nextRole: role },
      req,
    });

    return res.status(200).json({ success: true, member: updated.rows[0] });
  });

  router.put('/team-members/:adminId/permissions', sensitiveWriteLimiter, requireSuperAdmin, async (req, res) => {
    const adminId = String(req.params.adminId || '').trim();
    const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
    const requestedPermissions = normalizePermissionList(req.body?.permissions || []);
    if (!adminId) return res.status(400).json({ error: 'Admin id is required.' });

    const existing = await getPool().query('SELECT id, role, permissions FROM admin_accounts WHERE id = $1 LIMIT 1', [adminId]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Admin account not found.' });
    if (existing.rows[0].role === ADMIN_ROLES.super_admin) {
      return res.status(400).json({ error: 'Super Admin permissions are fixed.' });
    }

    const current = normalizePermissionList(existing.rows[0].permissions || []);
    let nextPermissions = current;
    if (mode === 'add') {
      nextPermissions = normalizePermissionList([...current, ...requestedPermissions]);
    } else if (mode === 'remove') {
      nextPermissions = current.filter((entry) => !requestedPermissions.includes(entry));
    } else {
      nextPermissions = requestedPermissions;
    }

    const updated = await getPool().query(
      `UPDATE admin_accounts
          SET permissions = $2::jsonb,
              updated_at = now()
        WHERE id = $1
      RETURNING id, display_name, role, permissions, status, updated_at`,
      [adminId, JSON.stringify(nextPermissions)],
    );

    await writeAuditLog({
      adminId: req.admin.id,
      action: 'admin_permissions_updated',
      targetType: 'admin_account',
      targetId: adminId,
      metadata: { mode, changedPermissions: requestedPermissions },
      req,
    });

    return res.status(200).json({ success: true, member: updated.rows[0] });
  });

  router.put('/team-members/:adminId/suspend', sensitiveWriteLimiter, requireSuperAdmin, async (req, res) => {
    const adminId = String(req.params.adminId || '').trim();
    const suspend = Boolean(req.body?.suspend);
    const reason = String(req.body?.reason || '').trim().slice(0, 240);
    if (!adminId) return res.status(400).json({ error: 'Admin id is required.' });
    if (adminId === req.admin.id && suspend) return res.status(400).json({ error: 'Cannot suspend your own account.' });

    const existing = await getPool().query('SELECT id, role, status FROM admin_accounts WHERE id = $1 LIMIT 1', [adminId]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Admin account not found.' });
    if (existing.rows[0].role === ADMIN_ROLES.super_admin) {
      return res.status(400).json({ error: 'Super Admin account cannot be suspended.' });
    }

    const nextStatus = suspend ? 'suspended' : 'active';
    const updated = await getPool().query(
      `UPDATE admin_accounts
          SET status = $2,
              suspended_reason = CASE WHEN $2 = 'suspended' THEN $3 ELSE NULL END,
              updated_at = now()
        WHERE id = $1
      RETURNING id, display_name, role, status, suspended_reason, updated_at`,
      [adminId, nextStatus, reason],
    );

    if (suspend) {
      await getPool().query('UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL', [adminId]);
    }

    await writeAuditLog({
      adminId: req.admin.id,
      action: suspend ? 'admin_suspended' : 'admin_unsuspended',
      targetType: 'admin_account',
      targetId: adminId,
      metadata: { reason },
      req,
    });

    return res.status(200).json({ success: true, member: updated.rows[0] });
  });

  router.get('/audit-logs', requirePermission('audit_logs:read'), async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50) || 50));
    const offset = Math.max(0, Number(req.query.offset || 0) || 0);

    const rows = await getPool().query(
      `SELECT l.id, l.admin_id, l.action, l.target_type, l.target_id, l.metadata, l.ip_address, l.user_agent, l.created_at,
              a.display_name AS admin_name, a.role AS admin_role
         FROM admin_audit_logs l
         LEFT JOIN admin_accounts a ON a.id = l.admin_id
        ORDER BY l.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return res.status(200).json({
      success: true,
      rows: rows.rows,
      pagination: { limit, offset },
    });
  });

  app.use('/api/admin', router);

  return {
    ensureAdminSchema,
    constants: {
      ADMIN_ROLES,
    },
  };
}
