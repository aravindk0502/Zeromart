import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, Clock3, Coins, ListChecks, Search, TriangleAlert, Users } from 'lucide-react';

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

const accountStatusOptions = [
  { value: '', label: 'All status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blocked', label: 'Blocked' },
];

const accountTypeOptions = [
  { value: '', label: 'All accounts' },
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
];

const businessStatusOptions = [
  { value: '', label: 'All status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blocked', label: 'Blocked' },
];

const verificationStatusOptions = [
  { value: '', label: 'All verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
];

const maskedPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '--';
  return `+91 ******${digits.slice(-4)}`;
};

export default function AdminDashboardPage({ navigate, path = '/admin' }) {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [admin, setAdmin] = useState(null);

  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccountType, setFilterAccountType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const [businesses, setBusinesses] = useState([]);
  const [businessesPagination, setBusinessesPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [businessSearchInput, setBusinessSearchInput] = useState('');
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');
  const [businessFilterStatus, setBusinessFilterStatus] = useState('');
  const [businessFilterVerification, setBusinessFilterVerification] = useState('');
  const [businessFilterCity, setBusinessFilterCity] = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [selectedBusinessDetail, setSelectedBusinessDetail] = useState(null);
  const [businessDetailLoading, setBusinessDetailLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [statusReasonInput, setStatusReasonInput] = useState('');
  const [businessNoteInput, setBusinessNoteInput] = useState('');
  const [businessStatusReasonInput, setBusinessStatusReasonInput] = useState('');

  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');

  const normalizedPath = String(path || '/admin').replace(/\/$/, '') || '/admin';
  const isUsersSection = normalizedPath.startsWith('/admin/users');
  const isBusinessesSection = normalizedPath.startsWith('/admin/businesses');
  const isOverviewSection = !isUsersSection && !isBusinessesSection;

  const selectedUserFromPath = useMemo(() => {
    const parts = normalizedPath.split('/').filter(Boolean);
    if (parts[0] !== 'admin' || parts[1] !== 'users') return '';
    return parts[2] ? decodeURIComponent(parts[2]) : '';
  }, [normalizedPath]);

  const selectedBusinessFromPath = useMemo(() => {
    const parts = normalizedPath.split('/').filter(Boolean);
    if (parts[0] !== 'admin' || parts[1] !== 'businesses') return '';
    return parts[2] ? decodeURIComponent(parts[2]) : '';
  }, [normalizedPath]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('recentLimit', '12');
    return params.toString();
  }, [period, fromDate, toDate]);

  const loadSession = async () => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    try {
      const meResult = await requestJson('/api/admin/auth/me', { token });
      setAdmin(meResult?.admin || null);
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
    }
  };

  const loadOverview = async () => {
    if (!token) return;
    setOverviewLoading(true);
    setError('');
    try {
      const result = await requestJson(`/api/admin/dashboard/overview?${queryString}`, { token });
      setOverview(result || null);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load dashboard overview.');
    } finally {
      setOverviewLoading(false);
    }
  };

  const userListQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(usersPagination.page || 1));
    params.set('limit', String(usersPagination.limit || 25));
    if (searchQuery) params.set('search', searchQuery);
    if (filterAccountType) params.set('accountType', filterAccountType);
    if (filterStatus) params.set('status', filterStatus);
    if (filterCity) params.set('city', filterCity);
    return params.toString();
  }, [usersPagination.page, usersPagination.limit, searchQuery, filterAccountType, filterStatus, filterCity]);

  const loadUsers = async () => {
    if (!token || !isUsersSection) return;
    setUsersLoading(true);
    setError('');
    try {
      const result = await requestJson(`/api/admin/users?${userListQuery}`, { token });
      setUsers(result?.rows || []);
      setUsersPagination((prev) => ({
        ...prev,
        page: Number(result?.pagination?.page || prev.page || 1),
        limit: Number(result?.pagination?.limit || prev.limit || 25),
        total: Number(result?.pagination?.total || 0),
      }));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  const businessListQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(businessesPagination.page || 1));
    params.set('limit', String(businessesPagination.limit || 25));
    if (businessSearchQuery) params.set('search', businessSearchQuery);
    if (businessFilterStatus) params.set('status', businessFilterStatus);
    if (businessFilterVerification) params.set('verificationStatus', businessFilterVerification);
    if (businessFilterCity) params.set('city', businessFilterCity);
    return params.toString();
  }, [businessesPagination.page, businessesPagination.limit, businessSearchQuery, businessFilterStatus, businessFilterVerification, businessFilterCity]);

  const loadBusinesses = async () => {
    if (!token || !isBusinessesSection) return;
    setBusinessesLoading(true);
    setError('');
    try {
      const result = await requestJson(`/api/admin/businesses?${businessListQuery}`, { token });
      setBusinesses(result?.rows || []);
      setBusinessesPagination((prev) => ({
        ...prev,
        page: Number(result?.pagination?.page || prev.page || 1),
        limit: Number(result?.pagination?.limit || prev.limit || 25),
        total: Number(result?.pagination?.total || 0),
      }));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load businesses.');
    } finally {
      setBusinessesLoading(false);
    }
  };

  const loadBusinessDetail = async (businessId) => {
    if (!token || !businessId) {
      setSelectedBusinessDetail(null);
      return;
    }
    setBusinessDetailLoading(true);
    setError('');
    try {
      const result = await requestJson(`/api/admin/businesses/${encodeURIComponent(businessId)}`, { token });
      setSelectedBusinessDetail(result || null);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load business details.');
    } finally {
      setBusinessDetailLoading(false);
    }
  };

  const loadUserDetail = async (userId) => {
    if (!token || !userId) {
      setSelectedUserDetail(null);
      return;
    }
    setUserDetailLoading(true);
    setError('');
    try {
      const result = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}`, { token });
      setSelectedUserDetail(result || null);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load user details.');
    } finally {
      setUserDetailLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    if (isOverviewSection) {
      loadOverview();
    }
  }, [token, queryString, isOverviewSection]);

  useEffect(() => {
    if (isUsersSection) {
      loadUsers();
    }
  }, [token, isUsersSection, userListQuery]);

  useEffect(() => {
    if (isBusinessesSection) {
      loadBusinesses();
    }
  }, [token, isBusinessesSection, businessListQuery]);

  useEffect(() => {
    setSelectedUserId(selectedUserFromPath || '');
  }, [selectedUserFromPath]);

  useEffect(() => {
    if (isUsersSection && selectedUserId) {
      loadUserDetail(selectedUserId);
    }
    if (isUsersSection && !selectedUserId) {
      setSelectedUserDetail(null);
    }
  }, [token, isUsersSection, selectedUserId]);

  useEffect(() => {
    setSelectedBusinessId(selectedBusinessFromPath || '');
  }, [selectedBusinessFromPath]);

  useEffect(() => {
    if (isBusinessesSection && selectedBusinessId) {
      loadBusinessDetail(selectedBusinessId);
    }
    if (isBusinessesSection && !selectedBusinessId) {
      setSelectedBusinessDetail(null);
    }
  }, [token, isBusinessesSection, selectedBusinessId]);

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

  const goToOverview = () => navigate('/admin');
  const goToUsers = () => navigate('/admin/users');
  const goToBusinesses = () => navigate('/admin/businesses');

  const openUserDetails = (userId) => {
    navigate(`/admin/users/${encodeURIComponent(userId)}`);
  };

  const openBusinessDetails = (businessId) => {
    navigate(`/admin/businesses/${encodeURIComponent(businessId)}`);
  };

  const applySearch = (event) => {
    event.preventDefault();
    setUsersPagination((prev) => ({ ...prev, page: 1 }));
    setSearchQuery(searchInput.trim());
  };

  const applyBusinessSearch = (event) => {
    event.preventDefault();
    setBusinessesPagination((prev) => ({ ...prev, page: 1 }));
    setBusinessSearchQuery(businessSearchInput.trim());
  };

  const updateUserStatus = async (status) => {
    if (!selectedUserId) return;
    setActionBusy(`status:${status}`);
    setError('');
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(selectedUserId)}/status`, {
        method: 'PUT',
        token,
        body: {
          status,
          reason: statusReasonInput.trim(),
        },
      });
      await loadUsers();
      await loadUserDetail(selectedUserId);
      setStatusReasonInput('');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to update user status.');
    } finally {
      setActionBusy('');
    }
  };

  const addSupportNote = async () => {
    if (!selectedUserId || !noteInput.trim()) return;
    setActionBusy('note');
    setError('');
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(selectedUserId)}/notes`, {
        method: 'POST',
        token,
        body: {
          note: noteInput.trim(),
        },
      });
      setNoteInput('');
      await loadUserDetail(selectedUserId);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add note.');
    } finally {
      setActionBusy('');
    }
  };

  const exportUserData = async () => {
    if (!selectedUserId) return;
    setActionBusy('export');
    setError('');
    try {
      const result = await requestJson(`/api/admin/users/${encodeURIComponent(selectedUserId)}/export`, { token });
      const payload = JSON.stringify(result?.data || {}, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `drizn-user-export-${selectedUserId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to export user data.');
    } finally {
      setActionBusy('');
    }
  };

  const updateBusinessStatus = async ({ status = '', verificationStatus = '' } = {}) => {
    if (!selectedBusinessId) return;
    setActionBusy(`business:${status || verificationStatus}`);
    setError('');
    try {
      await requestJson(`/api/admin/businesses/${encodeURIComponent(selectedBusinessId)}/status`, {
        method: 'PUT',
        token,
        body: {
          status,
          verificationStatus,
          reason: businessStatusReasonInput.trim(),
        },
      });
      await loadBusinesses();
      await loadBusinessDetail(selectedBusinessId);
      setBusinessStatusReasonInput('');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to update business status.');
    } finally {
      setActionBusy('');
    }
  };

  const addBusinessNote = async () => {
    if (!selectedBusinessId || !businessNoteInput.trim()) return;
    setActionBusy('business-note');
    setError('');
    try {
      await requestJson(`/api/admin/businesses/${encodeURIComponent(selectedBusinessId)}/notes`, {
        method: 'POST',
        token,
        body: { note: businessNoteInput.trim() },
      });
      setBusinessNoteInput('');
      await loadBusinessDetail(selectedBusinessId);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add business note.');
    } finally {
      setActionBusy('');
    }
  };

  const exportBusinessData = async () => {
    if (!selectedBusinessId) return;
    setActionBusy('business-export');
    setError('');
    try {
      const result = await requestJson(`/api/admin/businesses/${encodeURIComponent(selectedBusinessId)}/export`, { token });
      const payload = JSON.stringify(result?.data || {}, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `drizn-business-export-${selectedBusinessId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to export business data.');
    } finally {
      setActionBusy('');
    }
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
            <h1 className="text-2xl font-black text-slate-900">{isUsersSection ? 'User Management' : isBusinessesSection ? 'Business Management' : 'Overview'}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{admin?.displayName || 'Admin'} · {String(admin?.role || 'read_only').replaceAll('_', ' ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goToOverview}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${isUsersSection ? 'border border-slate-200 bg-white text-slate-700' : 'bg-emerald-700 text-white'}`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={goToUsers}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${isUsersSection ? 'bg-emerald-700 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
            >
              Users
            </button>
            <button
              type="button"
              onClick={goToBusinesses}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${isBusinessesSection ? 'bg-emerald-700 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
            >
              Businesses
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {isOverviewSection ? (
          <>
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

            {overviewLoading ? (
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
          </>
        ) : isUsersSection ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <form onSubmit={applySearch} className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <label className="md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Search</span>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                    <Search size={16} className="text-slate-500" />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Name, phone, user ID"
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    />
                  </div>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Account type</span>
                  <select
                    value={filterAccountType}
                    onChange={(event) => {
                      setUsersPagination((prev) => ({ ...prev, page: 1 }));
                      setFilterAccountType(event.target.value);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  >
                    {accountTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Status</span>
                  <select
                    value={filterStatus}
                    onChange={(event) => {
                      setUsersPagination((prev) => ({ ...prev, page: 1 }));
                      setFilterStatus(event.target.value);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  >
                    {accountStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">City/locality</span>
                  <input
                    value={filterCity}
                    onChange={(event) => {
                      setUsersPagination((prev) => ({ ...prev, page: 1 }));
                      setFilterCity(event.target.value);
                    }}
                    placeholder="City"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white"
                  >
                    Apply
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr,1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] text-left text-xs">
                    <thead className="bg-slate-50 uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Photo</th>
                        <th className="px-3 py-3">User</th>
                        <th className="px-3 py-3">Phone</th>
                        <th className="px-3 py-3">Email</th>
                        <th className="px-3 py-3">User ID</th>
                        <th className="px-3 py-3">Type</th>
                        <th className="px-3 py-3">Signup</th>
                        <th className="px-3 py-3">Last login</th>
                        <th className="px-3 py-3">Last active</th>
                        <th className="px-3 py-3">Duration</th>
                        <th className="px-3 py-3">City/locality</th>
                        <th className="px-3 py-3">Location</th>
                        <th className="px-3 py-3">Karma</th>
                        <th className="px-3 py-3">Listings</th>
                        <th className="px-3 py-3">Requested</th>
                        <th className="px-3 py-3">Collected</th>
                        <th className="px-3 py-3">Payments</th>
                        <th className="px-3 py-3">Pay status</th>
                        <th className="px-3 py-3">Amount paid</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Device/session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersLoading ? (
                        <tr>
                          <td colSpan={21} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">Loading users...</td>
                        </tr>
                      ) : (
                        users.map((row) => (
                          <tr
                            key={row.userId}
                            className={`cursor-pointer border-t border-slate-100 ${selectedUserId === row.userId ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                            onClick={() => openUserDetails(row.userId)}
                          >
                            <td className="px-3 py-2.5">
                              {row.profilePicture ? (
                                <img src={row.profilePicture} alt={row.name || 'User'} className="h-8 w-8 rounded-full object-cover" />
                              ) : (
                                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
                                  {(row.name || 'U').slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{row.name || 'Unknown'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{maskedPhone(row.phone)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.email || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.userId}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{String(row.accountType || 'personal').replaceAll('_', ' ')}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{dateLabel(row.signupAt)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{dateLabel(row.lastLoginAt)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{dateLabel(row.lastActiveAt)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.sessionDuration || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{[row.city, row.locality].filter(Boolean).join(', ') || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.locationData?.city || row.locationData?.locality || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.karma || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.listingsCount || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.productsRequested || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.productsCollected || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.purchasePaymentHistoryCount || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.paymentStatus || 'none'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">Rs {numberFormat.format(Number(row.totalAmountPaidPaise || 0) / 100)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.accountStatus || 'active'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.deviceSessionInfo ? 'available' : '--'}</td>
                          </tr>
                        ))
                      )}
                      {!usersLoading && users.length === 0 && (
                        <tr>
                          <td colSpan={21} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">No users found for current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                  <p>
                    Page {usersPagination.page} · {numberFormat.format(usersPagination.total)} users
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={usersPagination.page <= 1}
                      onClick={() => setUsersPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={usersPagination.page * usersPagination.limit >= usersPagination.total}
                      onClick={() => setUsersPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {!selectedUserId ? (
                  <p className="text-sm font-semibold text-slate-500">Select a user to view full details and actions.</p>
                ) : userDetailLoading ? (
                  <p className="text-sm font-semibold text-slate-500">Loading user details...</p>
                ) : selectedUserDetail?.profile ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Profile</p>
                      <p className="mt-1 text-base font-black text-slate-900">{selectedUserDetail.profile.name || 'Unknown'}</p>
                      <p className="text-sm font-semibold text-slate-600">{maskedPhone(selectedUserDetail.profile.phone)}</p>
                      <p className="text-xs font-semibold text-slate-600">ID: {selectedUserDetail.profile.userId}</p>
                      <p className="text-xs font-semibold text-slate-600">Status: {selectedUserDetail.profile.accountStatus}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                      <div className="rounded-lg border border-slate-200 p-2">Listings: {numberFormat.format(Number(selectedUserDetail.profile.listingsCount || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Requested: {numberFormat.format(Number(selectedUserDetail.profile.productsRequested || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Collected: {numberFormat.format(Number(selectedUserDetail.profile.productsCollected || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Karma: {numberFormat.format(Number(selectedUserDetail.profile.karma || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Payment status: {selectedUserDetail.profile.paymentStatus || 'none'}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Amount paid: Rs {numberFormat.format(Number(selectedUserDetail.profile.totalAmountPaidPaise || 0) / 100)}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Accepted requests: {numberFormat.format(Number(selectedUserDetail.requests?.acceptedCount || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Declined requests: {numberFormat.format(Number(selectedUserDetail.requests?.declinedCount || 0))}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Login history</p>
                      <div className="mt-2 max-h-40 overflow-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {(selectedUserDetail.loginHistory || []).slice(0, 20).map((item) => (
                              <tr key={item.id} className="border-t border-slate-100">
                                <td className="py-1 pr-2 font-semibold text-slate-700">{item.event_type}</td>
                                <td className="py-1 text-right font-semibold text-slate-500">{dateLabel(item.created_at)}</td>
                              </tr>
                            ))}
                            {(!selectedUserDetail.loginHistory || selectedUserDetail.loginHistory.length === 0) && (
                              <tr>
                                <td className="py-1 text-xs font-semibold text-slate-500">No login history tracked.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Moderation</p>
                      <input
                        value={statusReasonInput}
                        onChange={(event) => setStatusReasonInput(event.target.value)}
                        placeholder="Reason (optional)"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateUserStatus('active')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50">Activate</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateUserStatus('suspended')} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-50">Suspend</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateUserStatus('blocked')} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">Block</button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Internal note</p>
                      <textarea
                        value={noteInput}
                        onChange={(event) => setNoteInput(event.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                        placeholder="Add support/internal note"
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={!noteInput.trim() || Boolean(actionBusy)} onClick={addSupportNote} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save Note</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={exportUserData} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50">Export JSON</button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Support notes</p>
                      <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                        {(selectedUserDetail.supportNotes || []).map((note) => (
                          <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                            <p className="text-xs font-semibold text-slate-800">{note.note}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{note.admin_name || 'Admin'} · {dateLabel(note.created_at)}</p>
                          </div>
                        ))}
                        {(!selectedUserDetail.supportNotes || selectedUserDetail.supportNotes.length === 0) && (
                          <p className="text-xs font-semibold text-slate-500">No support notes yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Activity timeline</p>
                      <div className="mt-2 max-h-40 overflow-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {(selectedUserDetail.activityTimeline || []).slice(0, 20).map((item, index) => (
                              <tr key={`${item.entity_id || 'x'}-${index}`} className="border-t border-slate-100">
                                <td className="py-1 pr-2 font-semibold text-slate-700">{item.event_type}</td>
                                <td className="py-1 text-right font-semibold text-slate-500">{dateLabel(item.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                      <div className="rounded-lg border border-slate-200 p-2">Listings: {numberFormat.format(Number(selectedUserDetail.listings?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Requests: {numberFormat.format(Number(selectedUserDetail.requests?.rows?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Favourites: {numberFormat.format(Number(selectedUserDetail.favourites?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Notifications: {numberFormat.format(Number(selectedUserDetail.notifications?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Karma history: {numberFormat.format(Number(selectedUserDetail.karmaHistory?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Payments: {numberFormat.format(Number(selectedUserDetail.payments?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Reports: {numberFormat.format(Number(selectedUserDetail.reports?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Orders: {numberFormat.format(Number(selectedUserDetail.orders?.length || 0))}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Listings preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.listings || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.title || 'Listing'} · {item.status || 'unknown'} · {dateLabel(item.created_at)}</p>
                        ))}
                        {(!selectedUserDetail.listings || selectedUserDetail.listings.length === 0) && <p className="text-slate-500">No listings.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Requests preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.requests?.rows || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.id} · {item.status || 'unknown'} · qty {item.quantity || 0}</p>
                        ))}
                        {(!selectedUserDetail.requests?.rows || selectedUserDetail.requests.rows.length === 0) && <p className="text-slate-500">No requests.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Favourites preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.favourites || []).slice(0, 5).map((item) => (
                          <p key={`${item.product_id}`}>{item.title || 'Product'} · {item.category || 'Other'}</p>
                        ))}
                        {(!selectedUserDetail.favourites || selectedUserDetail.favourites.length === 0) && <p className="text-slate-500">No favourites.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Notifications preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.notifications || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.title || 'Notification'} · {item.status || 'sent'}</p>
                        ))}
                        {(!selectedUserDetail.notifications || selectedUserDetail.notifications.length === 0) && <p className="text-slate-500">No notifications.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Karma history preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.karmaHistory || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.points || 0} pts · {item.note || 'No note'} · {dateLabel(item.created_at)}</p>
                        ))}
                        {(!selectedUserDetail.karmaHistory || selectedUserDetail.karmaHistory.length === 0) && <p className="text-slate-500">No karma events.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Payments preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.payments || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.status || 'unknown'} · Rs {numberFormat.format(Number(item.amount_paise || 0) / 100)} · {dateLabel(item.created_at)}</p>
                        ))}
                        {(!selectedUserDetail.payments || selectedUserDetail.payments.length === 0) && <p className="text-slate-500">No payments.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Reports preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedUserDetail.reports || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.event_type || 'event'} · {item.status || 'warning'} · {dateLabel(item.created_at)}</p>
                        ))}
                        {(!selectedUserDetail.reports || selectedUserDetail.reports.length === 0) && <p className="text-slate-500">No reports.</p>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">User details are unavailable.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <form onSubmit={applyBusinessSearch} className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <label className="md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Search store/owner/phone</span>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                    <Search size={16} className="text-slate-500" />
                    <input
                      value={businessSearchInput}
                      onChange={(event) => setBusinessSearchInput(event.target.value)}
                      placeholder="Store, owner, phone, business ID"
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    />
                  </div>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Status</span>
                  <select
                    value={businessFilterStatus}
                    onChange={(event) => {
                      setBusinessesPagination((prev) => ({ ...prev, page: 1 }));
                      setBusinessFilterStatus(event.target.value);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  >
                    {businessStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Verification</span>
                  <select
                    value={businessFilterVerification}
                    onChange={(event) => {
                      setBusinessesPagination((prev) => ({ ...prev, page: 1 }));
                      setBusinessFilterVerification(event.target.value);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  >
                    {verificationStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">City/locality</span>
                  <input
                    value={businessFilterCity}
                    onChange={(event) => {
                      setBusinessesPagination((prev) => ({ ...prev, page: 1 }));
                      setBusinessFilterCity(event.target.value);
                    }}
                    placeholder="City"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                  />
                </label>
                <div className="flex items-end">
                  <button type="submit" className="w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white">Apply</button>
                </div>
              </form>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr,1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-[1250px] text-left text-xs">
                    <thead className="bg-slate-50 uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Store</th>
                        <th className="px-3 py-3">Owner</th>
                        <th className="px-3 py-3">Phone</th>
                        <th className="px-3 py-3">Email</th>
                        <th className="px-3 py-3">Address</th>
                        <th className="px-3 py-3">City/locality</th>
                        <th className="px-3 py-3">Signup</th>
                        <th className="px-3 py-3">Last login</th>
                        <th className="px-3 py-3">Verification</th>
                        <th className="px-3 py-3">Payment status</th>
                        <th className="px-3 py-3">Total products</th>
                        <th className="px-3 py-3">Active</th>
                        <th className="px-3 py-3">Near expiry</th>
                        <th className="px-3 py-3">Orders</th>
                        <th className="px-3 py-3">A/D/C</th>
                        <th className="px-3 py-3">Karma</th>
                        <th className="px-3 py-3">Revenue</th>
                        <th className="px-3 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {businessesLoading ? (
                        <tr>
                          <td colSpan={18} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">Loading businesses...</td>
                        </tr>
                      ) : (
                        businesses.map((row) => (
                          <tr
                            key={row.businessId}
                            onClick={() => openBusinessDetails(row.businessId)}
                            className={`cursor-pointer border-t border-slate-100 ${selectedBusinessId === row.businessId ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                          >
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{row.storeName || 'Business Store'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.ownerName || 'Unknown'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{maskedPhone(row.phone)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.email || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.address || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{[row.city, row.locality].filter(Boolean).join(', ') || '--'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{dateLabel(row.signupAt)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{dateLabel(row.lastLoginAt)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.verificationStatus || 'unverified'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.subscriptionPaymentStatus || 'none'}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.totalProductsListed || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.activeProducts || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.nearExpiryProducts || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.ordersReceived || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.acceptedOrders || 0))}/{numberFormat.format(Number(row.declinedOrders || 0))}/{numberFormat.format(Number(row.completedOrders || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{numberFormat.format(Number(row.storeKarma || 0))}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">Rs {numberFormat.format(Number(row.revenuePaise || 0) / 100)}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.accountStatus || 'active'}</td>
                          </tr>
                        ))
                      )}
                      {!businessesLoading && businesses.length === 0 && (
                        <tr>
                          <td colSpan={18} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">No businesses found for current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                  <p>Page {businessesPagination.page} · {numberFormat.format(businessesPagination.total)} businesses</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={businessesPagination.page <= 1}
                      onClick={() => setBusinessesPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={businessesPagination.page * businessesPagination.limit >= businessesPagination.total}
                      onClick={() => setBusinessesPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {!selectedBusinessId ? (
                  <p className="text-sm font-semibold text-slate-500">Select a business to view complete store profile and actions.</p>
                ) : businessDetailLoading ? (
                  <p className="text-sm font-semibold text-slate-500">Loading business details...</p>
                ) : selectedBusinessDetail?.profile ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Store profile</p>
                      <p className="mt-1 text-base font-black text-slate-900">{selectedBusinessDetail.profile.storeName || 'Business Store'}</p>
                      <p className="text-sm font-semibold text-slate-600">Owner: {selectedBusinessDetail.profile.ownerName || 'Unknown'}</p>
                      <p className="text-sm font-semibold text-slate-600">{maskedPhone(selectedBusinessDetail.profile.phone)}</p>
                      <p className="text-xs font-semibold text-slate-600">ID: {selectedBusinessDetail.profile.businessId}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                      <div className="rounded-lg border border-slate-200 p-2">Products: {numberFormat.format(Number(selectedBusinessDetail.profile.totalProductsListed || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Active: {numberFormat.format(Number(selectedBusinessDetail.profile.activeProducts || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Near expiry: {numberFormat.format(Number(selectedBusinessDetail.profile.nearExpiryProducts || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Orders received: {numberFormat.format(Number(selectedBusinessDetail.profile.ordersReceived || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Accepted/Declined/Completed: {numberFormat.format(Number(selectedBusinessDetail.profile.acceptedOrders || 0))}/{numberFormat.format(Number(selectedBusinessDetail.profile.declinedOrders || 0))}/{numberFormat.format(Number(selectedBusinessDetail.profile.completedOrders || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Store karma: {numberFormat.format(Number(selectedBusinessDetail.profile.storeKarma || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Revenue: Rs {numberFormat.format(Number(selectedBusinessDetail.profile.revenuePaise || 0) / 100)}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Payment status: {selectedBusinessDetail.profile.subscriptionPaymentStatus || 'none'}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Verification: {selectedBusinessDetail.profile.verificationStatus || 'unverified'}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Account status: {selectedBusinessDetail.profile.accountStatus || 'active'}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Admin actions</p>
                      <input
                        value={businessStatusReasonInput}
                        onChange={(event) => setBusinessStatusReasonInput(event.target.value)}
                        placeholder="Reason (optional)"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateBusinessStatus({ verificationStatus: 'verified' })} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50">Approve/Verify</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateBusinessStatus({ verificationStatus: 'unverified' })} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50">Unverify</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateBusinessStatus({ status: 'active' })} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50">Activate</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateBusinessStatus({ status: 'suspended' })} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-50">Suspend</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => updateBusinessStatus({ status: 'blocked' })} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">Block</button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Internal note</p>
                      <textarea
                        value={businessNoteInput}
                        onChange={(event) => setBusinessNoteInput(event.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-900"
                        placeholder="Add internal note for this business"
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={!businessNoteInput.trim() || Boolean(actionBusy)} onClick={addBusinessNote} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save Note</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={exportBusinessData} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50">Export JSON</button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Support notes</p>
                      <div className="mt-2 max-h-32 space-y-2 overflow-auto">
                        {(selectedBusinessDetail.supportNotes || []).map((note) => (
                          <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                            <p className="text-xs font-semibold text-slate-800">{note.note}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{note.admin_name || 'Admin'} · {dateLabel(note.created_at)}</p>
                          </div>
                        ))}
                        {(!selectedBusinessDetail.supportNotes || selectedBusinessDetail.supportNotes.length === 0) && <p className="text-xs font-semibold text-slate-500">No notes yet.</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                      <div className="rounded-lg border border-slate-200 p-2">Listings: {numberFormat.format(Number(selectedBusinessDetail.listings?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Order history: {numberFormat.format(Number(selectedBusinessDetail.ordersReceived?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Notifications: {numberFormat.format(Number(selectedBusinessDetail.notifications?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Karma history: {numberFormat.format(Number(selectedBusinessDetail.karmaHistory?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Payment history: {numberFormat.format(Number(selectedBusinessDetail.payments?.length || 0))}</div>
                      <div className="rounded-lg border border-slate-200 p-2">Activity timeline: {numberFormat.format(Number(selectedBusinessDetail.activityTimeline?.length || 0))}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Listings preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedBusinessDetail.listings || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.title || 'Listing'} · {item.status || 'unknown'} · expiry {item.expiry_date || '--'}</p>
                        ))}
                        {(!selectedBusinessDetail.listings || selectedBusinessDetail.listings.length === 0) && <p className="text-slate-500">No listings.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Order history preview</p>
                      <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                        {(selectedBusinessDetail.ordersReceived || []).slice(0, 5).map((item) => (
                          <p key={item.id}>{item.id} · {item.status || 'unknown'} · qty {item.quantity || 0}</p>
                        ))}
                        {(!selectedBusinessDetail.ordersReceived || selectedBusinessDetail.ordersReceived.length === 0) && <p className="text-slate-500">No orders.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Activity timeline</p>
                      <div className="mt-2 max-h-32 overflow-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {(selectedBusinessDetail.activityTimeline || []).slice(0, 20).map((item, index) => (
                              <tr key={`${item.entity_id || 'x'}-${index}`} className="border-t border-slate-100">
                                <td className="py-1 pr-2 font-semibold text-slate-700">{item.event_type}</td>
                                <td className="py-1 text-right font-semibold text-slate-500">{dateLabel(item.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">Business details are unavailable.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
