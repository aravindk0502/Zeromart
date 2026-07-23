import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, Clock3, Coins, ListChecks, TriangleAlert, Users } from 'lucide-react';

const ADMIN_TOKEN_KEY = 'drizn_admin_token';
const ADMIN_SESSION_KEY = 'drizn_admin_session';

const apiBase = () => {
  const fromEnv = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};

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

const numberFormat = new Intl.NumberFormat('en-IN');
const dateLabel = (iso) => {
  if (!iso) return '--';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

export default function AdminDashboardPage({ navigate }) {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [period, setPeriod] = useState('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState(null);
  const [overview, setOverview] = useState(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('recentLimit', '12');
    return params.toString();
  }, [period, fromDate, toDate]);

  const loadOverview = async () => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [meResult, overviewResult] = await Promise.all([
        requestJson('/api/admin/auth/me', { token }),
        requestJson(`/api/admin/dashboard/overview?${queryString}`, { token }),
      ]);
      setAdmin(meResult?.admin || null);
      setOverview(overviewResult || null);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        token,
        admin: meResult?.admin || null,
      }));
    } catch (nextError) {
      const status = Number(nextError?.status || 0);
      if (status === 401) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        setToken('');
        navigate('/admin/login');
        return;
      }
      setError(nextError?.message || 'Unable to load dashboard overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [token, queryString]);

  const handleLogout = async () => {
    try {
      if (token) {
        await requestJson('/api/admin/auth/logout', { method: 'POST', token });
      }
    } catch {
      // Local cleanup still proceeds on failure.
    }
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setToken('');
    navigate('/admin/login');
  };

  const summary = overview?.summary || {};
  const revenueInr = Number(summary?.revenue?.amountPaise || 0) / 100;

  const cards = [
    { label: 'Total users', value: summary.totalUsers, icon: Users },
    { label: 'New users today', value: summary.newUsersToday, icon: Clock3 },
    { label: 'New users week', value: summary.newUsersWeek, icon: Clock3 },
    { label: 'New users month', value: summary.newUsersMonth, icon: Clock3 },
    { label: 'Active users', value: summary.activeUsers, icon: Activity },
    { label: 'Total businesses', value: summary.totalBusinesses, icon: Building2 },
    { label: 'Total listings', value: summary.totalListings, icon: ListChecks },
    { label: 'Active listings', value: summary.activeListings, icon: ListChecks },
    { label: 'Completed collections', value: summary.completedCollections, icon: ListChecks },
    { label: 'Revenue (INR)', value: `Rs ${numberFormat.format(revenueInr)}`, icon: Coins },
    { label: 'Total karma', value: summary.totalKarma, icon: Activity },
    { label: 'Pending requests', value: summary.pendingRequests, icon: TriangleAlert },
    { label: 'Failed payments', value: summary.failedPayments, icon: TriangleAlert },
  ];

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Drizn Admin Dashboard</p>
            <h1 className="text-2xl font-black text-slate-900">Overview</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{admin?.displayName || 'Admin'} · {String(admin?.role || 'read_only').replaceAll('_', ' ')}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700"
          >
            Logout
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            Range preset
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900"
            />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Resolved window</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">{dateLabel(overview?.filters?.from)}</p>
            <p className="text-xs font-semibold text-slate-700">{dateLabel(overview?.filters?.to)}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading dashboard...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{card.label}</p>
                      <Icon size={16} className="text-emerald-700" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-slate-900">{typeof card.value === 'number' ? numberFormat.format(card.value) : card.value}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Recent Signups</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.recentSignups || []).map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.name || 'Unknown'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{item.phone || '--'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{String(item.accountType || 'personal').replaceAll('_', ' ')}</td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{dateLabel(item.createdAt)}</td>
                      </tr>
                    ))}
                    {(!overview?.recentSignups || overview.recentSignups.length === 0) && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">No signups available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
