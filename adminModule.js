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
    'dashboard:read', 'users:read', 'businesses:read', 'listings:read', 'orders:read', 'audit_logs:read',
  ],
  [ADMIN_ROLES.support]: [
    'dashboard:read', 'users:read', 'users:note', 'requests:read', 'orders:read', 'notifications:read',
  ],
  [ADMIN_ROLES.finance]: [
    'dashboard:read', 'payments:read', 'payments:export', 'subscriptions:read', 'audit_logs:read',
  ],
  [ADMIN_ROLES.content]: [
    'dashboard:read', 'listings:read', 'listings:moderate', 'notifications:send', 'notifications:template',
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

export function registerAdminModule({ app, getPool, isDbEnabled, createRateLimiter, getClientIp }) {
  const router = express.Router();

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

      CREATE INDEX IF NOT EXISTS admin_accounts_role_idx ON admin_accounts(role);
      CREATE INDEX IF NOT EXISTS admin_accounts_status_idx ON admin_accounts(status);
      CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at DESC);
      CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx ON admin_audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
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

    if (superPhone && superPin) {
      const existing = await getPool().query(
        'SELECT id FROM admin_accounts WHERE normalized_phone = $1 LIMIT 1',
        [superPhone],
      );
      if (!existing.rows[0]) {
        const secret = createPinSecret(superPin);
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

  router.post('/auth/login', loginLimiter, async (req, res) => {
    if (!isDbEnabled() || !getPool()) {
      return res.status(503).json({ error: 'Admin persistence is not configured' });
    }

    const phone = normalizePhone(req.body?.phone || '');
    const pin = String(req.body?.pin || '').trim();
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

    return res.status(200).json({
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
    });
  });

  router.use(adminAuthMiddleware);

  router.get('/auth/me', async (req, res) => {
    return res.status(200).json({
      success: true,
      admin: {
        id: req.admin.id,
        phone: req.admin.phone,
        displayName: req.admin.name,
        role: req.admin.role,
        permissions: req.admin.permissions,
      },
    });
  });

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
