import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BarChart3, Boxes, Check, ChevronRight, CircleDollarSign, ClipboardList,
  Home, Info, LogOut, MapPin, Menu, PackagePlus, Plus, Settings2, ShieldCheck,
  Sparkles, Store, Trash2, TrendingUp, Upload, UserRound, X,
} from 'lucide-react';
import BusinessAuthModal from '../components/BusinessAuthModal';
import CollectionPass, { getCollectionPassState } from '../components/CollectionPass';
import LocationMap from '../components/LocationMap';
import LocationPicker from '../components/LocationPicker';
import OrderTrackingModal from '../components/OrderTrackingModal';
import PhoneChangeModal from '../components/PhoneChangeModal';
import { useLocationEngine } from '../hooks/useLocationEngine';
import { formatShortAddress, haversineKm, locationLabel, withAddressDetails } from '../services/locationService';
import {
  createWhatsAppLink, expireReservations, getCollectionSettings, getReservations, saveCollectionSettings, saveReservations,
  savePendingKarmaAction, updatePurchaseHistoryStatus, upsertLiveListing, removeLiveListing,
} from '../services/transactionService';
import {
  applyExpiryRules, clearBusinessSession, daysUntilExpiry, getBusinessAccounts,
  getBusinessOrders, getBusinessProducts, getBusinessPurchases, getBusinessRules, getBusinessSession,
  saveBusinessAccounts, saveBusinessOrders, saveBusinessProducts, saveBusinessRules, saveBusinessSession,
  DEFAULT_BUSINESS_RULES,
  toMarketplaceItem, updateBusinessPurchaseStatus, updateCustomerOrderStatus,
} from '../lib/businessStore';
import {
  deleteListingFromBackend,
  saveListingToBackend,
} from '../services/liveListingService';
import { isLoggedIn, updateProfile, uploadImage } from '../lib/api';

const links = [
  { path: '/business/dashboard', label: 'Business Dashboard', icon: Home },
  { path: '/business/inventory', label: 'Inventory', icon: Boxes },
  { path: '/business/rules', label: 'Rules', icon: Settings2 },
  { path: '/business/orders', label: 'Orders', icon: ClipboardList },
  { path: '/business/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/business/profile', label: 'Profile', icon: UserRound },
];

const emptyProduct = {
  name: '', category: 'Food', quantity: 1, mrp: 0, sellingPrice: 0, expiryDate: '', expiryTime: '',
  image: '', description: '', pickupLocation: '', autoList: true,
};

const PAGE_HELP = {
  dashboard: 'This dashboard summarizes your inventory, orders, recovered value, waste saved, and Store Good Karma.',
  inventory: 'Add products manually or upload a CSV. Products with Auto-list ON appear in the local business marketplace.',
  rules: 'Expiry rules identify near-expiry deals by category. Auto-list controls whether eligible stock is published.',
  orders: 'Search collection IDs, set collection availability, and manage every buyer request from this page.',
  analytics: 'Analytics shows how many products, buyers, and completed collections your business has supported.',
  profile: 'Update your store identity and geotag here. Your order history also appears on this page.',
};

const readInitialBusinessRules = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('zeromart-business-rules') || 'null');
    return Array.isArray(saved) ? saved : DEFAULT_BUSINESS_RULES;
  } catch {
    return DEFAULT_BUSINESS_RULES;
  }
};

export default function BusinessPortal({ path, navigate }) {
  const [account, setAccount] = useState(getBusinessSession);
  const [products, setProducts] = useState(() => {
    return applyExpiryRules(getBusinessProducts(), readInitialBusinessRules());
  });
  const [rules, setRules] = useState(() => readInitialBusinessRules());
  const [orders, setOrders] = useState(getBusinessOrders);
  const [mobileNav, setMobileNav] = useState(false);
  const [inventoryMode, setInventoryMode] = useState('manual');
  const [helpToast, setHelpToast] = useState(null);
  const [karmaReceivedToast, setKarmaReceivedToast] = useState(null);
  const [karmaReceivedQueue, setKarmaReceivedQueue] = useState([]);
  const [liveSyncError, setLiveSyncError] = useState('');
  const helpTimer = useRef(null);
  const lastHelp = useRef({ message: '', time: 0 });
  const seenKarmaToastIdsRef = useRef(new Set());

  const showHelp = (message, tone = 'info', source = 'page') => {
    if (!message) return;
    const now = Date.now();
    if (tone === 'info' && lastHelp.current.message === message && now - lastHelp.current.time < 1500) return;
    lastHelp.current = { message, time: now };
    window.clearTimeout(helpTimer.current);
    setHelpToast({ message, tone, source });
    helpTimer.current = window.setTimeout(() => setHelpToast(null), 5000);
  };

  useEffect(() => {
    const checkExpiry = () => {
      const expiredReservations = account ? expireReservations().filter((reservation) => reservation.businessId === account.id) : [];
      const releasedByProduct = expiredReservations.reduce((totals, reservation) => ({
        ...totals,
        [reservation.businessProductId]: Number(totals[reservation.businessProductId] || 0) + Number(reservation.quantity || 0),
      }), {});
      const releasedProducts = getBusinessProducts().map((product) => {
        const released = Number(releasedByProduct[product.id] || 0);
        if (!released) return product;
        return {
          ...product,
          availableQuantity: Number(product.availableQuantity ?? product.quantity ?? 1) + released,
          reservedQuantity: Math.max(0, Number(product.reservedQuantity || 0) - released),
        };
      });
      if (expiredReservations.length) {
        saveBusinessOrders(getBusinessOrders().map((order) => (
          expiredReservations.some((reservation) => reservation.orderId === order.id) ? { ...order, status: 'No Show' } : order
        )));
        expiredReservations.forEach((reservation) => updateCustomerOrderStatus(reservation.orderId, 'Expired'));
      }
      const updated = applyExpiryRules(releasedProducts, getBusinessRules());
      saveBusinessProducts(updated);
      setProducts(updated);
    };
    const timer = window.setInterval(checkExpiry, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [account?.id]);

  useEffect(() => {
    saveBusinessProducts(products);
  }, []);

  useEffect(() => {
    if (!account || account.karmaPopupEnabled === false) return undefined;

    const matchesRecipient = (notification) => {
      const recipient = String(notification?.recipientId || notification?.payload?.recipientId || '').trim();
      if (!recipient) return false;
      const candidates = [
        account.id,
        account.userId,
        account.profileId,
        account.mobile,
      ].filter(Boolean).map((value) => String(value).trim());
      return candidates.some((candidate) => recipient === candidate);
    };

    const maybeShowKarmaToast = () => {
      let notifications = [];
      try {
        notifications = JSON.parse(localStorage.getItem('zeromart-notifications') || '[]');
      } catch {
        notifications = [];
      }

      const eligible = [...notifications]
        .filter((entry) => entry && entry.type === 'karma_received' && matchesRecipient(entry))
        .sort((first, second) => {
          const firstTime = new Date(first.createdAt || first.time || 0).getTime();
          const secondTime = new Date(second.createdAt || second.time || 0).getTime();
          return firstTime - secondTime;
        });

      if (!eligible.length) return;

      setKarmaReceivedQueue((currentQueue) => {
        const queuedIds = new Set(currentQueue.map((entry) => String(entry.id)));
        const activeId = karmaReceivedToast?.id ? String(karmaReceivedToast.id) : '';
        const additions = [];

        eligible.forEach((entry) => {
          const popupId = String(entry.id || `${entry.requestId || ''}:${entry.orderId || ''}:${entry.recipientId || ''}`);
          if (!popupId) return;
          if (seenKarmaToastIdsRef.current.has(popupId)) return;
          if (queuedIds.has(popupId) || (activeId && activeId === popupId)) return;
          seenKarmaToastIdsRef.current.add(popupId);
          additions.push({
            id: popupId,
            buyerName: entry.buyerName || entry.payload?.buyerName || 'Buyer',
            buyerLocation: entry.buyerLocation || entry.payload?.buyerLocation || 'nearby',
          });
        });

        return additions.length ? [...currentQueue, ...additions] : currentQueue;
      });
    };

    maybeShowKarmaToast();
    const timer = window.setInterval(maybeShowKarmaToast, 3000);
    window.addEventListener('storage', maybeShowKarmaToast);
    window.addEventListener('zeromart-transactions-change', maybeShowKarmaToast);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', maybeShowKarmaToast);
      window.removeEventListener('zeromart-transactions-change', maybeShowKarmaToast);
    };
  }, [account, karmaReceivedToast?.id]);

  useEffect(() => {
    if (account?.karmaPopupEnabled === false) {
      setKarmaReceivedToast(null);
      setKarmaReceivedQueue([]);
    }
  }, [account?.karmaPopupEnabled]);

  useEffect(() => {
    if (karmaReceivedToast || !karmaReceivedQueue.length) return;
    const [nextToast, ...remaining] = karmaReceivedQueue;
    setKarmaReceivedToast(nextToast);
    setKarmaReceivedQueue(remaining);
  }, [karmaReceivedQueue, karmaReceivedToast]);

  useEffect(() => {
    if (!karmaReceivedToast) return undefined;
    const timer = window.setTimeout(() => setKarmaReceivedToast(null), 10000);
    return () => window.clearTimeout(timer);
  }, [karmaReceivedToast]);

  // Publish current active business inventory into the shared drizn_live_listings
  // store on load, so store products appear live for every user (and survive resets).
  useEffect(() => {
    if (!account) return;
    const accounts = getBusinessAccounts();
    const publishAll = async () => {
      const publishFailures = [];
      const evaluatedProducts = applyExpiryRules(getBusinessProducts(), getBusinessRules());
      for (const product of evaluatedProducts) {
      const status = String(product.status || '').toLowerCase();
      const availableQuantity = Number(product.availableQuantity ?? product.quantity ?? 0);
      const expiryTimestamp = product.expiryDate
        ? new Date(`${product.expiryDate}T${product.expiryTime || '23:59'}:00`).getTime()
        : null;
      const expired = expiryTimestamp && Date.now() > expiryTimestamp;
      const liveId = `business-product-${product.id}`;
      if (product.autoList === false || availableQuantity <= 0 || expired || ['expired', 'sold', 'hidden', 'completed'].includes(status)) {
        removeLiveListing(liveId);
        try {
          await deleteListingFromBackend(liveId);
        } catch {
          // Deletion failures are non-blocking for dashboard interactions.
        }
        continue;
      }
      const accountForProduct = accounts.find((entry) => entry.id === product.businessId) || account;
      const liveItem = toMarketplaceItem(product, accountForProduct);
      upsertLiveListing(liveItem);
      try {
        await saveListingToBackend(liveItem);
      } catch (error) {
        publishFailures.push({ id: liveId, message: error?.message || 'Unknown listing sync error' });
      }
      }

      if (publishFailures.length) {
        setLiveSyncError('Some products could not be pushed to live marketplace. Please retry after checking network and image upload.');
      } else {
        setLiveSyncError('');
      }
    };
    publishAll();
  }, [account?.id]);

  const page = path.split('/').filter(Boolean)[1] || 'dashboard';
  useEffect(() => {
    if (account) showHelp(PAGE_HELP[page]);
    return () => window.clearTimeout(helpTimer.current);
  }, [page, account?.id]);

  if (!account) {
    return <BusinessAuthModal embedded onClose={() => navigate('/')} onSuccess={(nextAccount) => { setAccount(nextAccount); navigate('/business/dashboard'); }} />;
  }

  const syncBusinessLiveListings = async (evaluatedProducts) => {
    const accounts = getBusinessAccounts();
    const failures = [];
    const nextIds = new Set(evaluatedProducts.map((product) => String(product.id)));
    products
      .filter((product) => !nextIds.has(String(product.id)))
      .forEach((product) => {
        const liveId = `business-product-${product.id}`;
        removeLiveListing(liveId);
        deleteListingFromBackend(liveId).catch(() => {
          // Safe to ignore stale listing cleanup failures.
        });
      });

    for (const product of evaluatedProducts) {
      const status = String(product.status || '').toLowerCase();
      const availableQuantity = Number(product.availableQuantity ?? product.quantity ?? 0);
      const expiryTimestamp = product.expiryDate
        ? new Date(`${product.expiryDate}T${product.expiryTime || '23:59'}:00`).getTime()
        : null;
      const expired = expiryTimestamp && Date.now() > expiryTimestamp;
      const liveId = `business-product-${product.id}`;

      if (product.autoList === false || availableQuantity <= 0 || expired || ['expired', 'sold', 'hidden', 'completed'].includes(status)) {
        removeLiveListing(liveId);
        deleteListingFromBackend(liveId).catch(() => {
          // Safe to ignore stale listing cleanup failures.
        });
        continue;
      }

      const accountForProduct = accounts.find((entry) => entry.id === product.businessId) || account;
      const liveItem = toMarketplaceItem(product, accountForProduct);
      upsertLiveListing(liveItem);
      try {
        await saveListingToBackend(liveItem);
      } catch (error) {
        failures.push({ id: liveId, message: error?.message || 'Unknown listing sync error' });
      }
    }

    if (failures.length) {
      setLiveSyncError('Some products are saved in dashboard but failed to publish live. Please edit and save again.');
      return;
    }
    setLiveSyncError('');
  };

  const persistProducts = async (nextProducts) => {
    const evaluated = applyExpiryRules(nextProducts, rules);
    setProducts(evaluated);
    saveBusinessProducts(evaluated);
    await syncBusinessLiveListings(evaluated);
  };
  const persistRules = (nextRules) => {
    setRules(nextRules);
    saveBusinessRules(nextRules);
    const evaluated = applyExpiryRules(products, nextRules);
    setProducts(evaluated);
    saveBusinessProducts(evaluated);
    syncBusinessLiveListings(evaluated);
  };
  const logout = () => {
    clearBusinessSession();
    setAccount(null);
    navigate('/');
  };
  const updateAccount = (nextAccount) => {
    setAccount(nextAccount);
    saveBusinessSession(nextAccount);
    const accounts = getBusinessAccounts();
    saveBusinessAccounts([nextAccount, ...accounts.filter((entry) => entry.id !== nextAccount.id)]);
    syncBusinessLiveListings(applyExpiryRules(getBusinessProducts(), getBusinessRules()));
  };

  const goBack = () => navigate(page === 'dashboard' ? '/' : '/business/dashboard');
  const pageProps = { account, products: products.filter((item) => item.businessId === account.id), rules, orders: orders.filter((item) => item.businessId === account.id) };

  const explainControl = (event) => {
    const target = event.target.closest?.('[data-help]');
    if (target) {
      showHelp(target.dataset.help, 'info', 'control');
      return;
    }
    const control = event.target.closest?.('input, select, textarea, button, a');
    if (!control) return;
    const label = control.closest('label')?.textContent?.trim() || control.textContent?.trim() || control.getAttribute('aria-label');
    if (label) showHelp(`${label.replace(/\s+/g, ' ').slice(0, 80)} lets you update or continue this part of the page.`, 'info', 'control');
  };
  const hideControlHelp = () => {
    if (helpToast?.source !== 'control') return;
    window.clearTimeout(helpTimer.current);
    setHelpToast(null);
  };
  const leaveControl = (event) => {
    if (helpToast?.source !== 'control') return;
    const source = event.target.closest?.('[data-help], input, select, textarea, button, a');
    if (!source || source.contains(event.relatedTarget)) return;
    hideControlHelp();
  };

  return (
    <div
      className="min-h-screen bg-[#f4f8f6] text-slate-900"
      onMouseOver={explainControl}
      onMouseOut={leaveControl}
      onFocusCapture={explainControl}
      onBlurCapture={leaveControl}
      onChangeCapture={hideControlHelp}
    >
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-emerald-100 bg-white p-5 shadow-xl transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><Sparkles size={22} /></div>
            <div><p className="text-lg font-extrabold">Drizn</p><p className="text-xs font-semibold text-emerald-700">Business workspace</p></div>
          </button>
          <button onClick={() => setMobileNav(false)} className="rounded-lg p-2 text-slate-500 lg:hidden"><X size={20} /></button>
        </div>
        <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white font-bold text-emerald-700">{(account.profileImage || account.avatarUrl) ? <img src={account.profileImage || account.avatarUrl} alt="Business" className="h-full w-full object-cover" /> : initials(account.businessName)}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{account.businessName}</p><p className="truncate text-xs text-slate-500">{account.businessType}</p></div></div>
        </div>
        <nav className="mt-5 space-y-1">
          <NavButton icon={Home} label="Home" active={false} onClick={() => navigate('/')} />
          <NavButton icon={Store} label="Marketplace" active={false} onClick={() => navigate('/')} />
          {links.map((link) => <NavButton key={link.path} icon={link.icon} label={link.label} active={path === link.path} onClick={() => { navigate(link.path); setMobileNav(false); }} />)}
        </nav>
        <button onClick={logout} className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><LogOut size={18} /> Logout</button>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button onClick={() => setMobileNav(true)} className="rounded-xl border border-slate-200 p-2.5 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
              <button onClick={goBack} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100">
                <ArrowLeft size={17} />
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="min-w-0"><p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Business console</p><h1 className="truncate text-lg font-extrabold">{titleFor(page)}</h1></div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2"><ShieldCheck size={16} className="text-emerald-600" /><span className="hidden text-sm font-bold sm:inline">Verified</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-700">{account.karma} karma</span></div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 pb-12 sm:p-6">
          {karmaReceivedToast && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">Great! You received 1 Good Karma.</p>
                  <p className="mt-1 text-emerald-800">
                    From {karmaReceivedToast.buyerName} {karmaReceivedToast.buyerLocation ? `(${karmaReceivedToast.buyerLocation})` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setKarmaReceivedToast(null)}
                  className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-bold text-emerald-800"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          {liveSyncError && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {liveSyncError}
            </div>
          )}
          {page === 'dashboard' && <Dashboard {...pageProps} navigate={navigate} setInventoryMode={setInventoryMode} />}
          {page === 'inventory' && <Inventory {...pageProps} mode={inventoryMode} setMode={setInventoryMode} persistProducts={persistProducts} />}
          {page === 'rules' && <Rules rules={rules} persistRules={persistRules} />}
          {page === 'orders' && <Orders account={account} orders={pageProps.orders} allOrders={orders} setOrders={setOrders} updateAccount={updateAccount} persistProducts={persistProducts} showHelp={showHelp} />}
          {page === 'analytics' && <Analytics {...pageProps} />}
          {page === 'profile' && <BusinessProfile account={account} updateAccount={updateAccount} />}
        </main>
      </div>
      <HelpToast toast={helpToast} onClose={() => {
        window.clearTimeout(helpTimer.current);
        setHelpToast(null);
      }} />
    </div>
  );
}

function Dashboard({ account, products, orders, navigate, setInventoryMode }) {
  const metrics = getMetrics(account, products, orders);
  const orderDistances = orders.map((order) => ({
    ...order,
    distanceKm: haversineKm(account.locationData, order.buyerLocationData),
  }));
  const customersNearby = new Set(orderDistances.filter((order) => order.distanceKm !== null && order.distanceKm <= 10).map((order) => order.buyerMobile || order.buyerName)).size;
  const coverage = [1, 3, 5, 10].map((radius) => ({
    radius,
    total: orderDistances.filter((order) => order.status === 'Completed' && order.distanceKm !== null && order.distanceKm <= radius).length,
  }));
  const maxCoverage = Math.max(1, ...coverage.map((entry) => entry.total));
  const cards = [
    ['Total Inventory', products.length, Boxes], ['Near Expiry Products', products.filter((p) => p.status === 'Near Expiry' || p.nearExpiry).length, TrendingUp],
    ['Auto Listed Products', products.filter((p) => p.status === 'Listed').length, Sparkles], ['Orders Received', orders.length, ClipboardList],
    ['Revenue Recovered', `₹${metrics.revenue}`, CircleDollarSign], ['Waste Saved', `${metrics.saved} items`, Check],
    ['Store Good Karma', account.karma, ShieldCheck], ['Customers Nearby', customersNearby, UserRound],
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-emerald-700 p-6 text-white shadow-xl shadow-emerald-900/10 sm:p-8"><p className="text-sm font-bold text-emerald-100">Welcome back, {account.ownerName}</p><h2 className="mt-2 max-w-2xl text-3xl font-extrabold">Turn inventory into value before it becomes waste.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100">Expiry rules automatically publish eligible products into the Drizn marketplace.</p></section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <MetricCard key={label} label={label} value={value} icon={Icon} />)}</section>
    <section><div className="mb-3"><h2 className="text-lg font-extrabold">Quick actions</h2><p className="text-sm text-slate-500">Keep your store moving.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Quick label="Add Product" icon={PackagePlus} onClick={() => { setInventoryMode('manual'); navigate('/business/inventory'); }} />
      <Quick label="Upload CSV" icon={Upload} onClick={() => { setInventoryMode('csv'); navigate('/business/inventory'); }} />
      <Quick label="Set Expiry Rules" icon={Settings2} onClick={() => navigate('/business/rules')} />
      <Quick label="View Orders" icon={ClipboardList} onClick={() => navigate('/business/orders')} />
    </div></section>
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">Store Coverage</h2><p className="mt-1 text-sm text-slate-500">Completed orders by distance from your geotagged store.</p></div><MapPin size={20} className="text-emerald-700" /></div>
        <div className="mt-5 space-y-4">{coverage.map((entry) => <div key={entry.radius}><div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-bold text-slate-700">Within {entry.radius} km</span><span className="font-extrabold text-emerald-700">{entry.total} sold</span></div><div className="h-2.5 overflow-hidden rounded-full bg-emerald-50"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${entry.total ? Math.max(12, (entry.total / maxCoverage) * 100) : 0}%` }} /></div></div>)}</div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <h2 className="font-extrabold">Customer Heatmap</h2><p className="mt-1 text-sm text-slate-500">{account.locationData ? locationLabel(account.locationData) : 'Add your store geotag to activate coverage insights.'}</p>
        {account.locationData ? (
          <div className="mt-5">
            <LocationMap latitude={account.locationData.latitude} longitude={account.locationData.longitude} title={locationLabel(account.locationData)} height={208} interactive />
          </div>
        ) : (
          <div className="mt-5 flex h-52 items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800">
            Add your store location to show its coverage map.
          </div>
        )}
      </div>
    </section>
  </div>;
}

function Inventory({ account, products, mode, setMode, persistProducts }) {
  const [form, setForm] = useState({ ...emptyProduct, pickupLocation: account.storeLocation, locationData: account.locationData || null });
  const [csvRows, setCsvRows] = useState([]);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryNotice, setInventoryNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const addProduct = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setInventoryError('');
    setInventoryNotice('');
    try {
      let imageUrl = form.image || '';
      if (imageUrl.startsWith('data:')) {
        const blob = await fetch(imageUrl).then((response) => response.blob());
        const imageExt = String(blob.type || 'image/jpeg').split('/')[1] || 'jpg';
        const file = new File([blob], `business-product-${Date.now()}.${imageExt}`, { type: blob.type || 'image/jpeg' });
        imageUrl = await uploadImage(file);
      }

      const next = {
        ...form,
        image: imageUrl,
        imageUrl,
        mrp: 0,
        sellingPrice: 0,
        id: `product-${Date.now()}`,
        businessId: account.id,
        storeName: account.businessName,
        status: 'Safe',
        totalQuantity: Number(form.quantity),
        availableQuantity: Number(form.quantity),
        reservedQuantity: 0,
        soldQuantity: 0,
        listingType: 'business',
        maxQuantityPerUserPer24h: 2,
        coordinates: form.locationData ? { latitude: form.locationData.latitude, longitude: form.locationData.longitude } : null,
        createdAt: new Date().toISOString(),
      };
      await persistProducts([next, ...getBusinessProducts()]);
      setForm({ ...emptyProduct, pickupLocation: account.storeLocation, locationData: account.locationData || null });
      setInventoryNotice(`Successfully added ${next.name}. It is live now. Add another item to get more attention from nearby people.`);
    } catch (error) {
      setInventoryError(error?.message || 'Could not add product. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };
  const parseCsv = async (file) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
    const headers = lines.shift()?.map((value) => value.trim().toLowerCase()) || [];
    setCsvRows(lines.map((values, index) => {
      const row = Object.fromEntries(headers.map((header, i) => [header, values[i] || '']));
      const quantity = Number(row.quantity || 1);
      return { id: `csv-${index}`, name: row['product name'], category: row.category || 'Food', quantity, totalQuantity: quantity, availableQuantity: quantity, reservedQuantity: 0, soldQuantity: 0, listingType: 'business', maxQuantityPerUserPer24h: 2, mrp: 0, sellingPrice: 0, expiryDate: row['expiry date'], expiryTime: row['expiry time'] || '', imageUrl: row['image url'], description: row.description, autoList: true, pickupLocation: account.storeLocation, locationData: account.locationData || null, coordinates: account.locationData ? { latitude: account.locationData.latitude, longitude: account.locationData.longitude } : null };
    }).filter((row) => row.name));
  };
  const saveCsv = async () => {
    setInventoryError('');
    setInventoryNotice('');
    const stamped = csvRows.map((row, index) => ({ ...row, id: `product-${Date.now()}-${index}`, businessId: account.id, storeName: account.businessName, status: 'Safe', createdAt: new Date().toISOString() }));
    await persistProducts([...stamped, ...getBusinessProducts()]);
    setCsvRows([]);
    setInventoryNotice(`Successfully added ${stamped.length} products. They are live now. Add more items to increase store visibility.`);
  };
  const remove = async (id) => {
    await persistProducts(getBusinessProducts().filter((item) => item.id !== id));
  };
  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold">Inventory</h2><p className="text-sm text-slate-500">Add products manually or import a CSV file.</p></div><div className="grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm"><button onClick={() => setMode('manual')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'manual' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Manual Add</button><button onClick={() => setMode('csv')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'csv' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>CSV Upload</button></div></div>
    {mode === 'manual' ? <ProductForm form={form} setForm={setForm} onSubmit={addProduct} submitting={submitting} /> : <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && parseCsv(event.target.files[0])} /><button onClick={() => fileRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-4 text-center text-emerald-700"><Upload size={28} /><span className="mt-2 font-bold">Choose CSV file</span><span className="mt-1 max-w-xl text-xs leading-5">Product Name, Category, Quantity, Expiry Date, Image URL and Description. All imported products are fixed at ₹0 for now.</span></button>{csvRows.length > 0 && <Preview rows={csvRows} onSave={saveCsv} />}</section>}
    {inventoryError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{inventoryError}</p>}
    {inventoryNotice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{inventoryNotice}</p>}
    <InventoryTable products={products} onDelete={remove} />
  </div>;
}

function ProductForm({ form, setForm, onSubmit, submitting = false }) {
  const locationEngine = useLocationEngine();
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  const set = (key, value) => setForm({ ...form, [key]: value });
  const uploadImage = (file) => { const reader = new FileReader(); reader.onload = () => set('image', reader.result); reader.readAsDataURL(file); };
  return <>
  <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
    <Input label="Product name" required value={form.name} onChange={(v) => set('name', v)} /><Input label="Category" required value={form.category} onChange={(v) => set('category', v)} /><Input label="Quantity" type="number" min="1" required value={form.quantity} onChange={(v) => set('quantity', Number(v))} />
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Listing price</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">₹0</p>
      <p className="mt-1 text-xs text-slate-500">MRP and discounts will be available in a future update.</p>
    </div><Input label="Expiry date" type="date" required value={form.expiryDate} onChange={(v) => set('expiryDate', v)} /><Input label="Expiry time (optional)" type="time" value={form.expiryTime} onChange={(v) => set('expiryTime', v)} />
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-emerald-100 bg-emerald-50/50 p-3 text-sm font-bold text-slate-700">
      <span className="min-w-0"><span className="block text-emerald-800">Product image</span><span className="mt-1 block truncate text-xs font-medium text-slate-500">{form.image ? 'Image selected' : 'Choose JPG, PNG or WebP'}</span></span>
      <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">Choose file</span>
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} className="hidden" />
    </label>
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Inherited pickup location</p>
      <p className="mt-1 text-sm font-bold text-slate-800">{form.locationData ? locationLabel(form.locationData) : 'Update the business profile location first'}</p>
      <button type="button" onClick={() => setShowPickupPicker(true)} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">
        Use current or change manually
      </button>
    </div><label className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><input type="checkbox" checked={form.autoList} onChange={(e) => set('autoList', e.target.checked)} /> Auto-list ON</label>
    <label className="text-sm font-bold text-slate-700 sm:col-span-2 lg:col-span-3">Description<textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-emerald-500" /></label>
    <button disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-60 sm:col-span-2 lg:col-span-3"><Plus size={18} className="mr-2 inline" />{submitting ? 'Adding...' : 'Add to inventory'}</button>
  </form>
  <LocationPicker
    open={showPickupPicker}
    onClose={() => setShowPickupPicker(false)}
    onSelect={(location) => {
      setForm({
        ...form,
        pickupLocation: formatShortAddress(location),
        locationData: location,
      });
      locationEngine.setLocation(location);
      setShowPickupPicker(false);
    }}
    title="Choose Product Pickup Location"
    requireAddressDetails={false}
    requiredDetails={[]}
    addressTypeDefault="Store"
    zIndex={250}
  />
  </>;
}

function InventoryTable({ products, onDelete }) {
  return <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-extrabold">Product inventory</h3></div>{products.length === 0 ? <Empty text="No products yet. Add your first product above." /> : <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Product', 'Stock', 'Expiry', 'Price', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{products.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-bold">{p.name}</p><p className="text-xs text-slate-500">{p.category}</p></td><td className="px-4 py-3"><p>{p.availableQuantity ?? p.quantity} available</p><p className="text-xs text-slate-400">{p.reservedQuantity || 0} reserved · {p.soldQuantity || 0} collected</p></td><td className="px-4 py-3">{p.expiryDate} {p.expiryTime}<p className="text-xs text-slate-400">{daysUntilExpiry(p.expiryDate)} days</p></td><td className="px-4 py-3">{Number(p.sellingPrice) === 0 ? 'Free' : `₹${p.sellingPrice}`}<p className="text-xs text-slate-400">MRP ₹{p.mrp || 0}</p></td><td className="px-4 py-3"><Status value={p.status} /></td><td className="px-4 py-3"><button onClick={() => onDelete(p.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={17} /></button></td></tr>)}</tbody></table></div>}</section>;
}

function Rules({ rules, persistRules }) {
  const [draft, setDraft] = useState({ category: '', days: 1, discount: 20, autoList: true });
  const update = (id, key, value) => persistRules(rules.map((rule) => rule.id === id ? { ...rule, [key]: value } : rule));
  const add = (event) => { event.preventDefault(); if (!draft.category.trim()) return; persistRules([...rules, { ...draft, id: `rule-${Date.now()}` }]); setDraft({ category: '', days: 1, discount: 20, autoList: true }); };
  return <div className="space-y-5"><div><h2 className="text-2xl font-extrabold">Expiry rules</h2><p className="text-sm text-slate-500">Automatically list products when they enter a category threshold.</p></div><form onSubmit={add} className="grid gap-3 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:grid-cols-4"><Input label="Category" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} /><Input label="List before expiry days" type="number" min="0" value={draft.days} onChange={(v) => setDraft({ ...draft, days: Number(v) })} /><Input label="Discount percentage" type="number" min="0" max="100" value={draft.discount} onChange={(v) => setDraft({ ...draft, discount: Number(v) })} /><button className="self-end rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Add rule</button></form><div className="grid gap-3 lg:grid-cols-2">{rules.map((rule) => <article key={rule.id} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-extrabold">{rule.category}</h3><button onClick={() => update(rule.id, 'autoList', !rule.autoList)} className={`rounded-full px-3 py-1 text-xs font-bold ${rule.autoList ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Auto-list {rule.autoList ? 'ON' : 'OFF'}</button></div><div className="mt-4 grid grid-cols-2 gap-3"><Input label="Days before expiry" type="number" min="0" value={rule.days} onChange={(v) => update(rule.id, 'days', Number(v))} /><Input label="Discount %" type="number" min="0" max="100" value={rule.discount} onChange={(v) => update(rule.id, 'discount', Number(v))} /></div></article>)}</div></div>;
}

function Orders({ account, orders, allOrders, setOrders, updateAccount, persistProducts, showHelp }) {
  const [codeSearch, setCodeSearch] = useState('');
  const [settings, setSettings] = useState(() => getCollectionSettings(account.id));
  const updateWindow = (index, key, value) => {
    setSettings((current) => ({
      ...current,
      windows: current.windows.map((window, windowIndex) => (
        windowIndex === index ? { ...window, [key]: value } : window
      )),
    }));
  };
  const removeWindow = (index) => {
    setSettings((current) => ({
      ...current,
      windows: current.windows.filter((_, windowIndex) => windowIndex !== index),
    }));
  };
  const addWindow = () => {
    setSettings((current) => ({
      ...current,
      windows: [...current.windows, { days: 'Monday to Saturday', start: '10:00', end: '18:00' }],
    }));
  };
  const verifyCollectionId = () => {
    const query = codeSearch.trim().toLowerCase();
    if (!query) {
      showHelp('Enter a collection ID or buyer name first, then select Verify.', 'warning');
      return;
    }
    const match = orders.find((order) => [order.collectionCode, order.orderId, order.buyerName, order.productName].some((value) => String(value || '').toLowerCase().includes(query)));
    showHelp(
      match ? `${match.productName} belongs to ${match.buyerName}. Current status: ${match.status}.` : 'No order matches that exact collection ID or buyer name.',
      match ? 'success' : 'warning',
    );
  };
  const saveSettings = () => {
    saveCollectionSettings({ ...settings, businessId: account.id });
    showHelp('Collection settings saved successfully. Buyers will now see this availability.', 'success');
  };

  const changeStatus = (id, status) => {
    const changedOrder = allOrders.find((order) => order.id === id);
    const next = allOrders.map((order) => order.id === id ? { ...order, status } : order);
    setOrders(next);
    saveBusinessOrders(next);
    updateBusinessPurchaseStatus(id, status);
    updateCustomerOrderStatus(id, status);
    if (changedOrder) {
      let savedNotifications = [];
      try {
        savedNotifications = JSON.parse(localStorage.getItem('zeromart-notifications')) || [];
      } catch {
        savedNotifications = [];
      }
      const statusCopy = {
        Accepted: {
          title: `${account.businessName} confirmed your order`,
          body: `${changedOrder.productName} is confirmed for collection.`,
        },
        'Ready for Pickup': {
          title: 'Your order is ready to collect',
          body: `${changedOrder.productName} is ready at ${account.businessName}.`,
        },
        Completed: {
          title: 'Business collection completed',
          body: `${changedOrder.productName} was marked as collected.`,
        },
        Collected: {
          title: 'Business collection completed',
          body: `${changedOrder.productName} was marked as collected.`,
        },
        Declined: {
          title: 'Your business order was declined',
          body: `${account.businessName} could not fulfil ${changedOrder.productName}.`,
        },
        Cancelled: {
          title: 'Your business order was cancelled',
          body: `${changedOrder.productName} at ${account.businessName} has been cancelled.`,
        },
        'No Show': {
          title: 'Collection marked as no-show',
          body: `${changedOrder.productName} was released because collection was not completed.`,
        },
      }[status] || {
        title: `Order status: ${status}`,
        body: `${changedOrder.productName} was updated to ${status}.`,
      };
      const buyerNotification = {
        id: `business-status-${id}-${String(status).toLowerCase().replaceAll(' ', '-')}`,
        type: 'businessOrderUpdate',
        requestId: id,
        itemId: `business-product-${changedOrder.productId}`,
        recipientId: changedOrder.buyerId || changedOrder.buyerBusinessId || changedOrder.buyerMobile,
        sellerName: account.businessName,
        businessName: account.businessName,
        buyerName: changedOrder.buyerName,
        sellerPhone: account.mobile || '',
        productName: changedOrder.productName,
        quantity: changedOrder.quantity,
        orderId: changedOrder.orderId || changedOrder.id,
        collectionCode: changedOrder.collectionCode,
        title: statusCopy.title,
        body: statusCopy.body,
        orderStatus: status,
        collectionTime: changedOrder.collectionWindow || 'During store opening hours',
        pickupAddress: account.address || account.storeLocation || '',
        mapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.address || account.storeLocation || '')}`,
        whatsappLink: createWhatsAppLink(account.mobile, `Hello, I am contacting ${account.businessName} about Drizn order ${changedOrder.orderId || changedOrder.id} for ${changedOrder.productName}.`),
        time: 'Just now',
        read: false,
      };
      localStorage.setItem('zeromart-notifications', JSON.stringify([
        buyerNotification,
        ...savedNotifications.filter((entry) => entry.id !== buyerNotification.id),
      ]));
      window.dispatchEvent(new Event('storage'));
    }
    if (['Collected', 'Completed'].includes(status)) {
      persistProducts(getBusinessProducts().map((product) => {
        if (product.id !== changedOrder?.productId) return product;
        const quantity = Number(changedOrder.quantity || 1);
        const availableQuantity = Number(product.availableQuantity ?? product.quantity ?? 1);
        return {
          ...product,
          availableQuantity,
          reservedQuantity: Math.max(0, Number(product.reservedQuantity || 0) - quantity),
          soldQuantity: Number(product.soldQuantity || 0) + quantity,
          status: availableQuantity <= 0 ? 'Sold' : 'Listed',
        };
      }));
      saveReservations(getReservations().map((reservation) => reservation.orderId === id ? { ...reservation, status: 'completed' } : reservation));
      updatePurchaseHistoryStatus(id, 'completed');
      localStorage.setItem('zeromart-pending-business-karma', JSON.stringify({
        businessId: account.id,
        buyerId: changedOrder?.buyerId || changedOrder?.buyerMobile,
        name: account.businessName,
        orderId: id,
        mandatory: true,
      }));
      savePendingKarmaAction({
        id: `business:${id}`,
        pendingActionId: `business:${id}`,
        businessId: account.id,
        buyerId: changedOrder?.buyerId || changedOrder?.buyerMobile,
        name: account.businessName,
        orderId: id,
        type: 'business',
        mandatory: true,
        createdAt: new Date().toISOString(),
      });
    }
    if (['No Show', 'Cancelled'].includes(status)) {
      persistProducts(getBusinessProducts().map((product) => {
        if (product.id !== changedOrder?.productId) return product;
        const quantity = Number(changedOrder.quantity || 1);
        return {
          ...product,
          availableQuantity: Number(product.availableQuantity ?? product.quantity ?? 1) + quantity,
          reservedQuantity: Math.max(0, Number(product.reservedQuantity || 0) - quantity),
          status: 'Listed',
        };
      }));
      const historyStatus = status === 'No Show' ? 'no-show' : 'cancelled';
      saveReservations(getReservations().map((reservation) => reservation.orderId === id ? { ...reservation, status: historyStatus } : reservation));
      updatePurchaseHistoryStatus(id, historyStatus);
    }
    showHelp(`Order updated to ${status}.`, 'success');
  };
  const filteredOrders = codeSearch.trim()
    ? orders.filter((order) => [order.collectionCode, order.orderId, order.buyerName, order.productName].some((value) => String(value || '').toLowerCase().includes(codeSearch.trim().toLowerCase())))
    : orders;
  return (
    <>
      <div className="space-y-5">
        <div><h2 className="text-2xl font-extrabold">Orders</h2><p className="text-sm text-slate-500">Review buyer requests and verify store collection IDs.</p></div>
        <section className="grid gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
          <label data-help="Enter a collection ID, order ID, buyer name, or product name to find a request." className="text-sm font-bold text-slate-700">Search collection code or buyer<input value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && verifyCollectionId()} placeholder="ZM-300626-482913" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50" /></label>
          <button data-help="Verify the entered collection ID or buyer against your current orders." type="button" onClick={verifyCollectionId} className="self-end rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800">Verify ID</button>
        </section>
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-extrabold text-slate-900">Collection settings</h3><p className="mt-1 text-xs text-slate-500">Choose whether buyers collect anytime or within your daily windows.</p></div>
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <button data-help="Buyers may request collection at any time your store is open." type="button" onClick={() => setSettings((value) => ({ ...value, allowAnytime: true }))} className={`rounded-lg px-3 py-2 text-xs font-bold ${settings.allowAnytime ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}>Anytime</button>
              <button data-help="Set specific days and time windows when buyers can collect." type="button" onClick={() => setSettings((value) => ({ ...value, allowAnytime: false }))} className={`rounded-lg px-3 py-2 text-xs font-bold ${!settings.allowAnytime ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}>Scheduled</button>
            </div>
          </div>
          {!settings.allowAnytime && (
            <div className="mt-4 space-y-3">
              {settings.windows.map((window, index) => window.closed ? null : (
                <div key={`${window.days}-${index}`} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[minmax(180px,1fr)_140px_140px_auto] sm:items-end">
                  <Input label="Days" value={window.days} onChange={(value) => updateWindow(index, 'days', value)} />
                  <Input label="From" type="time" value={window.start} onChange={(value) => updateWindow(index, 'start', value)} />
                  <Input label="Until" type="time" value={window.end} onChange={(value) => updateWindow(index, 'end', value)} />
                  <button data-help="Remove this collection window." type="button" onClick={() => removeWindow(index)} className="rounded-xl border border-rose-100 bg-white px-3 py-3 text-sm font-bold text-rose-600">Remove</button>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
                <button data-help="Add another collection day and time window." type="button" onClick={addWindow} className="justify-self-start rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><Plus size={16} className="mr-2 inline" />Add time window</button>
                <Input label="Maximum orders per slot" type="number" min="0" value={settings.maximumOrdersPerSlot} onChange={(value) => setSettings((current) => ({ ...current, maximumOrdersPerSlot: Number(value) }))} />
              </div>
            </div>
          )}
          <button data-help="Save these collection preferences for future buyer reservations." type="button" onClick={saveSettings} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800">Save collection settings</button>
        </section>
        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          {filteredOrders.length === 0 ? <Empty text={codeSearch ? 'No requests match your search. Clear the search to view all orders.' : 'No buyer requests yet. New marketplace requests will appear here automatically.'} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{['Buyer', 'Phone & area', 'Product', 'Quantity', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-bold">{order.buyerName}</td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-700">{order.buyerMobile || 'Not shared'}</p>
                        <p className="mt-1 max-w-52 truncate text-xs text-slate-500">{formatShortAddress(order.buyerLocationData) || 'Location not shared'}</p>
                      </td>
                      <td className="px-4 py-4">{order.productName}</td>
                      <td className="px-4 py-4">{order.quantity}</td>
                      <td className="px-4 py-4"><Status value={order.status} /></td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          {order.status === 'Pending' && <><Action label="Accept" onClick={() => changeStatus(order.id, 'Accepted')} /><Action label="Decline" danger onClick={() => changeStatus(order.id, 'Declined')} /></>}
                          {order.status === 'Accepted' && <Action label="Ready for Pickup" onClick={() => changeStatus(order.id, 'Ready for Pickup')} />}
                          {order.status === 'Ready for Pickup' && <Action label="Completed" onClick={() => changeStatus(order.id, 'Completed')} />}
                          {order.status === 'Reserved' && <><Action label="Mark Collected" onClick={() => changeStatus(order.id, 'Collected')} /><Action label="No Show" danger onClick={() => changeStatus(order.id, 'No Show')} /><Action label="Cancel" danger onClick={() => changeStatus(order.id, 'Cancelled')} /></>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Analytics({ account, products, orders }) {
  const m = getMetrics(account, products, orders);
  const cards = [['Products listed', products.filter((p) => p.status === 'Listed' || p.status === 'Sold').length], ['Products saved', m.saved], ['Revenue recovered', `₹${m.revenue}`], ['Disposal cost saved', `₹${m.saved * 18}`], ['Buyers helped', new Set(orders.filter((o) => o.status === 'Completed').map((o) => o.buyerMobile || o.buyerName)).size], ['Good Karma earned', account.karma]];
  const max = Math.max(1, ...cards.map(([, value]) => Number(String(value).replace(/\D/g, '')) || 0));
  return <div className="space-y-5"><div><h2 className="text-2xl font-extrabold">Analytics</h2><p className="text-sm text-slate-500">A simple view of commercial recovery and community impact.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <MetricCard key={label} label={label} value={value} icon={BarChart3} />)}</div><section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><h3 className="font-extrabold">Impact overview</h3><div className="mt-6 flex h-64 items-end gap-3">{cards.map(([label, value]) => { const numeric = Number(String(value).replace(/\D/g, '')) || 0; return <div key={label} className="flex h-full flex-1 flex-col justify-end"><div className="mx-auto w-full max-w-16 rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all" style={{ height: `${Math.max(8, (numeric / max) * 100)}%` }} /><p className="mt-2 line-clamp-2 text-center text-[10px] font-semibold text-slate-500">{label}</p></div>; })}</div></section></div>;
}

function BusinessProfile({ account, updateAccount }) {
  const locationEngine = useLocationEngine();
  const [form, setForm] = useState({ ...account, karmaPopupEnabled: account?.karmaPopupEnabled !== false });
  const [showPicker, setShowPicker] = useState(false);
  const [showPhoneChangeModal, setShowPhoneChangeModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const purchases = getBusinessPurchases().filter((purchase) => purchase.buyerBusinessId === account.id);
  const activeCollectionPurchases = purchases.filter((purchase) => getCollectionPassState(purchase).active);
  const applyLocation = (location) => {
    const mergedLocation = withAddressDetails(location, {
      doorNo: location.doorNo || form.locationData?.doorNo || '',
      buildingName: location.buildingName || form.locationData?.buildingName || '',
      floor: location.floor || form.locationData?.floor || '',
      landmark: location.landmark || form.locationData?.landmark || '',
      addressType: 'Store',
    });
    locationEngine.setLocation(mergedLocation);
    setForm((current) => ({ ...current, locationData: mergedLocation, storeLocation: locationLabel(mergedLocation), address: mergedLocation.fullAddress }));
  };

  const saveProfile = async () => {
    setSaving(true);
    setProfileError('');
    setProfileNotice('');
    try {
      let profileImageUrl = form.profileImage || form.avatarUrl || '';
      if (profileImageUrl.startsWith('data:')) {
        const blob = await fetch(profileImageUrl).then((response) => response.blob());
        const imageExt = String(blob.type || 'image/jpeg').split('/')[1] || 'jpg';
        const file = new File([blob], `business-profile-${Date.now()}.${imageExt}`, { type: blob.type || 'image/jpeg' });
        profileImageUrl = await uploadImage(file);
      }

      const nextAccount = {
        ...form,
        userId: form.userId || account.userId || account.id,
        profileId: form.profileId || account.profileId || account.id,
        profileImage: profileImageUrl,
        avatarUrl: profileImageUrl,
        karmaPopupEnabled: form.karmaPopupEnabled !== false,
      };
      if (isLoggedIn()) {
        const persistedProfile = await updateProfile({
          name: nextAccount.businessName || nextAccount.ownerName || 'Business Store',
          fullName: nextAccount.ownerName || '',
          businessName: nextAccount.businessName || '',
          businessType: nextAccount.businessType || '',
          registration: nextAccount.registration || '',
          mobile: nextAccount.mobile || account.mobile || '',
          profileImage: profileImageUrl,
          avatarUrl: profileImageUrl,
          storeLocation: nextAccount.storeLocation || '',
          address: nextAccount.address || '',
          locationData: nextAccount.locationData || null,
          accountType: 'business',
          mode: 'business',
          verified: true,
          karmaPopupEnabled: nextAccount.karmaPopupEnabled !== false,
        }, {
          accountType: 'business',
          phone: nextAccount.mobile || account.mobile || '',
        });
        updateAccount({
          ...nextAccount,
          profileImage: persistedProfile?.profile_image || persistedProfile?.avatar_url || profileImageUrl,
          avatarUrl: persistedProfile?.avatar_url || persistedProfile?.profile_image || profileImageUrl,
        });
      } else {
        updateAccount(nextAccount);
      }

      setForm(nextAccount);
      setProfileNotice('Business profile saved successfully.');
    } catch (error) {
      setProfileError(error?.message || 'Could not save profile. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const onProfileImageSelect = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        profileImage: String(reader.result || ''),
        avatarUrl: String(reader.result || ''),
      }));
      setProfileNotice('Profile image selected. Save profile to publish it live.');
    };
    reader.readAsDataURL(file);
  };

  const handlePhoneChangeSuccess = (result) => {
    const nextMobile = String(result?.user?.phone || '').replace(/\D/g, '').slice(-10);
    if (!nextMobile) {
      setShowPhoneChangeModal(false);
      return;
    }
    const nextAccount = {
      ...form,
      mobile: nextMobile,
    };
    setForm(nextAccount);
    updateAccount(nextAccount);
    try {
      const savedUser = JSON.parse(localStorage.getItem('zeromart-user') || '{}');
      localStorage.setItem('zeromart-user', JSON.stringify({
        ...savedUser,
        mobile: nextMobile,
      }));
    } catch {
      // Local user cache sync is best effort only.
    }
    setProfileNotice('Phone number updated successfully.');
    setShowPhoneChangeModal(false);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 className="text-2xl font-extrabold">Business profile</h2>
          <p className="text-sm text-slate-500">Store identity, verification and buying activity.</p>
        </div>

        <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-20 w-20">
              {(form.profileImage || form.avatarUrl) ? (
                <img src={form.profileImage || form.avatarUrl} alt="Business profile" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-extrabold text-white">{initials(account.businessName)}</div>
              )}
              <label className="absolute -bottom-2 -right-2 cursor-pointer rounded-full bg-white p-2 text-xs font-bold text-emerald-700 shadow-sm">
                <Upload size={14} />
                <input type="file" accept="image/*" className="hidden" onChange={(event) => onProfileImageSelect(event.target.files?.[0])} />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-2xl font-extrabold">{account.businessName}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck size={14} /> Business Verified</span>
              </div>
              <p className="mt-1 text-slate-500">{account.businessType} · {form.locationData ? locationLabel(form.locationData) : account.storeLocation}</p>
              <p className="mt-2 font-bold text-emerald-700">{account.karma} Store Good Karma</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input label="Business name" value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} />
            <Input label="Owner name" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
            <Input label="Business type" value={form.businessType} onChange={(v) => setForm({ ...form, businessType: v })} />
            <Input label="GST / FSSAI (optional)" value={form.registration || ''} onChange={(v) => setForm({ ...form, registration: v })} />
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Mobile</p>
              <p className="mt-2 font-semibold">+91 ******{String(account.mobile).slice(-4)}</p>
              <button
                type="button"
                onClick={() => setShowPhoneChangeModal(true)}
                className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
              >
                Change phone securely
              </button>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 sm:col-span-2">
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Karma Popup Alert</span>
                <span className="mt-1 block text-sm font-semibold text-slate-700">Show popup when your store receives Good Karma</span>
              </span>
              <input
                type="checkbox"
                checked={form.karmaPopupEnabled !== false}
                onChange={(event) => setForm((current) => ({ ...current, karmaPopupEnabled: event.target.checked }))}
                className="h-5 w-5"
              />
            </label>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Geotagged store location</p>
              <p className="mt-2 font-bold text-slate-900">{form.locationData ? locationLabel(form.locationData) : 'No structured location saved'}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{form.locationData?.fullAddress || account.address}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowPicker(true)} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Update Current Location</button>
                <button type="button" onClick={() => setShowPicker(true)} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-emerald-800 shadow-sm">Change Location</button>
              </div>
            </div>
          </div>
          {profileError && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{profileError}</p>}
          {profileNotice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{profileNotice}</p>}
          <button disabled={saving} onClick={saveProfile} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save profile'}</button>
        </section>

        {activeCollectionPurchases.length > 0 && (
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-700">Ready for collection</p>
            <h3 className="mt-1 text-xl font-extrabold text-slate-900">Active collection passes</h3>
            <p className="mt-1 text-sm text-slate-500">Show the QR or collection ID at the store. It remains here until collection or expiry.</p>
            <div className="mt-4 space-y-3">
              {activeCollectionPurchases.map((purchase) => (
                <CollectionPass key={purchase.id} order={purchase} onTrack={() => setSelectedPurchase(purchase)} />
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-700">Buying activity</p>
            <h3 className="mt-1 text-xl font-extrabold text-slate-900">Order history</h3>
            <p className="mt-1 text-sm text-slate-500">Track products purchased with this business account.</p>
          </div>
          {purchases.length === 0 ? (
            <Empty text="No purchases yet. Products you request from the marketplace will appear here." />
          ) : (
            <div className="divide-y divide-slate-100">
              {purchases.map((purchase) => {
                const completedLabel = purchase.type === 'delivery' ? 'Delivered' : 'Collected personally';
                const passState = getCollectionPassState(purchase);
                const displayStatus = passState.expired ? 'QR expired · Past order' : purchase.status === 'Completed' ? completedLabel : purchase.status;
                return (
                  <button type="button" key={purchase.id} onClick={() => setSelectedPurchase(purchase)} className="block w-full p-4 text-left transition hover:bg-emerald-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-400 sm:p-5">
                    <div className="flex items-start gap-3">
                      {purchase.image ? <img src={purchase.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ClipboardList size={22} /></div>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-extrabold text-slate-900">{purchase.title}</p>
                            <p className="mt-1 truncate text-sm text-slate-500">From {purchase.sellerName}</p>
                          </div>
                          <Status value={displayStatus} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{purchase.type === 'delivery' ? 'Delivery' : 'In-person collection'}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{purchase.createdAt}</span>
                        </div>
                        {purchase.type === 'delivery' && purchase.deliveryStatus && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{purchase.deliveryStatus}</p>}
                        {purchase.type === 'delivery' && purchase.buyerAddress && <p className="mt-2 text-xs leading-5 text-slate-500">Deliver to: {purchase.buyerAddress}</p>}
                      </div>
                    </div>
                    <span className="mt-3 inline-flex text-xs font-bold text-emerald-700">View tracking details</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <LocationPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(location) => { applyLocation(location); setShowPicker(false); }}
        title="Update Store Location"
        requireAddressDetails={false}
        requiredDetails={[]}
        addressTypeDefault="Store"
      />
      <OrderTrackingModal order={selectedPurchase} onClose={() => setSelectedPurchase(null)} />
      <PhoneChangeModal
        open={showPhoneChangeModal}
        currentPhone={account?.mobile || ''}
        title="Change business phone"
        subtitle="Business profile security"
        onClose={() => setShowPhoneChangeModal(false)}
        onSuccess={handlePhoneChangeSuccess}
      />
    </>
  );
}

function HelpToast({ toast, onClose }) {
  if (!toast) return null;
  const tone = toast.tone === 'success'
    ? 'border-emerald-200 bg-emerald-700 text-white'
    : toast.tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-emerald-200 bg-white text-slate-700';
  return (
    <div role="status" aria-live="polite" className={`fixed bottom-4 left-4 right-4 z-[180] ml-auto flex max-w-sm items-start gap-3 rounded-2xl border p-3 shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 ${tone}`}>
      <Info size={20} className="mt-0.5 shrink-0" />
      <p className="flex-1 text-sm font-semibold leading-6">{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Close help" className="shrink-0 rounded-lg p-1 transition hover:bg-black/10"><X size={18} /></button>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) { return <button data-help={`Open the ${label} page.`} onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/15' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}><Icon size={18} />{label}</button>; }
function MetricCard({ label, value, icon: Icon }) { return <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={18} /></div><p className="mt-4 text-2xl font-extrabold">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></article>; }
function Quick({ label, icon: Icon, onClick }) { return <button data-help={`${label} opens the related business tool.`} onClick={onClick} className="group flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon size={20} /></div><span className="flex-1 font-bold">{label}</span><ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600" /></button>; }
function Input({ label, value, onChange, type = 'text', ...props }) { return <label data-help={`Enter or update ${label.toLowerCase()} here.`} className="text-sm font-bold text-slate-700">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50" {...props} /></label>; }
function Status({ value }) { const color = ['Listed', 'Completed', 'Safe', 'Delivered', 'Collected personally'].includes(value) ? 'bg-emerald-100 text-emerald-700' : value === 'Expired' || value === 'Declined' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'; return <span className={`rounded-full px-3 py-1 text-xs font-bold ${color}`}>{value}</span>; }
function Action({ label, onClick, danger }) { return <button data-help={`${label} updates this buyer request.`} onClick={onClick} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${danger ? 'bg-rose-50 text-rose-700' : 'bg-emerald-600 text-white'}`}>{label}</button>; }
function Empty({ text }) { return <div className="p-10 text-center text-sm text-slate-500">{text}</div>; }
function Preview({ rows, onSave }) { return <div className="mt-5"><div className="flex items-center justify-between"><h3 className="font-extrabold">CSV preview ({rows.length})</h3><button onClick={onSave} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Save products</button></div><div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="min-w-[700px] w-full text-left text-xs"><thead className="bg-slate-50"><tr>{['Product', 'Category', 'Qty', 'MRP', 'Price', 'Expiry'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="p-3 font-bold">{r.name}</td><td className="p-3">{r.category}</td><td className="p-3">{r.quantity}</td><td className="p-3">{r.mrp}</td><td className="p-3">{r.sellingPrice}</td><td className="p-3">{r.expiryDate}</td></tr>)}</tbody></table></div></div>; }
function parseCsvLine(line) { const values = []; let current = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { values.push(current.trim()); current = ''; } else current += char; } values.push(current.trim()); return values; }
function initials(value = '') { return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'ZM'; }
function titleFor(page) { return ({ dashboard: 'Dashboard', inventory: 'Inventory', rules: 'Expiry Rules', orders: 'Orders', analytics: 'Analytics', profile: 'Business Profile' })[page] || 'Dashboard'; }
function getMetrics(account, products, orders) { const completed = orders.filter((o) => o.status === 'Completed'); const savedProducts = products.filter((p) => p.status === 'Sold').length || completed.length; return { revenue: completed.reduce((sum, order) => sum + Number(products.find((p) => p.id === order.productId)?.sellingPrice || 0), 0), saved: savedProducts, karma: account.karma || 0 }; }
