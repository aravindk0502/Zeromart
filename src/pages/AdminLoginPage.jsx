import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, ShieldCheck } from 'lucide-react';

const ADMIN_TOKEN_KEY = 'drizn_admin_token';
const ADMIN_SESSION_KEY = 'drizn_admin_session';

const apiBase = () => {
  const fromEnv = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '').slice(-10);

async function requestJson(path, options = {}) {
  const base = apiBase();
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || 'Unexpected response.' };
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export default function AdminLoginPage({ navigate = null }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [session, setSession] = useState(null);

  const maskedPhone = useMemo(() => {
    const normalized = normalizePhone(session?.admin?.phone || '');
    if (!normalized) return '';
    return `+91 ******${normalized.slice(-4)}`;
  }, [session?.admin?.phone]);

  const loadSession = async () => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      setSession(null);
      return;
    }
    try {
      const result = await requestJson('/api/admin/auth/me', { token });
      const nextSession = {
        token,
        admin: result?.admin || null,
      };
      setSession(nextSession);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
    } catch {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setSession(null);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  const sendOtp = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    const normalizedPhone = normalizePhone(phone);
    if (!/^\d{10}$/.test(normalizedPhone)) {
      setError('Enter a valid 10-digit admin phone number.');
      return;
    }

    setSendingOtp(true);
    try {
      await requestJson('/api/admin/auth/send-otp', {
        method: 'POST',
        body: { phone: normalizedPhone },
      });
      setOtpSent(true);
      setInfo(`OTP sent to +91 ******${normalizedPhone.slice(-4)}.`);
    } catch (nextError) {
      setError(nextError?.message || 'Could not send OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpAndLogin = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    const normalizedPhone = normalizePhone(phone);
    if (!/^\d{10}$/.test(normalizedPhone)) {
      setError('Enter a valid 10-digit admin phone number.');
      return;
    }
    if (!/^\d{4}$/.test(String(otp || '').trim())) {
      setError('Enter a valid 4-digit OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const result = await requestJson('/api/admin/auth/verify-otp', {
        method: 'POST',
        body: {
          phone: normalizedPhone,
          otp: String(otp || '').trim(),
        },
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, String(result?.token || ''));
      const nextSession = {
        token: String(result?.token || ''),
        expiresAt: result?.expiresAt || '',
        admin: result?.admin || null,
      };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setOtp('');
      setOtpSent(false);
      if (navigate) navigate('/admin');
    } catch (nextError) {
      setError(nextError?.message || 'Could not sign in to admin dashboard.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const resendOtp = async () => {
    setError('');
    setInfo('');
    const normalizedPhone = normalizePhone(phone);
    if (!/^\d{10}$/.test(normalizedPhone)) {
      setError('Enter a valid 10-digit admin phone number.');
      return;
    }

    setSendingOtp(true);
    try {
      await requestJson('/api/admin/auth/resend-otp', {
        method: 'POST',
        body: { phone: normalizedPhone, retryType: 'text' },
      });
      setInfo(`OTP resent to +91 ******${normalizedPhone.slice(-4)}.`);
    } catch (nextError) {
      setError(nextError?.message || 'Could not resend OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    try {
      if (token) {
        await requestJson('/api/admin/auth/logout', { method: 'POST', token });
      }
    } catch {
      // Even if logout request fails, clear local session.
    }
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Drizn Admin</p>
            <h1 className="text-xl font-extrabold">Admin Access</h1>
          </div>
        </div>

        {session?.admin ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Signed in</p>
              <p className="mt-2 text-base font-extrabold text-slate-900">{session.admin.displayName || 'Admin'}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{maskedPhone}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Role: {String(session.admin.role || 'read_only').replaceAll('_', ' ')}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (navigate) {
                  navigate('/admin');
                } else {
                  window.location.href = '/admin';
                }
              }}
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
            >
              Logout Admin Session
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={otpSent ? verifyOtpAndLogin : sendOtp}>
            <label className="block text-sm font-semibold text-slate-700">
              Admin phone number
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit phone"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            {otpSent && (
              <label className="block text-sm font-semibold text-slate-700">
                Admin OTP
                <div className="relative mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit OTP"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <MessageSquare size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
            )}

            {error && (
              <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
            )}

            {info && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{info}</p>
            )}

            <button
              type="submit"
              disabled={sendingOtp || verifyingOtp}
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {otpSent
                ? (verifyingOtp ? 'Verifying OTP...' : 'Verify OTP and Sign in')
                : (sendingOtp ? 'Sending OTP...' : 'Send OTP')}
            </button>

            {otpSent && (
              <button
                type="button"
                onClick={resendOtp}
                disabled={sendingOtp || verifyingOtp}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingOtp ? 'Resending OTP...' : 'Resend OTP'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
