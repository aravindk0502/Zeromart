import { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Bell, Bot, Building2, Flame, Gem, Heart, Home, LocateFixed, MapPin, Medal, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, User } from 'lucide-react';
import HomePage, { ProductRail } from './pages/HomePage';
import SectionPage from './pages/SectionPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import ItemDetailsModal from './components/ItemDetailsModal';
import OtpModal from './components/OtpModal';
import OnboardingTour from './components/OnboardingTour';
import ListingSheet from './components/ListingSheet';
import BuyerPaySheet from './components/BuyerPaySheet';
import OrderSuccessModal from './components/OrderSuccessModal';
import QuantityRequestModal from './components/QuantityRequestModal';
import KarmaPopup from './components/KarmaPopup';
import BotAssistant from './components/BotAssistant';
import BusinessAuthModal from './components/BusinessAuthModal';
import {
  clearBusinessSession, createBusinessOrder, getBusinessAccounts,
  getBusinessOrders, getBusinessProducts, getBusinessPurchases, getBusinessSession,
  saveBusinessAccounts, saveBusinessOrders, saveBusinessProducts, saveBusinessPurchases,
  saveBusinessSession,
} from './lib/businessStore';
import { useLocationEngine } from './hooks/useLocationEngine';
import {
  formatDistance, formatShortAddress, getLocationScopes, getLocationScopeValue, haversineKm,
} from './services/locationService';
import {
  applyProductExpiry, createCollectionCode, getCollectionSettings, getExpiryBadgeState, getExpiryTimestamp,
  getProductRequestState, getPurchaseHistory, getQuantityAllowance, isMarketplaceVisible, normalizeProductStock, recordPurchaseAttempt,
  savePurchaseHistory, saveRequests, getRequests, saveReservations, getReservations, createWhatsAppLink,
  updatePurchaseHistoryStatus, confirmHandoff, saveTransactionProducts,
  completePendingKarmaAction, getPendingKarmaActions, savePendingKarmaAction,
  getLiveListings, saveLiveListings, upsertLiveListing, removeLiveListing, normalizeLiveListing,
} from './services/transactionService';
import {
  clearToken,
  emitNotificationEvent,
  fetchProfile,
  fetchOrders,
  fetchListingById,
  fetchNotificationHistory,
  fetchPendingKarmaActions,
  isLoggedIn,
  markRequestHandover,
  registerPushToken,
  triggerNearbyListingAlerts,
  awardCommunityKarma,
  reserveListing,
  saveOrder,
  updateProfile,
  uploadImage,
} from './lib/api';
import {
  deleteListingFromBackend,
  invalidateListingCache,
  saveListingToBackend,
  subscribeToListingChanges,
  syncListingsFromBackend,
  updateListingInBackend,
} from './services/liveListingService';
import { listenForForegroundMessages, requestPushPermission } from './lib/firebaseMessaging';
import { isListingOwnedByUser } from './utils/listingOwnership';

const navItems = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'notifications', label: 'Alerts', icon: Bell },
];

const bottomNavItems = [
  navItems[0],
  navItems[1],
  null,
  navItems[2],
  navItems[3],
];

const DISCOVERY_STAGES = [
  { key: '1km', label: 'Within 1 km', radiusKm: 1 },
  { key: '3km', label: 'Within 3 km', radiusKm: 3 },
  { key: '5km', label: 'Within 5 km', radiusKm: 5 },
  { key: '10km', label: 'Within 10 km', radiusKm: 10 },
  { key: '25km', label: 'Within 25 km', radiusKm: 25 },
  { key: 'city', label: 'Across the city', radiusKm: 80 },
  { key: 'state', label: 'Across Tamil Nadu', radiusKm: 500 },
  { key: 'india', label: 'Across India', radiusKm: Number.POSITIVE_INFINITY },
];

const platformSearchKeywords = 'drizn drizn ai good things nearby karma good karma free 0 rs ₹0 rupees local business b2b marketplace listing list item seller buyer pickup delivery in person collect product item movie movies ticket tickets food electronics books cosmetics home furniture';
const isProductionRuntime = import.meta.env.PROD;
const FCM_TOKEN_STORAGE_KEY = 'drizn-fcm-token';
const ACTIVE_REQUEST_STATUSES = ['pending', 'accepted', 'awaiting_collection', 'handed_over', 'karma_pending'];
const REMOTE_SYNC_INTERVAL_MS = 3000;
const REMOTE_LISTING_SYNC_INTERVAL_MS = 2500;

const isRequestActiveForLock = (request, now = Date.now()) => {
  const status = String(request?.status || '').toLowerCase();
  if (!ACTIVE_REQUEST_STATUSES.includes(status)) return false;
  if (status !== 'pending') return true;
  const expiryMs = new Date(request?.expiresAt || 0).getTime();
  return !Number.isFinite(expiryMs) || expiryMs > now;
};

const getItemCoordinates = (item) => item.coordinates
  || (item.locationData ? { latitude: item.locationData.latitude, longitude: item.locationData.longitude } : null)
  || null;

const getHeaderLocationLabel = (location, fallback = 'Choose location') => {
  if (!location) return fallback;
  const area = location.area || location.subLocality || location.locality || location.street;
  const city = location.city || location.district;
  return [...new Set([area, city].filter(Boolean))].join(', ') || formatShortAddress(location) || fallback;
};

const mergeListingsById = (...catalogs) => {
  const listings = new Map();
  catalogs.flat().filter(Boolean).forEach((item) => listings.set(String(item.id), item));
  return [...listings.values()];
};

const isLegacyDemoRecord = (record) => {
  if (!record) return false;
  if (record.isDemo === true) return true;
  const identifiers = [
    record.id,
    record.userId,
    record.buyerId,
    record.sellerId,
    record.businessId,
    record.productId,
    record.businessProductId,
    record.recipientId,
    record.requestId,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const searchableText = [
    record.title,
    record.description,
    record.sellerName,
    record.storeName,
    record.brand,
    record.category,
    record.subtitle,
    ...identifiers,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  return searchableText.some((value) => (
    value.startsWith('demo_')
    || value.startsWith('demo-')
    || value.startsWith('chennai-')
    || value.startsWith('business-product-demo-')
    || value.includes(' e2e ')
    || value.includes('e2e')
    || value.includes('codex')
    || value.includes('verification item')
    || value.includes('dummy')
    || value.includes('test item')
  ));
};

const stripFallbackDemoWhenLiveExists = (catalog) => {
  const normalized = catalog.filter(Boolean).map(normalizeLiveListing);
  const hasRealListings = normalized.some((item) => !isLegacyDemoRecord(item));
  return hasRealListings ? normalized.filter((item) => !isLegacyDemoRecord(item)) : normalized;
};

const normalizeListingsForMarketplace = (listings = []) => {
  const catalog = stripFallbackDemoWhenLiveExists(listings).map(normalizeProductStock);
  if (isProductionRuntime) {
    return applyProductExpiry(catalog.filter((item) => item.serverPersisted && !isLegacyDemoRecord(item)));
  }
  return applyProductExpiry(catalog);
};

const isLegacyDemoNotification = (record) => {
  if (!record) return false;
  const identifiers = [
    record.id,
    record.requestId,
    record.orderId,
    record.listingId,
    record.itemId,
    record.recipientId,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const searchableText = [
    record.title,
    record.body,
    record.buyerName,
    record.sellerName,
    ...identifiers,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  return searchableText.some((value) => (
    value.startsWith('zm-diag')
    || value.startsWith('zm-final')
    || value.includes('dummy')
    || value.includes('verification')
    || value.includes('codex')
    || value.includes('diag')
    || value.includes('e2e')
    || value.includes('liveflow')
    || value.includes('nearbydeniedpermissiontest')
  ));
};

// Single source of truth: production comes from the live listing API, with local
// memory only acting as the current-session cache after a successful fetch.
const loadMarketplaceItems = () => normalizeListingsForMarketplace(getLiveListings());

const loadOrderHistory = () => {
  try {
    return JSON.parse(localStorage.getItem('zeromart-order-history')) || [];
  } catch {
    return [];
  }
};

const getKarmaLedger = () => {
  try {
    return JSON.parse(localStorage.getItem('zeromart-community-karma')) || {};
  } catch {
    return {};
  }
};

const accountKey = (value) => String(value || '').replace(/\D/g, '') || String(value || '');

const normalizeNotificationType = (value) => {
  const type = String(value || '').trim();
  if (type === 'new_request') return 'request';
  if (type === 'request_accepted') return 'requestAccepted';
  if (type === 'request_declined') return 'requestDeclined';
  return type || 'platform';
};

const canonicalNotificationId = ({ id, dedupeKey = '', type, requestId = '', orderId = '' }) => {
  if (dedupeKey) return String(dedupeKey);
  if (id) return String(id);
  const normalizedType = normalizeNotificationType(type);
  if (requestId && normalizedType === 'request') return `request-${requestId}`;
  if (requestId && normalizedType === 'requestAccepted') return `accepted-${requestId}`;
  if (requestId && normalizedType === 'requestDeclined') return `declined-${requestId}`;
  if (requestId && normalizedType === 'karma_required') return `karma-required-${requestId}`;
  if (requestId && normalizedType === 'karma_received') return `karma-received-${requestId}`;
  if (orderId && normalizedType === 'businessOrderUpdate') return `business-update-${orderId}`;
  if (orderId && normalizedType === 'businessOrderReceived') return `business-received-${orderId}`;
  return String(id || `${normalizedType || 'notification'}-${requestId || orderId || Date.now()}`);
};

const createOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ZM-${date}-${suffix}`;
};

const formatJoinedDate = (value) => {
  if (!value) return '';
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return '';
  return next.toLocaleDateString([], { month: 'short', year: 'numeric' });
};
const buildFallbackAvatarImage = (name = 'Drizn User') => {
  const initials = String(name)
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DU';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const loadNotifications = () => {
  try {
    return JSON.parse(localStorage.getItem('zeromart-notifications')) || [];
  } catch {
    return [];
  }
};

export default function App({ path = '/', navigate = (nextPath) => { window.location.href = nextPath; } }) {
  const locationEngine = useLocationEngine();
  const [activeView, setActiveView] = useState('home');
  const [sectionView, setSectionView] = useState('explore');
  const [user, setUser] = useState(null);
  const [businessSession, setBusinessSession] = useState(getBusinessSession);
  const [items, setItems] = useState(loadMarketplaceItems);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedPublicProfile, setSelectedPublicProfile] = useState(null);
  const [homeSection, setHomeSection] = useState('b2b');
  const [locationLabel, setLocationLabel] = useState(() => (
    locationEngine.status === 'locating'
      ? 'Detecting location…'
      : getHeaderLocationLabel(locationEngine.location, locationEngine.label || 'Choose location')
  ));
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [conditionFilter, setConditionFilter] = useState('All');
  const [radiusKm, setRadiusKm] = useState('all');
  const [discoveryStageIndex, setDiscoveryStageIndex] = useState(0);
  const [leaderboardScope, setLeaderboardScope] = useState('area');
  const [currentCoordinates, setCurrentCoordinates] = useState(locationEngine.location);
  const [debouncedCoordinates, setDebouncedCoordinates] = useState(locationEngine.location);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPostSuccessModal, setShowPostSuccessModal] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zeromart-favorites') || '[]');
    } catch {
      return [];
    }
  });
  const [favoriteBadgeCount, setFavoriteBadgeCount] = useState(() => (
    Math.max(0, Number(localStorage.getItem('zeromart-new-favorites-count')) || 0)
  ));
  const [orderHistory, setOrderHistory] = useState(loadOrderHistory);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [quantityItem, setQuantityItem] = useState(null);
  const [showListingSheet, setShowListingSheet] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showBuyerPaySheet, setShowBuyerPaySheet] = useState(false);
  const [showKarmaPopup, setShowKarmaPopup] = useState(false);
  const [karmaSubmitting, setKarmaSubmitting] = useState(false);
  const [karmaError, setKarmaError] = useState('');
  const [showBotAssistant, setShowBotAssistant] = useState(false);
  const [showBusinessAuth, setShowBusinessAuth] = useState(false);
  const [karmaTarget, setKarmaTarget] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [notifications, setNotifications] = useState(loadNotifications);
  const skipTransactionPersistRef = useRef(false);
  const buyerAccessPendingRequestRef = useRef(null);
  const buyerAccessBypassRef = useRef(false);
  const [requestClock, setRequestClock] = useState(Date.now());
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    if (typeof window === 'undefined') return false;
    const savedValue = localStorage.getItem('zeromart-has-seen-tour');
    return savedValue === 'true';
  });
  const activeBuyer = user || (businessSession ? {
    userId: businessSession.userId || businessSession.id,
    name: businessSession.businessName,
    mobile: businessSession.mobile,
    isBuyer: Boolean(businessSession.isBuyer),
    location: businessSession.locationData,
    businessId: businessSession.id,
    isBusinessAccount: true,
    profileId: businessSession.profileId || businessSession.id,
    profileImage: businessSession.profileImage || businessSession.avatarUrl || '',
  } : null);
  const activeAccountId = activeBuyer?.userId || activeBuyer?.businessId || activeBuyer?.mobile || activeBuyer?.name || '';
  const commitNotifications = (updater) => {
    setNotifications((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      localStorage.setItem('zeromart-notifications', JSON.stringify(next));
      return next;
    });
  };
  const isOwnedByActiveAccount = (item) => isListingOwnedByUser(item, activeBuyer);

  const safeEmitNotificationEvent = async (payload) => {
    try {
      await emitNotificationEvent(payload);
    } catch (error) {
      console.warn('[notifications] event emit failed (non-blocking)', error?.message || error);
    }
  };

  const safeTriggerNearbyListingAlerts = async (listing) => {
    const coordinates = listing?.coordinates || listing?.locationData || {};
    const latitude = Number(listing?.latitude ?? coordinates?.latitude ?? coordinates?.lat);
    const longitude = Number(listing?.longitude ?? coordinates?.longitude ?? coordinates?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !activeAccountId || !listing?.id) return;
    try {
      await triggerNearbyListingAlerts({
        actorAccountId: activeAccountId,
        listingId: String(listing.id),
        title: listing.title || '',
        category: listing.category || '',
        area: listing.area || listing.locationData?.area || '',
        city: listing.city || listing.locationData?.city || '',
        latitude,
        longitude,
        radiusKm: 2,
      });
    } catch (error) {
      console.warn('[notifications] nearby listing alert failed (non-blocking)', error?.message || error);
    }
  };

  const requestPushAccessForAccount = async (accountId) => {
    if (!accountId) return;
    const push = await requestPushPermission();
    if (!push.supported) {
      console.info('[fcm] push not supported in this browser/runtime');
      return;
    }
    if (push.permission !== 'granted') {
      console.info('[fcm] notification permission not granted', { permission: push.permission });
      return;
    }
    if (push.token) {
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, JSON.stringify({ accountId: String(accountId), token: push.token }));
      try {
        const currentLocation = locationEngine.location || {};
        await registerPushToken({
          accountId: String(accountId),
          token: push.token,
          platform: 'web',
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            location: {
              latitude: Number(currentLocation.latitude) || null,
              longitude: Number(currentLocation.longitude) || null,
              area: currentLocation.area || currentLocation.locality || '',
              city: currentLocation.city || '',
            },
          },
          enabled: true,
        });
      } catch (error) {
        console.warn('[fcm] token registration failed (non-blocking)', error?.message || error);
      }
    }
    if (push.error) console.warn('[fcm] token fetch warning', push.error);
  };

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    const enableForegroundListener = async () => {
      unsubscribe = await listenForForegroundMessages((payload) => {
        if (cancelled) return;
        const title = payload?.notification?.title || payload?.data?.title || 'New alert';
        const body = payload?.notification?.body || payload?.data?.body || 'You received a new update.';
        const itemId = payload?.data?.itemId || payload?.data?.listingId || '';
        commitNotifications((current) => ([
          {
            id: `fcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'platform',
            title,
            body,
            itemId,
            time: 'Just now',
            read: false,
            recipientId: activeAccountId || '',
          },
          ...current,
        ]));
        setNotice(title);
      });
    };

    enableForegroundListener();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    let cancelled = false;

    const mapRemoteNotification = (entry) => {
      const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};
      const type = normalizeNotificationType(entry.event_type || entry.type || 'platform');
      const requestId = entry.request_id || payload.requestId || '';
      const orderId = entry.order_id || payload.orderId || '';
      const dedupeKey = entry.dedupe_key || payload.dedupeKey || '';
      const mapped = {
        id: canonicalNotificationId({ id: entry.id, dedupeKey, type, requestId, orderId }),
        type,
        title: entry.title || 'Drizn update',
        body: entry.body || entry.text || '',
        itemId: entry.listing_id || payload.listingId || '',
        listingId: entry.listing_id || payload.listingId || '',
        requestId,
        orderId,
        buyerId: payload.buyerId || entry.actor_account_id || payload.actorAccountId || '',
        sellerId: payload.sellerId || '',
        buyerName: payload.buyerName || payload.actorName || '',
        buyerPhone: payload.buyerPhone || '',
        buyerLocation: payload.buyerLocation || '',
        sellerName: payload.sellerName || payload.recipientName || '',
        sellerPhone: payload.sellerPhone || '',
        productName: payload.productName || '',
        quantity: Number(payload.quantity || 1),
        collectionDate: payload.collectionDate || '',
        collectionTime: payload.collectionTime || '',
        pickupAddress: payload.pickupAddress || '',
        optionalMessage: payload.optionalMessage || '',
        mapsLink: payload.pickupAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(payload.pickupAddress)}` : '',
        payload,
        createdAt: entry.created_at || '',
        read: Boolean(entry.read),
        recipientId: activeAccountId,
        requestStatus: payload.requestStatus || payload.orderStatus || (type === 'request' ? 'pending' : undefined),
        time: entry.created_at ? new Date(entry.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now',
      };
      return isLegacyDemoNotification(mapped) ? null : mapped;
    };

    const syncRemoteNotifications = async () => {
      try {
        const rows = await fetchNotificationHistory(activeAccountId, 100);
        if (cancelled || !Array.isArray(rows)) return;
        const remote = rows.map(mapRemoteNotification).filter(Boolean);
        commitNotifications((current) => {
          const merged = new Map();
          remote.forEach((entry) => merged.set(String(entry.id), entry));
          current.forEach((entry) => {
            if (isLegacyDemoNotification(entry)) return;
            const id = String(entry.id);
            if (!merged.has(id)) {
              merged.set(id, entry);
              return;
            }
            merged.set(id, { ...merged.get(id), ...entry });
          });
          return [...merged.values()].sort((first, second) => (
            new Date(second.createdAt || second.time || 0).getTime() - new Date(first.createdAt || first.time || 0).getTime()
          ));
        });
      } catch (error) {
        console.warn('[notifications] remote history fetch failed', error?.message || error);
      }
    };

    syncRemoteNotifications();
    const timer = window.setInterval(syncRemoteNotifications, REMOTE_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return undefined;
    let cancelled = false;

    const syncRemoteOrders = async () => {
      try {
        const rows = await fetchOrders();
        if (cancelled || !Array.isArray(rows)) return;
        const scoped = rows.filter((entry) => (
          accountKey(entry.buyerId) === accountKey(activeAccountId)
          || accountKey(entry.sellerId) === accountKey(activeAccountId)
        ));
        if (scoped.length) saveRequests(scoped);
      } catch (error) {
        console.warn('[orders] remote sync failed', error?.message || error);
      }
    };

    syncRemoteOrders();
    const timer = window.setInterval(syncRemoteOrders, REMOTE_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeBuyer) return;
    const ownedItems = items.filter((item) => isListingOwnedByUser(item, activeBuyer));
    if (!ownedItems.length) return;
    const nextKarma = ownedItems.reduce((highest, item) => Math.max(highest, Number(item.sellerKarma || 0)), 0);
    if (businessSession) {
      if (Number(businessSession.karma || 0) === nextKarma) return;
      const nextSession = { ...businessSession, karma: nextKarma };
      setBusinessSession(nextSession);
      saveBusinessSession(nextSession);
      saveBusinessAccounts([
        nextSession,
        ...getBusinessAccounts().filter((account) => account.id !== nextSession.id),
      ]);
      return;
    }
    if (Number(user?.karma || 0) === nextKarma) return;
    setUser((current) => {
      if (!current) return current;
      const nextUser = { ...current, karma: nextKarma };
      localStorage.setItem('zeromart-user', JSON.stringify(nextUser));
      return nextUser;
    });
  }, [activeBuyer, businessSession, items, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setRequestClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('zeromart-user');
    if (!savedUser) return;
    try {
      const parsedUser = JSON.parse(savedUser);
      if (parsedUser && typeof parsedUser === 'object') {
        setUser((current) => ({
          ...parsedUser,
          ...current,
          userId: parsedUser.userId || parsedUser.id || parsedUser.mobile || current?.userId || current?.mobile || '',
          profileId: parsedUser.profileId || parsedUser.id || parsedUser.userId || current?.profileId || current?.id || '',
          profileImage: parsedUser.profileImage || parsedUser.avatarUrl || current?.profileImage || '',
        }));
      }
    } catch {
      localStorage.removeItem('zeromart-user');
    }
  }, []);

  useEffect(() => {
    if (!user || !isLoggedIn()) return;
    let cancelled = false;

    const resolveProfileValue = async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled || !profile || typeof profile !== 'object') return;
        const metadata = profile.metadata && typeof profile.metadata === 'object' ? profile.metadata : {};
        const nextName = profile.name || profile.display_name || profile.full_name || metadata.displayName || metadata.fullName || '';
        const nextImage = profile.profile_image || profile.avatar_url || metadata.profileImage || metadata.avatarUrl || '';
        setUser((current) => {
          if (!current) return current;
          const merged = {
            ...current,
            name: nextName || current.name,
            profileImage: nextImage || current.profileImage,
            isBuyer: typeof profile.is_buyer === 'boolean' ? profile.is_buyer : current.isBuyer,
            buyerAccessExpiresAt: profile.buyer_access_expires_at || current.buyerAccessExpiresAt || '',
            buyerAccessActivatedAt: profile.buyer_access_activated_at || current.buyerAccessActivatedAt || '',
            userId: current.userId || profile.id || current.mobile,
          };
          localStorage.setItem('zeromart-user', JSON.stringify(merged));
          return merged;
        });
      } catch (error) {
        if (cancelled) return;
        if (Number(error?.status) === 401 || Number(error?.status) === 403) {
          clearToken();
          setUser(null);
          localStorage.removeItem('zeromart-user');
          setNotice('Your session expired. Log in again to continue.');
        }
      }
    };

    resolveProfileValue();
    return () => {
      cancelled = true;
    };
  }, [user?.mobile]);

  // Merge server-side listings into the local live cache so every user sees the same marketplace.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const refreshListings = (options = {}) => syncListingsFromBackend(options)
      .then((listings) => {
        if (!mounted || !Array.isArray(listings)) return;
        setItems(normalizeListingsForMarketplace(listings));
        setNotice((current) => (current === 'Live listings are temporarily unavailable' ? '' : current));
      })
      .catch(() => {
        if (!mounted) return;
        const cached = loadMarketplaceItems();
        setItems(cached);
        setNotice(cached.length ? '' : 'Live listings are temporarily unavailable');
      });

    refreshListings({ force: true });
    const unsubscribe = subscribeToListingChanges(() => refreshListings({ force: true }));
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshListings({ force: true });
    };
    const refreshOnLocalWrite = () => {
      invalidateListingCache();
      refreshListings({ force: true });
    };
    const refreshOnFocus = () => refreshListings({ force: true });
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('drizn_listings_updated', refreshOnLocalWrite);
    const periodicRefresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshListings({ force: true });
    }, REMOTE_LISTING_SYNC_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(periodicRefresh);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('drizn_listings_updated', refreshOnLocalWrite);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const checkExpiry = () => setItems((current) => {
      const next = applyProductExpiry(current);
      const alerts = [];
      next.forEach((product) => {
        const previous = current.find((entry) => entry.id === product.id);
        if (product.status === 'expired' && previous?.status !== 'expired') {
          alerts.push({
            id: `expired-${product.id}-${Date.now()}`,
            type: 'product_expired',
            recipientId: product.businessId || product.ownerMobile || product.sellerName,
            itemId: product.id,
            title: 'Product expired',
            body: `${product.title} was removed from the public marketplace and remains in your inventory history.`,
            time: 'Just now',
            read: false,
          });
        }
        if (product.availableQuantity > 0 && product.availableQuantity <= 2 && previous?.availableQuantity > 2) {
          alerts.push({
            id: `stock-${product.id}-${Date.now()}`,
            type: 'stock_low',
            recipientId: product.businessId || product.ownerMobile || product.sellerName,
            itemId: product.id,
            title: 'Stock running low',
            body: `${product.title} has only ${product.availableQuantity} left.`,
            time: 'Just now',
            read: false,
          });
        }
      });
      if (alerts.length) setNotifications((existing) => [...alerts, ...existing]);
      return next;
    });
    checkExpiry();
    const timer = window.setInterval(checkExpiry, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const showPendingBuyerKarma = () => {
      if (!activeAccountId) return;
      const applyPendingAction = (pendingAction) => {
        if (!pendingAction) {
          setShowKarmaPopup(false);
          setKarmaTarget(null);
          setKarmaError('');
          return;
        }
        const payload = pendingAction.payload && typeof pendingAction.payload === 'object' ? pendingAction.payload : {};
        const sellerName = pendingAction.name || payload.sellerName || payload.businessName || 'Seller';
        setKarmaTarget({
          ...pendingAction,
          id: pendingAction.id || pendingAction.pendingActionId,
          pendingActionId: pendingAction.id || pendingAction.pendingActionId,
          sellerId: pendingAction.seller_account_id || pendingAction.sellerId || payload.sellerId,
          buyerId: pendingAction.buyer_account_id || pendingAction.buyerId,
          requestId: pendingAction.request_id || pendingAction.requestId,
          itemId: pendingAction.listing_id || pendingAction.listingId,
          name: sellerName,
          initials: pendingAction.initials || sellerName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
          productName: payload.productName || pendingAction.productName || '',
          pickupAddress: payload.pickupAddress || pendingAction.pickupAddress || '',
          collectionDate: payload.collectionDate || pendingAction.collectionDate || '',
          collectionTime: payload.collectionTime || pendingAction.collectionTime || '',
          quantity: Number(payload.quantity || pendingAction.quantity || 1),
          mandatory: true,
        });
        setKarmaError('');
        setShowKarmaPopup(true);
      };

      fetchPendingKarmaActions(activeAccountId)
        .then((rows) => {
          if (Array.isArray(rows) && rows.length > 0) {
            savePendingKarmaAction(rows[0]);
            applyPendingAction(rows[0]);
            return;
          }
          const unifiedPending = getPendingKarmaActions().find((entry) => (
            accountKey(entry.buyerId || entry.buyer_account_id) === accountKey(activeAccountId)
          ));
          applyPendingAction(unifiedPending || null);
        })
        .catch(() => {
          const unifiedPending = getPendingKarmaActions().find((entry) => (
            accountKey(entry.buyerId || entry.buyer_account_id) === accountKey(activeAccountId)
          ));
          applyPendingAction(unifiedPending || null);
        });
    };
    showPendingBuyerKarma();
    const timer = window.setInterval(showPendingBuyerKarma, REMOTE_SYNC_INTERVAL_MS);
    window.addEventListener('storage', showPendingBuyerKarma);
    window.addEventListener('zeromart-karma-pending', showPendingBuyerKarma);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', showPendingBuyerKarma);
      window.removeEventListener('zeromart-karma-pending', showPendingBuyerKarma);
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!(showKarmaPopup && karmaTarget?.mandatory)) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const enforceCurrentRoute = () => {
      window.history.pushState({}, '', window.location.pathname + window.location.search);
      setNotice('Good Karma is required before you continue.');
    };
    window.addEventListener('popstate', enforceCurrentRoute);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('popstate', enforceCurrentRoute);
    };
  }, [karmaTarget?.mandatory, showKarmaPopup]);

  useEffect(() => {
    const syncMarketplaceItems = () => {
      setBusinessSession(getBusinessSession());
      skipTransactionPersistRef.current = true;
      setItems(loadMarketplaceItems());
    };
    const syncOrderHistory = () => setOrderHistory(loadOrderHistory());
    const syncNotifications = () => setNotifications(loadNotifications());
    window.addEventListener('storage', syncMarketplaceItems);
    window.addEventListener('storage', syncOrderHistory);
    window.addEventListener('storage', syncNotifications);
    window.addEventListener('drizn_listings_updated', syncMarketplaceItems);
    window.addEventListener('zeromart-business-change', syncMarketplaceItems);
    window.addEventListener('zeromart-marketplace-change', syncMarketplaceItems);
    window.addEventListener('zeromart-transactions-change', syncMarketplaceItems);
    window.addEventListener('zeromart-live-listings-change', syncMarketplaceItems);
    window.addEventListener('zeromart-business-change', syncOrderHistory);
    window.addEventListener('zeromart-transactions-change', syncOrderHistory);
    window.addEventListener('zeromart-transactions-change', syncNotifications);
    return () => {
      window.removeEventListener('storage', syncMarketplaceItems);
      window.removeEventListener('storage', syncOrderHistory);
      window.removeEventListener('storage', syncNotifications);
      window.removeEventListener('drizn_listings_updated', syncMarketplaceItems);
      window.removeEventListener('zeromart-business-change', syncMarketplaceItems);
      window.removeEventListener('zeromart-marketplace-change', syncMarketplaceItems);
      window.removeEventListener('zeromart-transactions-change', syncMarketplaceItems);
      window.removeEventListener('zeromart-live-listings-change', syncMarketplaceItems);
      window.removeEventListener('zeromart-business-change', syncOrderHistory);
      window.removeEventListener('zeromart-transactions-change', syncOrderHistory);
      window.removeEventListener('zeromart-transactions-change', syncNotifications);
    };
  }, []);

  useEffect(() => {
    const showLocationToast = (event) => setNotice(event.detail || 'Location updated');
    window.addEventListener('zeromart-location-toast', showLocationToast);
    return () => window.removeEventListener('zeromart-location-toast', showLocationToast);
  }, []);

  // Dev/demo utility: clear every live listing so the marketplace starts empty.
  // Run `driznResetListings()` in the browser console.
  useEffect(() => {
    if (isProductionRuntime) return undefined;
    window.driznResetListings = () => {
      saveLiveListings([]);
      localStorage.removeItem('zeromart-transaction-products');
      skipTransactionPersistRef.current = true;
      setItems([]);
      window.dispatchEvent(new Event('drizn_listings_updated'));
      return 'Drizn live listings cleared. Marketplace is now empty.';
    };
    return () => { delete window.driznResetListings; };
  }, []);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('zeromart-user', JSON.stringify(user));
      } else {
        localStorage.removeItem('zeromart-user');
      }
    } catch {
      setNotice('Profile is updated for this session, but browser storage is full. Try a smaller profile photo.');
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('zeromart-order-history', JSON.stringify(orderHistory));
  }, [orderHistory]);

  useEffect(() => {
    if (skipTransactionPersistRef.current) {
      skipTransactionPersistRef.current = false;
      return;
    }
    saveTransactionProducts(items.filter((item) => !item.isBusinessProduct));
    const liveItems = stripFallbackDemoWhenLiveExists(items);
    if (getLiveListings().length || liveItems.some((item) => !isLegacyDemoRecord(item))) {
      saveLiveListings(liveItems);
    }
  }, [items]);

  useEffect(() => {
    localStorage.setItem('zeromart-notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (!user) return;
    setNotice((currentNotice) => (
      /you are logged out/i.test(currentNotice) ? '' : currentNotice
    ));
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (localStorage.getItem('zeromart-has-seen-tour') === null) {
      localStorage.setItem('zeromart-has-seen-tour', 'false');
    }

    if (hasSeenTour) {
      localStorage.setItem('zeromart-has-seen-tour', 'true');
    }
  }, [hasSeenTour]);

  useEffect(() => {
    setLocationLabel(
      locationEngine.status === 'locating' && !locationEngine.location
        ? 'Detecting location…'
        : getHeaderLocationLabel(locationEngine.location, locationEngine.label || 'Choose location')
    );
    setCurrentCoordinates(locationEngine.location);
  }, [locationEngine.label, locationEngine.location, locationEngine.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCoordinates(currentCoordinates), 300);
    return () => window.clearTimeout(timer);
  }, [currentCoordinates?.latitude, currentCoordinates?.longitude]);

  useEffect(() => {
    setDiscoveryStageIndex(0);
  }, [categoryFilter, conditionFilter, currentCoordinates?.latitude, currentCoordinates?.longitude, radiusKm, searchQuery]);

  useEffect(() => {
    if (!locationEngine.location) return;
    const scopes = getLocationScopes(locationEngine.location);
    setLeaderboardScope(scopes.some((entry) => entry.scope === 'area') ? 'area' : (scopes[0]?.scope || 'city'));
  }, [locationEngine.location?.latitude, locationEngine.location?.longitude]);

  useEffect(() => {
    const match = path.match(/^\/request\/([^/]+)/);
    if (!match) return;
    const requestId = decodeURIComponent(match[1]);
    const requestNotification = notifications.find((entry) => entry.requestId === requestId && entry.type === 'request');
    const request = getRequests().find((entry) => entry.requestId === requestId);
    if (!request && !requestNotification) {
      setNotice('This collection request could not be found or is no longer available.');
      return;
    }
    if (!activeBuyer) {
      localStorage.setItem('zeromart-pending-request-route', requestId);
      setNotice('Log in as the seller to review this collection request.');
      setShowOtpModal(true);
      return;
    }
    if (request && String(request.sellerId) !== String(activeAccountId)) {
      setNotice('This request link belongs to the seller. Log in with the seller account to continue.');
      return;
    }
    if (requestNotification) {
      localStorage.removeItem('zeromart-pending-request-route');
      setActiveView('notifications');
      setSelectedNotification(requestNotification);
      setNotice('');
    }
  }, [path, activeAccountId, activeBuyer, notifications]);

  useEffect(() => {
    let cancelled = false;

    const resolveListingRoute = async () => {
      const [pathname = '', rawQuery = ''] = String(path || '/').split('?');
      const match = pathname.match(/^\/listing\/([^/]+)/);
      if (!match) return;
      const listingId = decodeURIComponent(match[1]);
      const query = new URLSearchParams(rawQuery || '');
      const action = String(query.get('action') || '').toLowerCase();
      let listing = items.find((entry) => String(entry.id) === String(listingId));

      if (!listing) {
        try {
          const fetchedListing = await fetchListingById(listingId);
          if (cancelled || !fetchedListing) return;
          listing = normalizeProductStock(fetchedListing);
          setItems((prev) => (
            prev.some((entry) => String(entry.id) === String(listing.id))
              ? prev
              : [listing, ...prev]
          ));
        } catch {
          // Keep user-facing behavior stable if the listing lookup fails.
        }
      }

      if (!listing || cancelled) {
        setNotice('This item is no longer available');
        return;
      }

      const normalizedListing = normalizeProductStock(listing);
      const requestState = getProductRequestState(normalizedListing, activeAccountId, requestClock);
      setSelectedItem(normalizedListing);
      if (!requestState.canRequest) {
        setNotice(requestState.soldOut || requestState.expired ? 'This item is no longer available' : (requestState.buttonLabel || 'Request unavailable right now'));
        return;
      }
      if ((action === 'request' && !normalizedListing.isBusinessProduct) || (action === 'reserve' && normalizedListing.isBusinessProduct)) {
        setQuantityItem(normalizedListing);
      }
    };

    resolveListingRoute();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, items, path, requestClock]);

  useEffect(() => {
    if (!activeAccountId) return;
    const acceptedRequests = getRequests().filter((request) => (
      ['accepted', 'awaiting_collection', 'karma_pending', 'completed'].includes(request.status)
      && (
        accountKey(request.buyerId) === accountKey(activeAccountId)
        || accountKey(request.sellerId) === accountKey(activeAccountId)
      )
    ));
    if (!acceptedRequests.length) return;

    commitNotifications((current) => {
      let changed = false;
      let next = [...current];
      acceptedRequests.forEach((request) => {
        const isBuyer = accountKey(request.buyerId) === accountKey(activeAccountId);
        const status = request.status === 'completed'
          ? 'completed'
          : request.status === 'karma_pending'
            ? 'karma_pending'
            : 'awaiting_collection';
        if (isBuyer) {
          const acceptedId = `accepted-${request.requestId}`;
          const existing = next.find((entry) => entry.id === acceptedId);
          if (!existing) {
            const collectionSummary = [request.collectionDate, request.collectionTime].filter(Boolean).join(' at ');
            next.unshift({
              id: acceptedId,
              type: 'requestAccepted',
              requestId: request.requestId,
              itemId: request.productId,
              recipientId: request.buyerId,
              sellerName: request.sellerName,
              buyerName: request.buyerName,
              productName: request.productName,
              sellerPhone: request.sellerPhone,
              title: `${request.sellerName} accepted your request`,
              body: status === 'completed'
                ? `${request.productName} was collected successfully.`
                : status === 'karma_pending'
                  ? `Collection complete for ${request.productName}. Good Karma is now required.`
                : `Accepted. Collect ${request.productName}${collectionSummary ? ` on ${collectionSummary}` : ''}.`,
              requestStatus: status,
              collectionDate: request.collectionDate || '',
              collectionTime: request.collectionTime || '',
              pickupAddress: request.pickupAddress || '',
              optionalMessage: request.optionalMessage || '',
              mapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(request.pickupAddress || '')}`,
              whatsappLink: createWhatsAppLink(request.sellerPhone, `Hello, I am ${request.buyerName}. I am coordinating collection for ${request.productName}.`),
              time: 'Just now',
              read: false,
            });
            changed = true;
          }
        } else {
          next = next.map((entry) => {
            if (entry.requestId !== request.requestId || entry.type !== 'request' || entry.requestStatus === status) return entry;
            changed = true;
            return {
              ...entry,
              requestStatus: status,
              body: status === 'completed'
                ? `${request.buyerName} collected ${request.productName}.`
                : status === 'karma_pending'
                  ? `You handed over ${request.productName}. Good Karma is now required from ${request.buyerName}.`
                : `Awaiting collection from ${request.buyerName}. Collection details were sent to the buyer.`,
            };
          });
        }
      });
      return changed ? next : current;
    });
  }, [activeAccountId]);

  const requireLogin = (action) => {
    setNotice(action === 'profile' ? 'Log in to view your full profile.' : 'Log in to continue the flow.');
    setShowOtpModal(true);
  };

  const handleLogin = (authResult) => {
    const mobile = typeof authResult === 'string' ? authResult : String(authResult?.mobile || authResult?.user?.phone || '');
    const serverUser = typeof authResult === 'object' ? authResult?.user || {} : {};
    const savedKarma = getKarmaLedger()[accountKey(mobile)];
    const nextAccountId = serverUser.id || mobile;
    const nextUser = {
      userId: nextAccountId,
      profileId: serverUser.id || mobile,
      name: serverUser.name && serverUser.name !== 'Unknown' ? serverUser.name : 'Drizn User',
      mobile,
      karma: Number(serverUser.karma ?? savedKarma ?? 0),
      listed: 0,
      collected: 0,
      activeListings: 0,
      givenAway: 0,
      isBuyer: Boolean(serverUser.is_buyer),
      profileImage: '',
      location: locationEngine.location,
      buyerAccessExpiresAt: serverUser.buyer_access_expires_at || '',
      buyerAccessActivatedAt: serverUser.buyer_access_activated_at || '',
    };
    setUser(nextUser);
    localStorage.setItem('zeromart-user', JSON.stringify(nextUser));
    setShowOtpModal(false);
    setNotice('Welcome! You can list for free and buy anything for ₹0 with a ₹29 yearly platform fee for buyer access.');
    requestPushAccessForAccount(nextAccountId);
  };

  const handleAuthExpired = () => {
    buyerAccessBypassRef.current = false;
    clearToken();
    setUser(null);
    localStorage.removeItem('zeromart-user');
    setShowBuyerPaySheet(false);
    setNotice('Your session expired. Log in again to continue secure payment.');
    setShowOtpModal(true);
  };

  const handleNav = (view) => {
    if (showKarmaPopup && karmaTarget?.mandatory) {
      setNotice('Good Karma is required before you continue.');
      return;
    }
    if (view === 'home') {
      if (path !== '/') navigate('/');
      setActiveView('home');
      setSelectedNotification(null);
      setSelectedItem(null);
      setNotice('');
      setItems(loadMarketplaceItems());
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
      return;
    }
    if (view === 'favorites') {
      setFavoriteBadgeCount(0);
      localStorage.setItem('zeromart-new-favorites-count', '0');
    }
    if (view === 'notifications') {
      const visibleNotificationIds = new Set(visibleNotifications.map((notification) => notification.id));
      setNotifications((current) => {
        const next = current.map((notification) => (
          visibleNotificationIds.has(notification.id) ? { ...notification, read: true } : notification
        ));
        localStorage.setItem('zeromart-notifications', JSON.stringify(next));
        return next;
      });
    }
    setActiveView(view);
    setSelectedNotification(null);
    setNotice('');
  };

  const handleLogout = () => {
    buyerAccessPendingRequestRef.current = null;
    buyerAccessBypassRef.current = false;
    setUser(null);
    setFavorites([]);
    setOrderHistory([]);
    setNotifications([]);
    localStorage.removeItem('zeromart-user');
    setActiveView('home');
    setNotice('You are logged out. Sign up / Login to request items, list items, and keep your karma.');
  };

  const handleBack = () => {
    if (showKarmaPopup && karmaTarget?.mandatory) {
      setNotice('Good Karma is required before you continue.');
      return;
    }
    if (path !== '/') navigate('/');
    setActiveView('home');
    setSelectedNotification(null);
    setSelectedItem(null);
    setNotice('');
  };

  const handleTourFinish = () => {
    setHasSeenTour(true);
  };

  const handleRequest = async (itemId, requestDetails = null) => {
    const requestedItem = normalizeProductStock(items.find((item) => item.id === itemId) ?? selectedItem);
    const requestDiagnostic = {
      listingId: String(itemId || ''),
      buyerAccountId: String(activeAccountId || ''),
      sellerAccountId: String(requestedItem?.sellerId || requestedItem?.businessId || requestedItem?.ownerMobile || ''),
      quantity: Number(requestDetails?.quantity || 1),
      endpoint: '/api/listings/:id/reserve',
    };
    console.info('[request-submit] start', requestDiagnostic);
    const isOwnListing = isOwnedByActiveAccount(requestedItem);
    if (isOwnListing) {
      setQuantityItem(null);
      console.info('[request-submit] blocked own listing', requestDiagnostic);
      setNotice('This is your listing. You can edit or delete it, but you cannot purchase it.');
      return;
    }
    if (!activeBuyer) {
      setQuantityItem(null);
      console.info('[request-submit] blocked unauthenticated buyer', requestDiagnostic);
      setSelectedItem(items.find((item) => item.id === itemId) ?? null);
      requireLogin('request');
      return;
    }
    if (!activeBuyer.isBuyer && !buyerAccessBypassRef.current) {
      setQuantityItem(null);
      console.info('[request-submit] blocked buyer access not unlocked', requestDiagnostic);
      buyerAccessPendingRequestRef.current = { itemId, requestDetails };
      setShowBuyerPaySheet(true);
      return;
    }
    if (!requestDetails?.quantity) {
      setQuantityItem(requestedItem);
      return;
    }
    const allowance = getQuantityAllowance(requestedItem, activeAccountId, requestDetails.quantity);
    if (allowance.allowedQuantity < 1) {
      const message = allowance.requestableStock <= 0
        ? 'This item is no longer available.'
        : 'Request limit reached. Please try again later.';
      console.info('[request-submit] blocked by allowance', {
        ...requestDiagnostic,
        requestableStock: allowance.requestableStock,
        remainingLimit: allowance.remainingLimit,
      });
      setNotice(message);
      setQuantityItem(requestedItem);
      throw new Error(message);
    }
    const quantity = allowance.allowedQuantity;
    const existingOpenRequest = getRequests().find((request) => (
      String(request.productId) === String(itemId)
      && accountKey(request.buyerId) === accountKey(activeAccountId)
      && isRequestActiveForLock(request)
    ));
    if (existingOpenRequest) {
      setQuantityItem(null);
      console.info('[request-submit] blocked duplicate active request', {
        ...requestDiagnostic,
        existingRequestId: existingOpenRequest.requestId,
      });
      setNotice('You already have an active request for this item.');
      const existingNotification = notifications.find((entry) => String(entry.requestId) === String(existingOpenRequest.requestId));
      if (existingNotification) {
        setActiveView('notifications');
        setSelectedNotification(existingNotification);
      }
      return;
    }
    const orderId = createOrderId();
    try {
      const reserveResult = await reserveListing(itemId, {
        quantity,
        requestId: orderId,
        buyerAccountId: String(activeAccountId || ''),
        buyerName: activeBuyer?.name || 'Buyer',
        buyerPhone: activeBuyer?.mobile || '',
        buyerLocation: formatShortAddress(locationEngine.location) || '',
        sellerAccountId: String(requestedItem?.sellerId || requestedItem?.businessId || requestedItem?.ownerMobile || ''),
      });
      if (!reserveResult?.success) throw new Error(reserveResult?.error || 'reservation failed');
      console.info('[request-submit] reserve success', {
        ...requestDiagnostic,
        requestId: orderId,
        httpStatus: 200,
      });
      if (reserveResult?.listing) {
        setItems((prev) => prev.map((item) => (
          String(item.id) === String(reserveResult.listing.id)
            ? normalizeProductStock({ ...item, ...reserveResult.listing })
            : item
        )));
      }
    } catch (error) {
      console.warn('[request-submit] reserve failed', {
        ...requestDiagnostic,
        requestId: orderId,
        safeError: error?.message || 'request failed',
      });
      setNotice(error?.message || 'This item is no longer available.');
      throw error;
    }

    const requestUrl = `${window.location.origin}/request/${encodeURIComponent(orderId)}`;
    const createdAtIso = new Date().toISOString();
    const createdAt = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const buyerDisplayName = String(activeBuyer?.name || '').trim().toLowerCase() === 'unknown'
      ? (activeBuyer?.mobile ? `User ${String(activeBuyer.mobile).slice(-4)}` : 'Buyer')
      : (activeBuyer?.name || 'Buyer');
    const historyEntry = {
      id: orderId,
      orderId,
      buyerId: activeAccountId,
      sellerId: requestedItem?.sellerId || requestedItem?.ownerMobile || requestedItem?.sellerName,
      itemId,
      title: requestedItem?.title || 'Requested item',
      image: requestedItem?.image,
      sellerName: requestedItem?.sellerName || requestedItem?.brand || 'Seller',
      location: requestedItem?.location || 'Nearby',
      distance: requestedItem?.distance || '',
      type: 'in-person',
      status: 'Pending seller approval',
      quantity,
      deliveryStatus: '',
      buyerName: requestDetails?.buyerName || buyerDisplayName,
      buyerPhone: requestDetails?.buyerPhone || activeBuyer.mobile,
      buyerAddress: requestDetails?.buyerAddress,
      buyerLocationData: requestDetails?.buyerLocationData || activeBuyer.location || locationEngine.location,
      createdAt,
    };
    const requestRecord = {
      requestId: orderId,
      buyerId: activeAccountId,
      sellerId: requestedItem?.sellerId || requestedItem?.businessId || requestedItem?.ownerMobile || requestedItem?.sellerName,
      productId: itemId,
      quantity,
      buyerName: historyEntry.buyerName,
      buyerPhone: historyEntry.buyerPhone,
      buyerLocation: formatShortAddress(historyEntry.buyerLocationData) || 'Location not shared',
      buyerLocationData: historyEntry.buyerLocationData,
      sellerName: historyEntry.sellerName,
      sellerPhone: requestedItem?.ownerMobile || requestedItem?.sellerPhone || '',
      productName: historyEntry.title,
      requestUrl,
      status: 'pending',
      createdAt: createdAtIso,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      buyerCollected: false,
      sellerGave: false,
    };
    const requestNotification = {
      id: `request-${orderId}`,
      type: 'request',
      requestId: orderId,
      itemId,
      title: '📦 New Collection Request',
      body: `${historyEntry.buyerName} from ${requestRecord.buyerLocation} wants to collect ${historyEntry.title} × ${quantity}.`,
      productName: historyEntry.title,
      quantity,
      buyerName: historyEntry.buyerName,
      buyerPhone: historyEntry.buyerPhone,
      buyerLocation: formatShortAddress(historyEntry.buyerLocationData) || 'Location not shared',
      sellerName: historyEntry.sellerName,
      sellerPhone: requestRecord.sellerPhone,
      sellerPickupAddress: requestedItem?.locationData?.fullAddress || requestedItem?.location || '',
      sellerLocationData: requestedItem?.locationData || null,
      requestUrl,
      recipientId: requestedItem?.sellerId || requestedItem?.businessId || requestedItem?.ownerMobile || requestedItem?.sellerName,
      buyerId: activeAccountId,
      requestStatus: 'pending',
      time: 'Just now',
      read: false,
    };
    saveRequests([requestRecord, ...getRequests()]);
    recordPurchaseAttempt({ requestId: orderId, productId: itemId, buyerId: activeAccountId, quantity, status: 'pending', createdAt: createdAtIso });
    setItems((prev) => prev.map((item) => (
      item.id === itemId
        ? { ...normalizeProductStock(item), reservedQuantity: normalizeProductStock(item).reservedQuantity + quantity, status: 'requested' }
        : item
    )));
    setOrderHistory((prev) => [historyEntry, ...prev]);
    setNotifications((prev) => [requestNotification, ...prev]);
    setOrderSuccess(historyEntry);
    setQuantityItem(null);
    setSelectedItem(null);
    setNotice('Request sent. The seller can confirm it from Alerts.');
    safeEmitNotificationEvent({
      eventType: 'new_request',
      recipientAccountId: requestNotification.recipientId,
      actorAccountId: activeAccountId,
      listingId: itemId,
      requestId: orderId,
      title: requestNotification.title,
      body: requestNotification.body,
      dedupeKey: `new_request:${orderId}`,
      payload: {
        buyerId: activeAccountId,
        buyerName: historyEntry.buyerName,
        buyerPhone: historyEntry.buyerPhone,
        buyerLocation: requestRecord.buyerLocation,
        sellerId: requestNotification.recipientId,
        sellerName: historyEntry.sellerName,
        sellerPhone: requestRecord.sellerPhone,
        productName: historyEntry.title,
        quantity,
      },
    });
  };

  const handleQuantityConfirm = async ({ quantity, collectionWindow }) => {
    const requestedItem = normalizeProductStock(quantityItem);
    if (!requestedItem?.isBusinessProduct) {
      await handleRequest(requestedItem.id, { quantity });
      return;
    }
    const allowance = getQuantityAllowance(requestedItem, activeAccountId, quantity);
    if (allowance.allowedQuantity < 1) {
      const message = allowance.requestableStock <= 0
        ? 'This item is no longer available.'
        : 'Request limit reached. Please try again later.';
      setNotice(message);
      throw new Error(message);
    }
    const reservedQuantity = allowance.allowedQuantity;
    const orderId = createOrderId();
    try {
      const reserveResult = await reserveListing(requestedItem.id, {
        quantity: reservedQuantity,
        requestId: orderId,
      });
      if (!reserveResult?.success) throw new Error(reserveResult?.error || 'reservation failed');
      if (reserveResult?.listing) {
        setItems((prev) => prev.map((item) => (
          String(item.id) === String(reserveResult.listing.id)
            ? normalizeProductStock({ ...item, ...reserveResult.listing })
            : item
        )));
      }
    } catch (error) {
      setNotice(error?.message || 'This item is no longer available.');
      throw error;
    }

    const collectionCode = createCollectionCode();
    const reservedAt = new Date().toISOString();
    const reservationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const pickupCoordinates = requestedItem.coordinates || (requestedItem.locationData ? {
      latitude: requestedItem.locationData.latitude,
      longitude: requestedItem.locationData.longitude,
    } : null);
    const pickupAddress = requestedItem.locationData?.fullAddress || requestedItem.location || 'Store pickup';
    const directionsDestination = Number.isFinite(Number(pickupCoordinates?.latitude)) && Number.isFinite(Number(pickupCoordinates?.longitude))
      ? `${pickupCoordinates.latitude},${pickupCoordinates.longitude}`
      : pickupAddress;
    const reservation = {
      id: orderId,
      orderId,
      collectionCode,
      qrCodeValue: `${orderId}|${collectionCode}`,
      buyerId: activeAccountId,
      buyerName: activeBuyer.name,
      buyerPhone: activeBuyer.mobile,
      buyerBusinessId: businessSession?.id || null,
      businessId: requestedItem.businessId,
      productId: requestedItem.id,
      businessProductId: requestedItem.businessProductId,
      title: requestedItem.title,
      image: requestedItem.image,
      sellerName: requestedItem.sellerName,
      quantity: reservedQuantity,
      status: 'reserved',
      reservedAt,
      reservationExpiresAt,
      collectionWindow,
      businessPickupAddress: pickupAddress,
      businessPickupLocationData: requestedItem.locationData || null,
      businessPickupCoordinates: pickupCoordinates,
      directionsLink: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination)}`,
      storePhone: getBusinessAccounts().find((account) => account.id === requestedItem.businessId)?.mobile || '',
      type: 'business-reservation',
      createdAt: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
    };
    reservation.whatsappLink = createWhatsAppLink(activeBuyer.mobile, `Your Drizn order ${collectionCode} is reserved at ${requestedItem.sellerName}. Show this collection ID or QR at the store to collect ${requestedItem.title} × ${reservedQuantity}.`);
    saveReservations([reservation, ...getReservations()]);
    saveBusinessProducts(getBusinessProducts().map((product) => {
      if (product.id !== requestedItem.businessProductId) return product;
      const availableQuantity = Number(product.availableQuantity ?? product.quantity ?? 1);
      return {
        ...product,
        availableQuantity: Math.max(0, availableQuantity - reservedQuantity),
        reservedQuantity: Number(product.reservedQuantity || 0) + reservedQuantity,
      };
    }));
    recordPurchaseAttempt({ requestId: orderId, productId: requestedItem.id, buyerId: activeAccountId, quantity: reservedQuantity, status: 'reserved', createdAt: reservedAt });
    setItems((prev) => prev.map((item) => {
      if (item.id !== requestedItem.id) return item;
      const stock = normalizeProductStock(item);
      return {
        ...stock,
        availableQuantity: Math.max(0, stock.availableQuantity - reservedQuantity),
        reservedQuantity: stock.reservedQuantity + reservedQuantity,
        status: stock.availableQuantity - reservedQuantity <= 0 ? 'reserved' : 'active',
      };
    }));
    const sellerOrder = createBusinessOrder(requestedItem, activeBuyer, {
      buyerId: activeAccountId,
      buyerBusinessId: businessSession?.id || null,
      orderId,
      whatsappLink: reservation.whatsappLink,
      quantity: reservedQuantity,
      status: 'Reserved',
      collectionCode,
      collectionWindow,
    });
    const purchase = { ...reservation, sellerOrderId: sellerOrder?.id || null };
    if (businessSession) saveBusinessPurchases([purchase, ...getBusinessPurchases()]);
    setOrderHistory((prev) => [reservation, ...prev]);
    commitNotifications((prev) => [{
      id: `reserved-${orderId}`,
      type: 'businessOrderUpdate',
      recipientId: activeAccountId,
      title: 'Your item is reserved',
      body: `${requestedItem.title} × ${reservedQuantity} is reserved at ${requestedItem.sellerName}.`,
      itemId: requestedItem.id,
      orderId,
      orderStatus: 'Reserved',
      productName: requestedItem.title,
      businessName: requestedItem.sellerName,
      sellerName: requestedItem.sellerName,
      sellerPhone: reservation.storePhone,
      quantity: reservedQuantity,
      collectionCode,
      collectionTime: collectionWindow,
      pickupAddress: reservation.businessPickupAddress,
      mapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(reservation.businessPickupAddress || '')}`,
      whatsappLink: createWhatsAppLink(reservation.storePhone, `Hello, I reserved ${requestedItem.title} on Drizn. Collection ID: ${collectionCode}.`),
      time: 'Just now',
      read: false,
    }, {
      id: `business-order-${orderId}`,
      type: 'businessOrderReceived',
      recipientId: requestedItem.businessId,
      title: 'New business collection order',
      body: `${activeBuyer.name} reserved ${requestedItem.title} × ${reservedQuantity}.`,
      itemId: requestedItem.id,
      orderId,
      orderStatus: 'Reserved',
      productName: requestedItem.title,
      buyerName: activeBuyer.name,
      buyerPhone: activeBuyer.mobile,
      quantity: reservedQuantity,
      collectionCode,
      collectionTime: collectionWindow,
      time: 'Just now',
      read: false,
    }, ...prev]);
    setOrderSuccess(purchase);
    setQuantityItem(null);
    setSelectedItem(null);
    setNotice(`Reserved successfully. Show collection ID ${collectionCode} at the store.`);
    safeEmitNotificationEvent({
      eventType: 'reservation_confirmed',
      recipientAccountId: activeAccountId,
      actorAccountId: requestedItem.businessId,
      listingId: requestedItem.id,
      orderId,
      title: 'Your item is reserved',
      body: `${requestedItem.title} × ${reservedQuantity} is reserved at ${requestedItem.sellerName}.`,
      dedupeKey: `reservation_confirmed:${orderId}`,
      payload: {
        collectionCode,
        quantity: reservedQuantity,
      },
    });
    safeEmitNotificationEvent({
      eventType: 'store_reservation_received',
      recipientAccountId: requestedItem.businessId,
      actorAccountId: activeAccountId,
      listingId: requestedItem.id,
      orderId,
      title: 'New business collection order',
      body: `${activeBuyer.name} reserved ${requestedItem.title} × ${reservedQuantity}.`,
      dedupeKey: `store_reservation_received:${orderId}`,
      payload: {
        buyerName: activeBuyer.name,
        buyerPhone: activeBuyer.mobile,
        quantity: reservedQuantity,
        collectionCode,
      },
    });
  };

  const handleBuyNow = (item) => {
    const isOwnListing = isOwnedByActiveAccount(item);
    if (isOwnListing) {
      setSelectedItem(item);
      setNotice('This is your listing. Use Edit listing or Delete listing to manage it.');
      return;
    }
    if (!activeBuyer) {
      setSelectedItem(item);
      requireLogin('request');
      return;
    }
    if (!activeBuyer.isBuyer) {
      setSelectedItem(item);
      setShowBuyerPaySheet(true);
      return;
    }
    setSelectedItem(item);
  };

  const handleRequestDecision = async (notification, decision, confirmation = {}) => {
    const accepted = decision === 'accepted';
    const persistedStatus = accepted ? 'awaiting_collection' : 'declined';
    const nextStatus = accepted ? 'Seller confirmed' : 'Request declined';
    const currentRequest = getRequests().find((request) => request.requestId === notification.requestId);
    try {
      await saveOrder({
        id: notification.requestId,
        orderId: notification.requestId,
        requestId: notification.requestId,
        listingId: notification.itemId,
        productId: notification.itemId,
        buyerId: notification.buyerId,
        sellerId: notification.recipientId,
        status: persistedStatus,
        quantity: Number(currentRequest?.quantity || notification.quantity || 1),
        productName: notification.productName || notification.title.replace('Request for ', ''),
        buyerName: notification.buyerName,
        sellerName: notification.sellerName,
        sellerPhone: accepted ? (confirmation.sellerPhone || notification.sellerPhone || '') : '',
        pickupAddress: confirmation.pickupAddress || '',
        collectionDate: confirmation.collectionDate || '',
        collectionTime: confirmation.collectionTime || '',
        optionalMessage: confirmation.optionalMessage || '',
      });
    } catch (error) {
      setNotice(error?.message || 'Could not update this request right now.');
      return;
    }
    saveRequests(getRequests().map((request) => (
      request.requestId === notification.requestId
        ? {
            ...request,
          status: persistedStatus,
            collectionDate: confirmation.collectionDate || '',
            collectionTime: confirmation.collectionTime || '',
            pickupAddress: confirmation.pickupAddress || '',
            sellerPhone: accepted ? (confirmation.sellerPhone || notification.sellerPhone || '') : '',
            optionalMessage: confirmation.optionalMessage || '',
            sellerGave: request.sellerGave,
          }
        : request
    )));
      updatePurchaseHistoryStatus(notification.requestId, persistedStatus);
    if (accepted) {
      const productName = notification.productName || notification.title.replace('Request for ', '');
      const sellerPhone = confirmation.sellerPhone || notification.sellerPhone || '';
      const collectionSummary = `${confirmation.collectionDate} at ${confirmation.collectionTime}`;
      const buyerWhatsappLink = createWhatsAppLink(notification.buyerPhone, `Your Drizn request for ${productName} is confirmed by ${notification.sellerName}. Collect on ${collectionSummary} from ${confirmation.pickupAddress}. Seller phone: ${sellerPhone}.${confirmation.optionalMessage ? ` Message: ${confirmation.optionalMessage}` : ''}`);
      const sellerWhatsappLink = createWhatsAppLink(sellerPhone, `Hello, I am ${notification.buyerName}. My Drizn collection for ${productName} is confirmed for ${collectionSummary}.`);
      const emailSubject = encodeURIComponent('Drizn Collection Confirmation');
      const emailBody = encodeURIComponent(`Product: ${productName}\nCollection time: ${collectionSummary}\nPickup address: ${confirmation.pickupAddress}\nSeller phone: ${sellerPhone}`);
      const emailLink = `mailto:seller@email.com?subject=${emailSubject}&body=${emailBody}`;
      const acceptedNotification = {
        id: `accepted-${notification.requestId}`,
        type: 'requestAccepted',
        requestId: notification.requestId,
        itemId: notification.itemId,
        recipientId: notification.buyerId,
        sellerName: notification.sellerName,
        buyerName: notification.buyerName,
        productName,
        sellerPhone,
        title: `${notification.sellerName} accepted your request`,
        body: `Accepted. Collect ${productName} on ${collectionSummary}. Phone, pickup address, and seller note are available here.`,
        requestStatus: 'awaiting_collection',
        collectionDate: confirmation.collectionDate || '',
        collectionTime: confirmation.collectionTime || '',
        pickupAddress: confirmation.pickupAddress || '',
        optionalMessage: confirmation.optionalMessage || '',
        mapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(confirmation.pickupAddress || '')}`,
        whatsappLink: sellerWhatsappLink,
        buyerWhatsappLink,
        emailLink,
        time: 'Just now',
        read: false,
      };
      commitNotifications((prev) => {
        const sellerUpdate = prev.map((entry) => (
          entry.id === notification.id
            ? {
                ...entry,
                read: true,
                requestStatus: 'awaiting_collection',
                body: `Awaiting collection from ${notification.buyerName}. Collection details were sent to the buyer.`,
              }
            : entry
        ));
        return [acceptedNotification, ...sellerUpdate.filter((entry) => entry.id !== acceptedNotification.id)];
      });
    } else {
      const declinedNotification = {
        id: `declined-${notification.requestId}`,
        type: 'requestDeclined',
        requestId: notification.requestId,
        itemId: notification.itemId,
        recipientId: notification.buyerId,
        title: 'Collection request declined',
        body: `${notification.sellerName} could not confirm your request for ${notification.productName || 'this item'}.`,
        requestStatus: 'declined',
        time: 'Just now',
        read: false,
      };
      commitNotifications((prev) => {
        const sellerUpdate = prev.map((entry) => (
          entry.id === notification.id
            ? { ...entry, read: true, requestStatus: 'declined', body: 'Request declined by the seller.' }
            : entry
        ));
        return [declinedNotification, ...sellerUpdate.filter((entry) => entry.id !== declinedNotification.id)];
      });
    }
    setSelectedNotification((current) => (
      current?.id === notification.id
        ? {
            ...current,
            read: true,
            requestStatus: persistedStatus,
            body: accepted
              ? `Awaiting collection from ${notification.buyerName}. Collection details were sent to the buyer.`
              : 'Request declined by the seller.',
          }
        : current
    ));
    setOrderHistory((prev) => prev.map((order) => (
      order.orderId === notification.requestId ? { ...order, status: nextStatus } : order
    )));
    setItems((prev) => prev.map((item) => {
      if (item.id !== notification.itemId) return item;
      const stock = normalizeProductStock(item);
      return accepted
        ? { ...stock, status: 'reserved' }
        : {
            ...stock,
            reservedQuantity: Math.max(0, stock.reservedQuantity - Number(currentRequest?.quantity || 1)),
            status: 'active',
          };
    }));
    if (accepted) {
      setNotice('Request accepted. The buyer received your phone number, pickup address, time, and message.');
      safeEmitNotificationEvent({
        eventType: 'request_accepted',
        recipientAccountId: notification.buyerId,
        actorAccountId: notification.recipientId,
        listingId: notification.itemId,
        requestId: notification.requestId,
        title: `${notification.sellerName} accepted your request`,
        body: `Accepted. Collect ${notification.productName || 'the item'} on ${confirmation.collectionDate} at ${confirmation.collectionTime}.`,
        dedupeKey: `request_accepted:${notification.requestId}`,
        payload: {
          buyerId: notification.buyerId,
          buyerName: notification.buyerName,
          sellerId: notification.recipientId,
          sellerName: notification.sellerName,
          productName: notification.productName || 'the item',
          sellerPhone: confirmation.sellerPhone || notification.sellerPhone || '',
          pickupAddress: confirmation.pickupAddress || '',
          collectionDate: confirmation.collectionDate || '',
          collectionTime: confirmation.collectionTime || '',
          optionalMessage: confirmation.optionalMessage || '',
        },
      });
    } else {
      setNotice('The request was declined. Reserved stock was released.');
      safeEmitNotificationEvent({
        eventType: 'request_declined',
        recipientAccountId: notification.buyerId,
        actorAccountId: notification.recipientId,
        listingId: notification.itemId,
        requestId: notification.requestId,
        title: 'Collection request declined',
        body: `${notification.sellerName} could not confirm your request for ${notification.productName || 'this item'}.`,
        dedupeKey: `request_declined:${notification.requestId}`,
        payload: {
          buyerId: notification.buyerId,
          buyerName: notification.buyerName,
          sellerId: notification.recipientId,
          sellerName: notification.sellerName,
          productName: notification.productName || 'this item',
        },
      });
    }
  };

  const handleOpenListing = () => {
    if (businessSession) {
      navigate('/business/inventory');
      return;
    }
    if (!user) {
      setNotice('Sign up / Login to list your item. Listing remains completely free.');
      requireLogin('listing');
      return;
    }
    setEditingItem(null);
    setShowPostSuccessModal(false);
    setShowListingSheet(true);
  };

  const toggleFavorite = (item) => {
    setFavorites((prev) => {
      const exists = prev.some((entry) => entry.id === item.id);
      const next = exists ? prev.filter((entry) => entry.id !== item.id) : [...prev, item];
      localStorage.setItem('zeromart-favorites', JSON.stringify(next));
      if (!exists) {
        setFavoriteBadgeCount((current) => {
          const nextCount = current + 1;
          localStorage.setItem('zeromart-new-favorites-count', String(nextCount));
          return nextCount;
        });
      }
      setNotice(exists ? 'Removed from favourites' : 'Added to favourites');
      return next;
    });
  };

  const handleUpdateUser = async (updates) => {
    if (!user) return;
    const currentUser = user;
    const nextUser = { ...currentUser, ...updates };
    const ownsListing = (item) => (
      item.sellerId === currentUser.userId
      || item.ownerMobile === currentUser.mobile
      || item.sellerName === currentUser.name
      || item.sellerName === 'You'
    );
    const applyProfile = (item) => ownsListing(item)
      ? {
          ...item,
          sellerName: nextUser.name || 'Drizn User',
          sellerProfileImage: nextUser.profileImage || '',
          sellerAvatar: nextUser.profileImage || '',
          avatarUrl: nextUser.profileImage || '',
          sellerProfile: {
            ...(item.sellerProfile || {}),
            id: String(item.sellerProfile?.id || item.sellerId || nextUser.userId || nextUser.mobile || 'guest-owner'),
            name: nextUser.name || item.sellerProfile?.name || 'Drizn User',
            initials: item.sellerProfile?.initials || item.sellerInitials || nextUser.initials || 'DU',
            avatarUrl: nextUser.profileImage || item.sellerProfile?.avatarUrl || '',
            logoUrl: item.sellerProfile?.logoUrl || '',
            accountType: item.sellerProfile?.accountType || item.sellerType || 'community',
          },
        }
      : item;
    setItems((existing) => existing.map(applyProfile));
    setFavorites((existing) => {
      const nextFavorites = existing.map(applyProfile);
      try {
        localStorage.setItem('zeromart-favorites', JSON.stringify(nextFavorites));
      } catch {
        setNotice('Profile saved, but the browser could not update cached favourites.');
      }
      return nextFavorites;
    });
    setUser(nextUser);
    try {
      const remoteProfile = await updateProfile({
        ...nextUser,
        profileImage: nextUser.profileImage || '',
        profile_image: nextUser.profileImage || '',
      });
      const metadata = remoteProfile?.metadata && typeof remoteProfile.metadata === 'object' ? remoteProfile.metadata : {};
      const remoteImage = remoteProfile?.profile_image
        || remoteProfile?.avatar_url
        || metadata.profileImage
        || metadata.avatarUrl
        || nextUser.profileImage
        || '';
      const remoteName = remoteProfile?.name || remoteProfile?.display_name || metadata.displayName || nextUser.name;
      setUser((current) => {
        if (!current) return current;
        const merged = {
          ...current,
          ...nextUser,
          name: remoteName || current.name,
          profileImage: remoteImage,
        };
        localStorage.setItem('zeromart-user', JSON.stringify(merged));
        return merged;
      });
      invalidateListingCache();
      const listings = await syncListingsFromBackend({ force: true }).catch(() => null);
      if (Array.isArray(listings)) {
        setItems(normalizeListingsForMarketplace(listings));
      }
    } catch {
      // Non-blocking local save fallback.
    }
    setNotice('Profile updated successfully');
    // clear transient profile update notice after a short time
    setTimeout(() => { setNotice(''); }, 4000);
  };

  const handleListingSubmit = async (formData) => {
    console.log('[listing-submit] submit started', formData);
    if (editingItem) {
      const sellerAvatar = editingItem.sellerProfileImage
        || editingItem.sellerAvatar
        || editingItem.avatarUrl
        || editingItem.sellerProfile?.avatarUrl
        || user?.profileImage
        || '';
      const updatedItem = {
        ...editingItem,
        title: formData.title,
        category: formData.category,
        condition: formData.condition,
        description: formData.description,
        location: formData.pickupArea,
        image: formData.image,
        validTill: formData.validTill,
        expiryDate: formData.expiryDate,
        expiryTime: formData.expiryTime,
        totalQuantity: formData.totalQuantity,
        availableQuantity: formData.availableQuantity,
        reservedQuantity: formData.reservedQuantity,
        soldQuantity: formData.soldQuantity,
        listingType: 'community',
        maxQuantityPerUserPer24h: 2,
        deliveryMode: 'pickup',
        allowInPersonCollection: true,
        requiresDelivery: false,
        coordinates: formData.coordinates,
        locationData: formData.locationData,
        sellerType: 'community',
        isBusinessProduct: false,
        sellerProfileImage: sellerAvatar,
        sellerAvatar,
        avatarUrl: sellerAvatar,
        sellerProfile: {
          ...(editingItem.sellerProfile || {}),
          id: String(editingItem.sellerProfile?.id || editingItem.sellerId || user?.userId || user?.mobile || 'guest-owner'),
          name: editingItem.sellerProfile?.name || editingItem.sellerName || user?.name || 'You',
          initials: editingItem.sellerProfile?.initials || editingItem.sellerInitials || user?.initials || 'DU',
          avatarUrl: editingItem.sellerProfile?.avatarUrl || sellerAvatar,
          accountType: 'community',
        },
        updatedAt: new Date().toISOString(),
      };
      if (!isProductionRuntime) {
        setItems((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
        setFavorites((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
      }
      try {
        const saved = await updateListingInBackend(updatedItem.serverId || updatedItem.id, updatedItem);
        console.log('[listing-submit] API response', saved);
        Object.assign(updatedItem, saved);
        setItems((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
        setFavorites((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
        setNotice('Your listing has been updated live.');
      } catch (err) {
        console.error('[listing-submit] submit failed reason', err);
        setNotice(isProductionRuntime ? 'Live listings are temporarily unavailable' : 'Updated locally. Live sync failed.');
        if (!isProductionRuntime) {
          setItems((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
          setFavorites((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
        }
      }
      if (!isProductionRuntime) upsertLiveListing(updatedItem);
      setSelectedItem(updatedItem);
      setEditingItem(null);
      setShowListingSheet(false);
      return true;
    }
    const sellerAvatar = user?.profileImage || '';
    const newItem = {
      id: Date.now(),
      title: formData.title,
      category: formData.category,
      condition: formData.condition,
      description: formData.description,
      location: formData.pickupArea,
      distance: '0.4 km',
      sellerName: user?.name || 'You',
      sellerId: user?.userId || user?.mobile || 'guest-owner',
      sellerKarma: user?.karma || 0,
      sellerProfileImage: sellerAvatar,
      sellerAvatar,
      avatarUrl: sellerAvatar,
      sellerProfile: {
        id: String(user?.userId || user?.mobile || 'guest-owner'),
        name: user?.name || 'You',
        initials: user?.initials || 'DU',
        avatarUrl: sellerAvatar,
        accountType: 'community',
      },
      ownerMobile: user?.mobile || 'guest-owner',
      isOwn: true,
      image: formData.image || 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
      status: 'Available',
      validTill: formData.validTill,
      expiryDate: formData.expiryDate,
      expiryTime: formData.expiryTime,
      totalQuantity: formData.totalQuantity,
      availableQuantity: formData.totalQuantity,
      reservedQuantity: 0,
      soldQuantity: 0,
      listingType: 'community',
      sellerType: 'community',
      isBusinessProduct: false,
      maxQuantityPerUserPer24h: 2,
      deliveryMode: 'pickup',
      allowInPersonCollection: true,
      requiresDelivery: false,
      coordinates: formData.coordinates,
      locationData: formData.locationData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const optimisticId = newItem.id;
    setItems((prev) => [newItem, ...prev.filter((item) => String(item.id) !== String(optimisticId))]);
    try {
      if (formData.photoFile) {
        const uploadedUrl = await uploadImage(formData.photoFile).catch(() => null);
        if (uploadedUrl) {
          newItem.image = uploadedUrl;
          newItem.imageUrl = uploadedUrl;
          newItem.photo_url = uploadedUrl;
        }
      }
      const saved = await saveListingToBackend(newItem);
      console.log('[listing-submit] API response', saved);
      Object.assign(newItem, saved);
      setItems((prev) => prev.map((item) => (item.id === optimisticId || item.id === saved.id ? newItem : item)));
    } catch (err) {
      console.error('[listing-submit] submit failed reason', err);
      setItems((prev) => prev.filter((item) => String(item.id) !== String(optimisticId)));
      if (isProductionRuntime) {
        setNotice('Listing could not be published live. Please retry.');
      } else {
        const fallbackItem = { ...newItem, serverPersisted: false };
        setItems((prev) => [fallbackItem, ...prev.filter((item) => String(item.id) !== String(fallbackItem.id))]);
        upsertLiveListing(fallbackItem);
        setNotice(isLoggedIn()
          ? 'Saved locally. Live sync failed.'
          : 'Saved on this device. Log in to make it visible to everyone.');
      }
      setTimeout(() => setNotice(''), 4000);
      if (!isProductionRuntime) {
        setUser((prev) => (prev ? {
          ...prev,
          listed: (Number(prev.listed) || 0) + 1,
          activeListings: (Number(prev.activeListings) || 0) + 1,
        } : prev));
        setShowListingSheet(false);
        setSelectedItem(null);
        setActiveView('home');
        setShowPostSuccessModal(true);
      }
      return true;
    }

    upsertLiveListing(newItem);
    setUser((prev) => (prev ? {
      ...prev,
      listed: (Number(prev.listed) || 0) + 1,
      activeListings: (Number(prev.activeListings) || 0) + 1,
    } : prev));
    setShowListingSheet(false);
    setSelectedItem(null);
    setActiveView('home');
    // Show success modal offering to add another listing
    setShowPostSuccessModal(true);
    return true;
  };

  const handleEditListing = (item) => {
    setSelectedItem(null);
    setEditingItem(item);
    setShowListingSheet(true);
  };

  const handleDeleteListing = (item) => {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setFavorites((prev) => prev.filter((entry) => entry.id !== item.id));
    // Remove locally and attempt server delete if possible
    removeLiveListing(item.id);
    deleteListingFromBackend(item.serverId || item.id).catch(() => {});
    setUser((prev) => (prev ? {
      ...prev,
      listed: Math.max(0, (Number(prev.listed) || 0) - 1),
      activeListings: Math.max(0, (Number(prev.activeListings) || 0) - ((item.status || 'Available') === 'Completed' ? 0 : 1)),
    } : prev));
    setSelectedItem(null);
    setEditingItem(null);
    setNotice('Your listing has been deleted.');
  };

  const handleBuyerUnlockComplete = async (paymentResult = {}) => {
    const verification = paymentResult?.verification || {};
    const buyerAccessExpiresAt = verification.buyerAccessExpiresAt || verification.accessExpiresAt || verification.buyer_access_expires_at || '';
    const buyerAccessActivatedAt = verification.buyerAccessActivatedAt || verification.activatedAt || verification.buyer_access_activated_at || new Date().toISOString();

    if (businessSession) {
      const nextBusinessSession = {
        ...businessSession,
        isBuyer: true,
        buyerAccessExpiresAt,
        buyerAccessActivatedAt,
      };
      setBusinessSession(nextBusinessSession);
      saveBusinessSession(nextBusinessSession);
      saveBusinessAccounts([
        nextBusinessSession,
        ...getBusinessAccounts().filter((account) => account.id !== nextBusinessSession.id),
      ]);
    } else {
      setUser((prev) => (prev ? {
        ...prev,
        isBuyer: true,
        buyerAccessExpiresAt,
        buyerAccessActivatedAt,
      } : prev));
    }

    setShowBuyerPaySheet(false);
    setNotice('Buyer access activated for 1 year.');

    const pendingRequest = buyerAccessPendingRequestRef.current;
    if (pendingRequest) {
      buyerAccessPendingRequestRef.current = null;
      buyerAccessBypassRef.current = true;
      try {
        await handleRequest(pendingRequest.itemId, pendingRequest.requestDetails);
      } finally {
        buyerAccessBypassRef.current = false;
      }
    }
  };

  const handleKarmaSubmit = async (note = '') => {
    const currentKarmaTarget = karmaTarget;
    if (karmaTarget?.type === 'business') {
      const accounts = getBusinessAccounts();
      const business = accounts.find((account) => account.id === karmaTarget.businessId);
      if (business) {
        const nextBusiness = { ...business, karma: Number(business.karma || 0) + 1 };
        saveBusinessAccounts([nextBusiness, ...accounts.filter((account) => account.id !== business.id)]);
        setItems((current) => current.map((item) => (
          item.businessId === business.id || item.sellerName === business.businessName
            ? { ...item, sellerKarma: Number(item.sellerKarma || business.karma || 0) + 1 }
            : item
        )));
      }
      saveBusinessOrders(getBusinessOrders().map((order) => (
        order.id === karmaTarget.orderId || order.orderId === karmaTarget.orderId
          ? { ...order, karmaGiven: true }
          : order
      )));
      completePendingKarmaAction(karmaTarget.pendingActionId || `business:${karmaTarget.orderId}`);
      localStorage.removeItem('zeromart-pending-business-karma');
      setShowKarmaPopup(false);
      setKarmaTarget(null);
      setNotice('Good karma sent to the store.');
      safeEmitNotificationEvent({
        eventType: 'karma_received',
        recipientAccountId: currentKarmaTarget?.businessId,
        actorAccountId: activeAccountId,
        orderId: currentKarmaTarget?.orderId,
        title: 'Store received Good Karma',
        body: `${activeBuyer?.name || 'A buyer'} sent Good Karma to your store.`,
        dedupeKey: `karma_received:business:${currentKarmaTarget?.orderId}:${activeAccountId}`,
      });
      window.dispatchEvent(new Event('storage'));
      return;
    }
    if (karmaTarget?.sellerId) {
      setKarmaSubmitting(true);
      setKarmaError('');
      try {
        const result = await awardCommunityKarma({
          sellerId: karmaTarget.sellerId,
          buyerId: activeAccountId,
          buyerName: activeBuyer?.name || 'A buyer',
          requestId: karmaTarget.requestId,
          note,
        });
        if (result?.listings?.length) {
          const updatedListings = result.listings.map(normalizeProductStock);
          setItems((prev) => prev.map((item) => {
            const match = updatedListings.find((entry) => String(entry.id) === String(item.id));
            return match ? { ...item, ...match } : item;
          }));
        }
        invalidateListingCache();
        const latestListings = await syncListingsFromBackend({ force: true }).catch(() => null);
        if (Array.isArray(latestListings)) {
          setItems(normalizeListingsForMarketplace(latestListings));
        }
        saveRequests(getRequests().map((request) => (
          request.requestId === karmaTarget.requestId
            ? { ...request, status: 'completed', karmaGiven: true }
            : request
        )));
        completePendingKarmaAction(karmaTarget?.pendingActionId || `community:${karmaTarget?.requestId}`);
        setShowKarmaPopup(false);
        setKarmaTarget(null);
        setNotice(`Good karma sent to ${karmaTarget?.name || 'the seller'}.`);
      } catch (error) {
        setKarmaError(error?.message || 'Good Karma could not be submitted. Please retry.');
        setKarmaSubmitting(false);
        return;
      }
      setKarmaSubmitting(false);
      return;
    }
  };

  const finishCompletedHandoff = (result, target) => {
    const quantity = Number(result.request?.quantity || 1);
    const pendingKarma = {
      ...(target.karmaRecipient || target),
      id: `community:${target.requestId}`,
      pendingActionId: `community:${target.requestId}`,
      buyerId: result.request?.buyerId,
      sellerId: result.request?.sellerId,
      requestId: target.requestId,
      itemId: target.itemId,
      mandatory: true,
    };
    savePendingKarmaAction(pendingKarma);
    localStorage.setItem('zeromart-pending-community-karma', JSON.stringify(pendingKarma));
    if (accountKey(result.request?.buyerId) === accountKey(activeAccountId)) {
      setKarmaTarget(pendingKarma);
      setShowKarmaPopup(true);
    }
    setOrderHistory((prev) => prev.map((order) => (
      order.orderId === target.requestId ? { ...order, status: 'Collected personally' } : order
    )));
    commitNotifications((prev) => prev.map((entry) => (
      entry.requestId === target.requestId
        ? {
            ...entry,
            requestStatus: 'completed',
            body: entry.type === 'request'
              ? `${result.request?.buyerName || 'The buyer'} collected ${result.request?.productName || 'the item'}. Status: Collected.`
              : `You collected ${result.request?.productName || 'the item'}. Good Karma is ready to send.`,
          }
        : entry
    )));
    setItems((prev) => prev.map((item) => {
      if (item.id !== target.itemId) return item;
      const stock = normalizeProductStock(item);
      const availableQuantity = Math.max(0, stock.availableQuantity - quantity);
      return {
        ...stock,
        availableQuantity,
        reservedQuantity: Math.max(0, stock.reservedQuantity - quantity),
        soldQuantity: stock.soldQuantity + quantity,
        status: availableQuantity === 0 ? 'completed' : 'active',
      };
    }));
    setNotice(
      accountKey(result.request?.buyerId) === accountKey(activeAccountId)
        ? 'Exchange complete. Send mandatory good karma to the seller.'
        : 'Handover complete. The buyer will be asked to send good karma.'
    );
    safeEmitNotificationEvent({
      eventType: 'karma_required',
      recipientAccountId: result.request?.buyerId,
      actorAccountId: result.request?.sellerId,
      requestId: target.requestId,
      listingId: target.itemId,
      title: 'Good Karma required',
      body: `Collection complete for ${result.request?.productName || 'your item'}. Please send Good Karma to the seller.`,
      dedupeKey: `karma_required:${target.requestId}`,
    });
    window.dispatchEvent(new CustomEvent('zeromart-karma-pending'));
  };

  const handleMarkCollected = (notification) => {
    const pendingRequest = getRequests().find((request) => request.requestId === notification.requestId);
    if (pendingRequest) {
      saveRequests(getRequests().map((request) => (
        request.requestId === notification.requestId && request.status === 'accepted'
          ? { ...request, sellerGave: true }
          : request
      )));
    }
    const result = confirmHandoff(notification.requestId, 'buyer');
    if (result.alreadyCompleted) {
      setNotice('This collection is already completed.');
      return;
    }
    if (!result.completed) {
      setOrderHistory((prev) => prev.map((order) => (
        order.orderId === notification.requestId ? { ...order, status: 'Collected confirmed · waiting for seller' } : order
      )));
      setNotice('Your collection is confirmed. Waiting for the seller to mark the item as handed over.');
      setSelectedNotification(null);
      return;
    }
    const item = items.find((entry) => entry.id === notification.itemId);
    finishCompletedHandoff(result, {
      requestId: notification.requestId,
      itemId: notification.itemId,
      karmaRecipient: {
        name: item?.sellerName || notification.sellerName,
        initials: (item?.sellerName || notification.sellerName || 'Seller').split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(),
        type: item?.isBusinessProduct ? 'business' : 'user',
        currentKarma: Number(item?.sellerKarma || 0),
      },
    });
    setSelectedNotification(null);
  };

  const handleSellerHandover = (notification) => {
    markRequestHandover(notification.requestId, { actorAccountId: activeAccountId })
      .then((result) => {
        const pendingAction = result?.pendingAction || null;
        if (pendingAction) savePendingKarmaAction(pendingAction);
        saveRequests(getRequests().map((request) => (
          request.requestId === notification.requestId
            ? { ...request, status: 'karma_pending', sellerGave: true }
            : request
        )));
        commitNotifications((current) => current.map((entry) => (
          entry.requestId === notification.requestId
            ? {
                ...entry,
                sellerGave: true,
                requestStatus: 'karma_pending',
                body: `You handed over ${notification.productName || 'the item'}. Good Karma is now required from ${notification.buyerName || 'the buyer'}.`,
              }
            : entry
        )));
        setNotice(result?.code === 'HANDOVER_ALREADY_RECORDED'
          ? 'This handover was already recorded.'
          : 'Handover confirmed. The buyer must now send mandatory Good Karma.');
        setSelectedNotification(null);
      })
      .catch((error) => {
        setNotice(error?.message || 'Could not record handover right now.');
      });
  };

  const handleNotificationOpen = (notification) => {
    setNotifications((prev) => prev.map((entry) => (entry.id === notification.id ? { ...entry, read: true } : entry)));
    const openPathFromPayload = typeof notification?.payload?.openPath === 'string'
      ? notification.payload.openPath
      : '';
    const [, openPathQuery = ''] = String(openPathFromPayload || '').split('?');
    const actionFromPath = String(new URLSearchParams(openPathQuery || '').get('action') || '').toLowerCase();
    const itemIdFromPayload = notification.itemId || notification.listingId || notification.payload?.listingId;
    const requestIdFromPayload = notification.requestId || notification.payload?.requestId;
    const orderIdFromPayload = notification.orderId || notification.payload?.orderId;
    let targetItem = null;

    if (itemIdFromPayload) {
      targetItem = items.find((item) => String(item.id) === String(itemIdFromPayload));
    }
    if (!targetItem && requestIdFromPayload) {
      const request = getRequests().find((entry) => String(entry.requestId) === String(requestIdFromPayload));
      if (request?.productId) {
        targetItem = items.find((item) => String(item.id) === String(request.productId));
      }
    }
    if (!targetItem && orderIdFromPayload) {
      const reservation = getReservations().find((entry) => String(entry.orderId || entry.id) === String(orderIdFromPayload));
      if (reservation?.productId) {
        targetItem = items.find((item) => String(item.id) === String(reservation.productId));
      }
    }

    if (['request', 'requestAccepted', 'requestDeclined', 'businessOrderUpdate', 'businessOrderReceived', 'karma_required', 'karma_received', 'nearby_listing'].includes(notification.type) && targetItem) {
      if (targetItem) {
        setSelectedItem(targetItem);
        if ((actionFromPath === 'request' && !targetItem.isBusinessProduct) || (actionFromPath === 'reserve' && targetItem.isBusinessProduct)) {
          const requestState = getProductRequestState(targetItem, activeAccountId, requestClock);
          if (requestState.canRequest) setQuantityItem(targetItem);
        }
        setSelectedNotification(notification);
        return;
      }
    }
    if (notification.type === 'product' && notification.itemId) {
      const targetItem = items.find((item) => item.id === notification.itemId);
      if (targetItem) {
        setSelectedItem(targetItem);
        setSelectedNotification(null);
        return;
      }
    }
    if (notification.type === 'seller' && notification.sellerName) {
      const targetItem = items.find((item) => item.sellerName === notification.sellerName);
      if (targetItem) {
        setSelectedItem(targetItem);
        setSelectedNotification(null);
        return;
      }
    }
    if (notification.type === 'favorite' && notification.itemId) {
      const targetFavorite = favorites.find((item) => item.id === notification.itemId);
      if (targetFavorite) {
        setSelectedItem(targetFavorite);
        setSelectedNotification(null);
        return;
      }
    }
    if (openPathFromPayload && openPathFromPayload.startsWith('/')) {
      navigate(openPathFromPayload);
      return;
    }
    setSelectedNotification(notification);
  };

  const selectedItemData = useMemo(() => {
    const item = items.find((entry) => entry.id === selectedItem?.id) ?? selectedItem;
    if (!item) return null;
    const coordinates = getItemCoordinates(item);
    const distanceKm = coordinates && currentCoordinates ? haversineKm(currentCoordinates, coordinates) : item.distanceKm ?? null;
    const baseRequestState = getProductRequestState(item, activeAccountId, requestClock);
    const hasActiveRequest = Boolean(activeAccountId) && getRequests().some((request) => (
      String(request.productId) === String(item.id)
      && accountKey(request.buyerId) === accountKey(activeAccountId)
      && isRequestActiveForLock(request)
    ));
    const requestState = hasActiveRequest
      ? {
          ...baseRequestState,
          canRequest: false,
          buttonLabel: 'Request in progress',
          stockLabel: baseRequestState.soldOut ? baseRequestState.stockLabel : 'Request in progress',
        }
      : baseRequestState;
    return {
      ...item,
      distanceKm,
      distance: distanceKm === null ? item.distance : formatDistance(distanceKm),
      requestState,
    };
  }, [activeAccountId, currentCoordinates, items, requestClock, selectedItem]);
  const visibleNotifications = useMemo(() => {
    const requestsById = new Map(getRequests().map((request) => [request.requestId, request]));
    return notifications.filter((notification) => (
      !notification.recipientId || accountKey(notification.recipientId) === accountKey(activeAccountId)
    )).map((notification) => {
      if (notification.type !== 'request' || !notification.requestId) return notification;
      const request = requestsById.get(notification.requestId);
      if (!request || request.status === notification.requestStatus) return notification;
      if (['accepted', 'awaiting_collection', 'confirmed'].includes(request.status)) {
        return {
          ...notification,
          requestStatus: 'awaiting_collection',
          sellerGave: Boolean(request.sellerGave),
          buyerCollected: Boolean(request.buyerCollected),
          body: request.sellerGave
            ? `You handed over ${request.productName}. Waiting for ${request.buyerName} to confirm collection.`
            : `Awaiting collection from ${request.buyerName}. Collection details were sent to the buyer.`,
        };
      }
      if (['handed_over', 'karma_pending'].includes(request.status)) {
        return {
          ...notification,
          requestStatus: 'karma_pending',
          sellerGave: true,
          body: `You handed over ${request.productName}. Good Karma is now required from ${request.buyerName}.`,
        };
      }
      if (request.status === 'completed') {
        return {
          ...notification,
          requestStatus: 'completed',
          body: `${request.buyerName} collected ${request.productName}. Status: Collected.`,
        };
      }
      return { ...notification, requestStatus: request.status };
    });
  }, [activeAccountId, notifications]);
  const visibleOrderHistory = useMemo(() => (
    activeAccountId
      ? orderHistory.filter((order) => !order.buyerId || accountKey(order.buyerId) === accountKey(activeAccountId))
      : []
  ), [activeAccountId, orderHistory]);
  const unreadNotificationCount = useMemo(
    () => visibleNotifications.filter((notification) => !notification.read).length,
    [visibleNotifications],
  );
  const receivedOrders = useMemo(() => (
    getRequests()
      .filter((request) => accountKey(request.sellerId) === accountKey(activeAccountId))
      .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
  ), [activeAccountId, notifications]);
  const filterOptions = useMemo(() => {
    const searchableCatalog = items;
    const categories = ['All', ...new Set(searchableCatalog.map((item) => item.category).filter(Boolean))];
    const conditions = ['All', ...new Set(searchableCatalog.map((item) => item.condition).filter(Boolean))];
    return { categories, conditions };
  }, [items]);
  const hasActiveSearch = Boolean(searchQuery || categoryFilter !== 'All' || conditionFilter !== 'All');
  const rankedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const activeLocation = debouncedCoordinates;
    const catalogItems = hasActiveSearch
      ? items
      : items;
    return catalogItems.map(normalizeProductStock).filter(isMarketplaceVisible).map((item) => {
      const itemCoordinates = getItemCoordinates(item);
      const distanceFromActive = activeLocation && itemCoordinates ? haversineKm(activeLocation, itemCoordinates) : null;
      const baseRequestState = getProductRequestState(item, activeAccountId, requestClock);
      const hasActiveRequest = Boolean(activeAccountId) && getRequests().some((request) => (
        String(request.productId) === String(item.id)
        && accountKey(request.buyerId) === accountKey(activeAccountId)
        && isRequestActiveForLock(request)
      ));
      const requestState = hasActiveRequest
        ? {
            ...baseRequestState,
            canRequest: false,
            buttonLabel: 'Request in progress',
            stockLabel: baseRequestState.soldOut ? baseRequestState.stockLabel : 'Request in progress',
          }
        : baseRequestState;
      const expiryBadge = getExpiryBadgeState(item, requestClock);
      const nearExpiry = expiryBadge.nearExpiry
        && Number(requestState?.requestableStock ?? item.availableQuantity ?? 0) > 0;
      const requestableStock = Number(requestState?.requestableStock ?? item.availableQuantity ?? 0);
      const isSoldOut = requestableStock <= 0 || String(item.status || '').toLowerCase().includes('sold');
      return {
        ...item,
        distanceKm: distanceFromActive,
        distance: distanceFromActive === null ? item.distance : formatDistance(distanceFromActive),
        requestState,
        isSoldOut,
        expiryBadge,
        nearExpiry,
        rescueBadge: nearExpiry ? expiryBadge.rescueLabel : '',
        hoursRemaining: expiryBadge.hoursRemaining,
      };
    }).filter((item) => {
      const searchableText = [
        platformSearchKeywords,
        item.brand,
        item.title,
        item.category,
        item.condition,
        item.description,
        item.location,
        item.sellerName,
        item.status,
        item.locationData?.country,
        item.locationData?.state,
        item.locationData?.district,
        item.locationData?.city,
        item.locationData?.area,
        item.locationData?.street,
        item.locationData?.postalCode,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesQuery = !query || searchableText.includes(query);
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const matchesCondition = conditionFilter === 'All' || item.condition === conditionFilter;
      return matchesQuery && matchesCategory && matchesCondition;
    }).sort((first, second) => {
      if (first.isSoldOut !== second.isSoldOut) return first.isSoldOut ? 1 : -1;
      const firstDistance = first.distanceKm ?? Number.POSITIVE_INFINITY;
      const secondDistance = second.distanceKm ?? Number.POSITIVE_INFINITY;
      if (firstDistance !== secondDistance) return firstDistance - secondDistance;
      if ((second.sellerKarma || 0) !== (first.sellerKarma || 0)) return (second.sellerKarma || 0) - (first.sellerKarma || 0);
      const firstAvailable = Number(first.requestState?.requestableStock ?? first.availableQuantity ?? 0);
      const secondAvailable = Number(second.requestState?.requestableStock ?? second.availableQuantity ?? 0);
      if (secondAvailable !== firstAvailable) return secondAvailable - firstAvailable;
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });
  }, [activeAccountId, categoryFilter, conditionFilter, debouncedCoordinates, hasActiveSearch, items, radiusKm, requestClock, searchQuery]);

  const rescueItems = useMemo(() => rankedItems
    .filter((item) => item.nearExpiry)
    .map((item) => ({ ...item }))
    .sort((first, second) => (
      (first.hoursRemaining ?? Number.POSITIVE_INFINITY) - (second.hoursRemaining ?? Number.POSITIVE_INFINITY)
      || (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity)
      || (second.sellerKarma || 0) - (first.sellerKarma || 0)
    ))
    .slice(0, 10), [rankedItems, requestClock]);
  const rescueIds = useMemo(() => new Set(rescueItems.map((item) => String(item.id))), [rescueItems]);
  // Include rescue items in the main feed as well; they will also appear in the Rescue section
  const communityRankedItems = useMemo(
    () => rankedItems.filter((item) => !item.isBusinessProduct),
    [rankedItems]
  );

  useEffect(() => {
    if (radiusKm !== 'all' || communityRankedItems.length === 0) return;
    const activeRadius = DISCOVERY_STAGES[discoveryStageIndex]?.radiusKm ?? Number.POSITIVE_INFINITY;
    if (communityRankedItems.some((item) => item.distanceKm === null || item.distanceKm <= activeRadius)) return;
    const firstStageWithProducts = DISCOVERY_STAGES.findIndex((stage) => (
      communityRankedItems.some((item) => item.distanceKm === null || item.distanceKm <= stage.radiusKm)
    ));
    if (firstStageWithProducts > discoveryStageIndex) setDiscoveryStageIndex(firstStageWithProducts);
  }, [communityRankedItems, discoveryStageIndex, radiusKm]);

  const activeDiscoveryStage = DISCOVERY_STAGES[discoveryStageIndex] || DISCOVERY_STAGES.at(-1);
  const activeFeedRadius = radiusKm === 'all' ? activeDiscoveryStage.radiusKm : Number(radiusKm);
  const filteredItems = useMemo(() => rankedItems, [rankedItems]);
  const communityFeedItems = useMemo(() => communityRankedItems, [communityRankedItems]);
  const hasMoreDiscoveryItems = radiusKm === 'all'
    && discoveryStageIndex < DISCOVERY_STAGES.length - 1
    && communityFeedItems.length < communityRankedItems.length;
  const businessDealsNearby = rankedItems
    .filter((item) => item.isBusinessProduct)
    .sort((first, second) => (
      (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity)
      || (second.sellerKarma || 0) - (first.sellerKarma || 0)
      || Number(second.requestState?.requestableStock ?? second.availableQuantity ?? 0)
        - Number(first.requestState?.requestableStock ?? first.availableQuantity ?? 0)
      || (getExpiryTimestamp(first) ?? Infinity) - (getExpiryTimestamp(second) ?? Infinity)
    ))
    .slice(0, 10);
  const leaderboardScopes = useMemo(() => {
    const geographicScopes = getLocationScopes(locationEngine.location)
      .filter((entry) => ['city'].includes(entry.scope));
    return [
      { scope: 'near1', label: 'Within 1 km' },
      { scope: 'near5', label: 'Within 5 km' },
      ...geographicScopes,
    ];
  }, [locationEngine.location?.updatedAt]);
  useEffect(() => {
    if (leaderboardScopes.length && !leaderboardScopes.some((entry) => entry.scope === leaderboardScope)) {
      setLeaderboardScope(leaderboardScopes[0].scope);
    }
  }, [leaderboardScope, leaderboardScopes]);
  const leaderboardLocation = leaderboardScope === 'near1'
    ? '1 km'
    : leaderboardScope === 'near5'
      ? '5 km'
      : getLocationScopeValue(locationEngine.location, leaderboardScope) || locationLabel;
  const leaderboardTitle = leaderboardScope.startsWith('near')
    ? `Top Good Karma within ${leaderboardLocation}`
    : `Top Good Karma in ${leaderboardLocation}`;
  const karmaLeaderboard = useMemo(() => {
    const localCoordinates = debouncedCoordinates;
    const activeScopeValue = leaderboardScope.startsWith('near')
      ? ''
      : getLocationScopeValue(locationEngine.location, leaderboardScope).toLowerCase();
    const fallbackRadius = {
      near1: 1,
      near5: 5,
      area: radiusKm === 'all' ? 25 : Number(radiusKm),
      city: 35,
      district: 100,
      state: 500,
      country: Number.POSITIVE_INFINITY,
    }[leaderboardScope];
    const leaderboardItems = items.filter((item) => {
      if (leaderboardScope === 'near1' || leaderboardScope === 'near5') {
        if (!localCoordinates) return false;
        const itemCoordinates = getItemCoordinates(item);
        const distanceKm = itemCoordinates ? haversineKm(localCoordinates, itemCoordinates) : null;
        return distanceKm !== null && distanceKm <= fallbackRadius;
      }
      if (!activeScopeValue) return true;
      const itemScopeValue = getLocationScopeValue(item.locationData, leaderboardScope).toLowerCase();
      if (itemScopeValue) return itemScopeValue === activeScopeValue;
      if (leaderboardScope === 'area' && String(item.location || '').toLowerCase() === activeScopeValue) return true;
      if (!localCoordinates) return false;
      const itemCoordinates = getItemCoordinates(item);
      const distanceKm = itemCoordinates ? haversineKm(localCoordinates, itemCoordinates) : null;
      return distanceKm !== null && distanceKm <= fallbackRadius;
    });
    const profileMap = new Map();
    leaderboardItems.forEach((item) => {
      const name = item.sellerName || item.brand || 'Drizn giver';
      const sellerId = String(item.sellerProfile?.id || item.sellerId || item.businessId || '').trim();
      const sellerKey = sellerId || `name:${name.toLowerCase()}`;
      const itemCoordinates = getItemCoordinates(item);
      const itemDistanceKm = localCoordinates && itemCoordinates
        ? haversineKm(localCoordinates, itemCoordinates)
        : Number.POSITIVE_INFINITY;
      const existing = profileMap.get(sellerKey) || {
        name,
        sellerId,
        initials: item.sellerInitials || item.sellerProfile?.initials || name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        karma: 0,
        listings: 0,
        completed: 0,
        distanceKm: Number.POSITIVE_INFINITY,
        location: item.location,
        area: item.sellerProfile?.area || item.area || '',
        city: item.sellerProfile?.city || item.city || '',
        accountType: item.sellerProfile?.accountType || item.sellerType || (item.isBusinessProduct ? 'business' : 'community'),
        joinedAt: item.sellerProfile?.joinedAt || '',
        bio: item.sellerProfile?.bio || '',
        verified: Boolean(item.sellerProfile?.verified || item.sellerType === 'business' || item.isBusinessProduct),
        image: item.sellerProfile?.avatarUrl || item.sellerProfileImage || item.avatarUrl || (user?.name === name ? user.profileImage : ''),
      };
      profileMap.set(sellerKey, {
        ...existing,
        sellerId: existing.sellerId || sellerId,
        initials: existing.initials || item.sellerInitials || item.sellerProfile?.initials || '',
        karma: Math.max(existing.karma, item.sellerKarma || 0),
        listings: existing.listings + 1,
        completed: existing.completed + Number(item.completedCount || item.soldQuantity || 0),
        distanceKm: Math.min(existing.distanceKm, itemDistanceKm ?? Number.POSITIVE_INFINITY),
        location: existing.location || item.location,
        area: existing.area || item.sellerProfile?.area || item.area || '',
        city: existing.city || item.sellerProfile?.city || item.city || '',
        accountType: existing.accountType || item.sellerProfile?.accountType || item.sellerType || (item.isBusinessProduct ? 'business' : 'community'),
        joinedAt: existing.joinedAt || item.sellerProfile?.joinedAt || '',
        bio: existing.bio || item.sellerProfile?.bio || '',
        verified: existing.verified || Boolean(item.sellerProfile?.verified || item.sellerType === 'business' || item.isBusinessProduct),
        image: existing.image || item.sellerProfile?.avatarUrl || item.sellerProfileImage || item.avatarUrl || (user?.name === name ? user.profileImage : ''),
      });
    });
    if (user) {
      const userScopeValue = getLocationScopeValue(user.location, leaderboardScope).toLowerCase();
      const userCoordinates = user.location
        ? { latitude: user.location.latitude, longitude: user.location.longitude }
        : null;
      const userDistanceKm = localCoordinates && userCoordinates
        ? haversineKm(localCoordinates, userCoordinates)
        : null;
      const userIsLocal = leaderboardScope.startsWith('near')
        ? userDistanceKm !== null && userDistanceKm <= fallbackRadius
        : !activeScopeValue
          || (userScopeValue && userScopeValue === activeScopeValue)
          || (userDistanceKm !== null && userDistanceKm <= fallbackRadius);
      if (!userIsLocal) {
        return [...profileMap.values()].sort((a, b) => (
          b.karma - a.karma
          || a.distanceKm - b.distanceKm
          || b.completed - a.completed
        )).slice(0, 5);
      }
      const userSellerId = accountKey(user.userId || user.id || user.mobile);
      const userKey = userSellerId || `name:${String(user.name || '').toLowerCase()}`;
      const existing = profileMap.get(userKey) || {
        sellerId: String(user.userId || user.id || ''),
        name: user.name, karma: 0, listings: 0, completed: 0,
        initials: user.initials || user.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'DU',
        distanceKm: userDistanceKm ?? Number.POSITIVE_INFINITY,
        location: locationLabel, image: user.profileImage,
      };
      profileMap.set(userKey, {
        ...existing,
        karma: Math.max(existing.karma, user.karma || 0),
        location: existing.location || locationLabel,
        image: user.profileImage || existing.image,
      });
    }
    return [...profileMap.values()].sort((a, b) => (
      b.karma - a.karma
      || a.distanceKm - b.distanceKm
      || b.completed - a.completed
    )).slice(0, 5);
  }, [debouncedCoordinates, items, leaderboardScope, locationEngine.location, locationLabel, radiusKm, user]);
  const selectedPublicProfileItems = useMemo(() => {
    if (!selectedPublicProfile) return [];
    const selectedSellerId = String(selectedPublicProfile.sellerId || '').trim();
    return items.filter((item) => {
      const itemSellerId = String(item.sellerProfile?.id || item.sellerId || item.businessId || '').trim();
      if (selectedSellerId && itemSellerId) return itemSellerId === selectedSellerId;
      return (item.sellerName || item.brand) === selectedPublicProfile.name;
    });
  }, [items, selectedPublicProfile]);
  const openPublicSellerProfile = (item) => {
    if (!item) return;
    const sellerProfile = item.sellerProfile || {};
    const sellerId = String(sellerProfile.id || item.sellerId || item.businessId || '').trim();
    const name = sellerProfile.name
      || item.sellerName
      || item.storeName
      || item.brand
      || item.sellerInitials
      || 'Drizn User';
    const initials = (sellerProfile.initials || item.sellerInitials || name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'DU').slice(0, 2).toUpperCase();
    const image = sellerProfile.logoUrl
      || sellerProfile.avatarUrl
      || item.sellerProfileImage
      || item.sellerAvatar
      || item.avatarUrl
      || (isOwnedByActiveAccount(item) ? user?.profileImage || '' : '')
      || buildFallbackAvatarImage(name);
    const accountTypeRaw = String(sellerProfile.accountType || item.sellerType || (item.isBusinessProduct ? 'business' : 'community')).toLowerCase();
    const accountType = accountTypeRaw === 'business' || accountTypeRaw === 'store' ? 'business' : 'community';
    const listingCount = items.filter((entry) => {
      const entrySellerId = String(entry.sellerProfile?.id || entry.sellerId || entry.businessId || '').trim();
      if (sellerId && entrySellerId) return entrySellerId === sellerId;
      return (entry.sellerName || entry.brand) === name;
    }).length;
    const area = sellerProfile.area || item.area || item.locationData?.area || item.locationData?.locality || '';
    const city = sellerProfile.city || item.city || item.locationData?.city || '';
    setSelectedPublicProfile({
      sellerId,
      name,
      initials,
      image,
      logoUrl: sellerProfile.logoUrl || '',
      accountType,
      area,
      city,
      location: [area, city].filter(Boolean).join(', ') || item.location || 'Area unavailable',
      karma: Number(sellerProfile.karma ?? item.sellerKarma ?? 0) || 0,
      listings: Number(sellerProfile.activeListings || listingCount) || 0,
      joinedAt: sellerProfile.joinedAt || '',
      bio: String(sellerProfile.bio || '').trim(),
      verified: Boolean(sellerProfile.verified || accountType === 'business'),
    });
  };
  const hasActiveSession = Boolean(user || businessSession);
  const visibleNotice = hasActiveSession && /you are logged out/i.test(notice) ? '' : notice;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(124,58,237,0.14),_transparent_28%),linear-gradient(135deg,_#fffaf2_0%,_#f7f4ff_48%,_#f8fafc_100%)] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <aside className="hidden w-80 flex-col justify-between rounded-r-[2rem] border border-amber-100/80 bg-white/75 p-8 shadow-[0_20px_65px_rgba(15,23,42,0.08)] backdrop-blur lg:flex">
          <div>
            <div className="drizn-logo-card mb-6 max-w-[220px]">
              <img src="/assets/drizn-logo.png" alt="Drizn logo" className="drizn-logo-image h-[56px] max-w-full" />
            </div>
            <p className="text-sm font-semibold text-slate-950">Good Things. Nearby.</p>
            <nav className="mt-8 space-y-2">
              <div>
                <button
                  onClick={() => handleNav('home')}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    activeView === 'home'
                      ? 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/20'
                      : 'border border-amber-100 bg-white/70 text-slate-600 hover:-translate-y-0.5 hover:bg-amber-50'
                  }`}
                >
                  <Home size={18} />
                  <span>Home</span>
                </button>
              </div>
              {(businessSession ? [
                { key: 'profile', label: 'Profile', icon: User, action: () => navigate('/business/profile') },
                { key: 'business-dashboard', label: 'Dashboard', icon: Building2, action: () => navigate('/business/dashboard') },
                { key: 'favorites', label: 'Favorites', icon: Heart, action: () => handleNav('favorites') },
                { key: 'notifications', label: 'Alerts', icon: Bell, action: () => handleNav('notifications') },
              ] : [
                { key: 'profile', label: 'Profile', icon: User, action: () => (user ? handleNav('profile') : requireLogin('profile')) },
                { key: 'sell', label: 'List item', icon: Plus, action: handleOpenListing },
                { key: 'favorites', label: 'Favorites', icon: Heart, action: () => handleNav('favorites') },
                { key: 'notifications', label: 'Alerts', icon: Bell, action: () => handleNav('notifications') },
              ]).map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.key || (item.key === 'sell' && showListingSheet);
                return (
                  <button
                    key={item.key}
                    onClick={item.action}
                    className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/20'
                        : 'border border-amber-100 bg-white/70 text-slate-600 hover:-translate-y-0.5 hover:bg-amber-50'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.key === 'notifications' && unreadNotificationCount > 0 && (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-1 text-[10px] font-extrabold leading-none text-white shadow-sm">
                        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                      </span>
                    )}
                    {item.key === 'favorites' && favoriteBadgeCount > 0 && (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-1 text-[10px] font-extrabold leading-none text-white shadow-sm">
                        {favoriteBadgeCount > 99 ? '99+' : favoriteBadgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="mt-8 rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-5">
              <p className="text-sm font-semibold text-amber-800">Give what you do not need.</p>
              <p className="mt-2 text-sm text-slate-600">Browse public listings, then log in only when you want to request, list, or chat.</p>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-amber-100 bg-gradient-to-br from-amber-500 to-violet-600 p-5 text-white shadow-lg shadow-violet-500/20">
            <p className="text-sm font-semibold">Today’s mood</p>
            <p className="mt-2 text-sm text-white/85">“Someone nearby may be waiting for that extra chair, book, or lamp.”</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-4xl">
            <header className="community-hero relative z-50 mb-4 flex min-h-[330px] flex-col justify-between gap-5 overflow-visible rounded-[1.5rem] border border-white/70 px-4 py-5 shadow-[0_20px_55px_rgba(15,23,42,0.18)] sm:min-h-[300px] lg:min-h-[340px] lg:px-6 lg:py-6">
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.45rem]">
                <img src="/assets/zeromart-community-handoff-hero.jpg" alt="" className="community-hero-image h-full w-full object-cover object-[57%_center] sm:object-[54%_center] lg:object-center" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,30,22,0.9)_0%,rgba(5,30,22,0.72)_52%,rgba(5,30,22,0.48)_100%)] sm:bg-[linear-gradient(90deg,rgba(5,30,22,0.9)_0%,rgba(5,30,22,0.68)_42%,rgba(5,30,22,0.18)_76%,rgba(5,30,22,0.24)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-emerald-950/45 to-transparent" />
                <div className="community-hero-glow absolute -left-10 bottom-0 h-32 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
              </div>
              <div className="hero-float pointer-events-none absolute right-[8%] top-5 hidden h-11 w-11 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-xl text-white shadow-lg backdrop-blur-md sm:flex">✨</div>

              <div className="relative z-10 max-w-sm min-w-0 pt-1 lg:min-w-[230px]">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                  <Sparkles size={13} />
                  Community marketplace
                </div>
                <p className="text-3xl font-extrabold text-white drop-shadow-sm sm:text-4xl">Drizn</p>
                <p className="mt-1 text-lg font-bold text-white/95 drop-shadow-sm">Good Things. Nearby.</p>
                <p className="mt-2 max-w-xs text-sm font-medium leading-6 text-white/90">Everything on Drizn is FREE to collect. No hidden charges. Just people helping people reduce waste.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">₹0 community finds</span>
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">Local good karma</span>
                </div>
              </div>

              <div className={`relative z-20 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-white/25 bg-slate-950/20 p-2 shadow-lg backdrop-blur-xl ${hasActiveSession ? 'justify-start' : 'justify-end'}`}>
                <button onClick={locationEngine.openPicker} className="flex min-w-[210px] flex-1 items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-left text-sm font-semibold text-emerald-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white">
                  <MapPin size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-emerald-600">
                      {['gps', 'live-gps'].includes(locationEngine.location?.source) ? 'Current location' : 'Selected location'}
                    </span>
                    <span className="block truncate">{locationLabel}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.1em] text-emerald-600">Change</span>
                </button>
                {!['gps', 'live-gps'].includes(locationEngine.location?.source) && (
                  <button
                    type="button"
                    onClick={() => locationEngine.detectCurrentLocation().catch(() => locationEngine.openPicker())}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 py-3 text-xs font-extrabold text-emerald-800 shadow-sm transition hover:-translate-y-0.5"
                  >
                    <LocateFixed size={15} />
                    <span className="hidden sm:inline">Use my current location</span>
                  </button>
                )}
                {businessSession && (
                  <button
                    type="button"
                    onClick={() => navigate('/business/dashboard')}
                    className="inline-flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-white/95 px-3 py-2.5 text-left text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
                    aria-label={`Open ${businessSession.businessName} business dashboard`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                      <ShieldCheck size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-emerald-600">Business verified</span>
                      <span className="block max-w-32 truncate text-xs font-extrabold sm:max-w-44">{businessSession.businessName}</span>
                    </span>
                  </button>
                )}
                {user && (
                  <button className="hidden shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 lg:flex" onClick={handleOpenListing}>
                    <Plus size={14} />
                    <span>List item</span>
                  </button>
                )}
                {user && (
                  <button className="ml-auto flex h-[58px] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/80 bg-white/95 px-1.5 py-1 text-[10px] font-bold leading-none text-violet-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white lg:ml-0 lg:h-[42px] lg:w-[58px] lg:flex-row lg:rounded-xl" onClick={() => handleNav('profile')} aria-label="Open profile">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-50 lg:h-7 lg:w-7">
                      {user.profileImage ? (
                        <img
                          src={user.profileImage}
                          alt={user.name}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.src = buildFallbackAvatarImage(user.name || 'Profile');
                          }}
                        />
                      ) : (
                        user.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || <User size={18} />
                      )}
                    </span>
                    <span className="max-w-[58px] truncate lg:hidden">{user.name?.split(' ')[0] || 'Profile'}</span>
                  </button>
                )}
                {!user && !businessSession && (
                  <button className="flex min-w-[145px] flex-1 items-center justify-center rounded-xl bg-white px-3 py-2.5 text-center text-xs font-bold leading-5 text-violet-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 sm:min-w-[175px] sm:px-4 sm:text-sm" onClick={() => requireLogin('profile')}>
                    User Sign up / Login
                  </button>
                )}
                {!user && !businessSession && <span className="hidden shrink-0 text-xs font-extrabold uppercase tracking-[0.12em] text-white/80 sm:inline">or</span>}
                {!user && !businessSession && (
                  <button
                    className="inline-flex min-w-[165px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-center text-xs font-bold leading-5 text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white sm:min-w-[210px] sm:text-sm"
                    onClick={() => setShowBusinessAuth(true)}
                  >
                    <Building2 size={15} />
                    <span>Business Sign up / Login</span>
                  </button>
                )}
              </div>
            </header>

            {activeView === 'home' && rescueItems.length > 0 && (
              <div className="mb-4">
                <ProductRail
                  title="Rescue Near-Expiry Items"
                  eyebrow="Help reduce waste before these expire"
                  icon={Flame}
                  items={rescueItems}
                  actor={activeBuyer}
                  onSelectItem={setSelectedItem}
                  onBuyItem={handleBuyNow}
                  onEditItem={handleEditListing}
                  onOpenSellerProfile={openPublicSellerProfile}
                  onToggleFavorite={toggleFavorite}
                  favorites={favorites}
                  rescue
                />
              </div>
            )}

            {activeView === 'home' && (
              <section className="mb-4 rounded-[1.5rem] border border-amber-100/80 bg-white/85 p-3 shadow-[0_14px_45px_rgba(15,23,42,0.08)] backdrop-blur sm:p-4">
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-[1.25rem] border border-amber-200/80 bg-[linear-gradient(120deg,#fffbeb_0%,#ffffff_48%,#f5f3ff_100%)] p-3 shadow-[0_12px_34px_rgba(124,58,237,0.08)] sm:p-4">
                    <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-violet-200/35 blur-3xl" />
                    <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-40 rounded-full bg-amber-200/35 blur-3xl" />
                    <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/25">
                          <Trophy size={21} fill="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-extrabold text-slate-900">Top Good Karma Near You</p>
                          <p className="truncate text-xs text-slate-500">{leaderboardTitle} · ranked by distance, karma and completed shares</p>
                        </div>
                      </div>
                      <label className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-white/90 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm sm:max-w-56">
                        <MapPin size={13} />
                        <span className="sr-only">Leaderboard location level</span>
                        <select value={leaderboardScope} onChange={(event) => setLeaderboardScope(event.target.value)} className="min-w-0 max-w-44 bg-transparent font-bold text-emerald-700 outline-none">
                          {leaderboardScopes.map((entry) => (
                            <option key={entry.scope} value={entry.scope}>{entry.scope[0].toUpperCase() + entry.scope.slice(1)} · {entry.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {karmaLeaderboard.length === 0 ? (
                      <div className="relative mt-4 rounded-2xl border border-dashed border-amber-200 bg-white/75 p-5 text-center">
                        <p className="font-bold text-slate-800">No local karma leaders yet</p>
                        <p className="mt-1 text-xs text-slate-500">Be the first to list and save an item around {leaderboardLocation}.</p>
                      </div>
                    ) : (
                    <div className="relative mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
                      {karmaLeaderboard.map((profile, index) => {
                        const initials = profile.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
                        const rankStyle = index === 0
                          ? 'leader-winner min-w-[210px] border-cyan-300 bg-[linear-gradient(145deg,#ecfeff_0%,#ffffff_55%,#f5f3ff_100%)] shadow-[0_14px_32px_rgba(8,145,178,0.18)]'
                          : index === 1
                            ? 'min-w-[190px] border-amber-300 bg-[linear-gradient(145deg,#fff7d6,#ffffff_72%)]'
                            : index === 2
                              ? 'min-w-[190px] border-slate-300 bg-[linear-gradient(145deg,#f1f5f9,#ffffff_72%)]'
                              : 'min-w-[180px] border-orange-200 bg-[linear-gradient(145deg,#fff7ed,#ffffff_72%)]';
                        const rankBadge = index === 0
                          ? 'bg-gradient-to-br from-cyan-400 to-violet-600 text-white'
                          : index === 1
                            ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-white'
                            : index === 2
                              ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white'
                              : 'bg-gradient-to-br from-orange-300 to-orange-700 text-white';
                        const RankIcon = index === 0 ? Gem : index < 3 ? Medal : Award;
                        const rankLabel = index === 0 ? 'Diamond' : index === 1 ? 'Gold' : index === 2 ? 'Silver' : 'Bronze';
                        return (
                          <button key={profile.name} onClick={() => setSelectedPublicProfile(profile)} className={`relative snap-start overflow-hidden rounded-2xl border p-3.5 text-left transition duration-200 hover:-translate-y-1 hover:shadow-lg ${rankStyle}`}>
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] shadow-sm ${rankBadge}`}>
                                <RankIcon size={12} fill="currentColor" /> {rankLabel}
                              </span>
                              <span className="text-xs font-extrabold text-slate-400">#{index + 1}</span>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-br from-amber-100 to-violet-100 text-sm font-extrabold text-violet-700 shadow-md">
                                <img
                                  src={profile.image || buildFallbackAvatarImage(profile.name)}
                                  alt={profile.name}
                                  className="h-full w-full object-cover"
                                  onError={(event) => {
                                    event.currentTarget.src = buildFallbackAvatarImage(profile.name);
                                  }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-extrabold text-slate-900">{profile.name}</p>
                                <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={11} /> {profile.location}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Good Karma</p>
                                <p className="mt-0.5 text-lg font-extrabold text-amber-600">✨ {profile.karma}</p>
                              </div>
                              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">{profile.listings} listed</span>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-violet-500" style={{ width: `${Math.max(18, (profile.karma / Math.max(karmaLeaderboard[0]?.karma || 1, 1)) * 100)}%` }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  <form
                    className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setSearchQuery(searchInput.trim());
                    }}
                  >
                    <label className="relative min-w-0 flex-1">
                      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchInput}
                        onChange={(event) => {
                          setSearchInput(event.target.value);
                          setSearchQuery(event.target.value.trim());
                        }}
                        placeholder="Search anything on Drizn"
                        className="w-full rounded-[1rem] border-2 border-violet-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 shadow-[0_8px_24px_rgba(124,58,237,0.08)] outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      />
                    </label>
                    <button
                      type="submit"
                      onClick={() => setSearchQuery(searchInput.trim())}
                      className="relative z-10 w-full rounded-[1rem] bg-gradient-to-r from-amber-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/15 transition hover:brightness-105 active:scale-95 sm:w-auto"
                    >
                      Search
                    </button>
                  </form>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="flex items-center gap-2 rounded-[1rem] border border-amber-100 bg-amber-50/50 px-3 py-2 text-amber-800">
                      <SlidersHorizontal size={16} />
                      <span className="text-xs font-semibold">Filters</span>
                    </div>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-w-0 rounded-[1rem] border-2 border-amber-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400">
                      {filterOptions.categories.map((category) => (
                        <option key={category} value={category}>{category === 'All' ? 'All products' : category}</option>
                      ))}
                    </select>
                    <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} className="min-w-0 rounded-[1rem] border-2 border-amber-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400">
                      {filterOptions.conditions.map((condition) => (
                        <option key={condition} value={condition}>{condition === 'All' ? 'Any condition' : condition}</option>
                      ))}
                    </select>
                    <select value={radiusKm} onChange={(event) => setRadiusKm(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="min-w-0 rounded-[1rem] border-2 border-amber-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400" aria-label="Search radius">
                      <option value="all">All distances · nearest first</option>
                      {[1, 3, 5, 10, 25, 50].map((radius) => (
                        <option key={radius} value={radius}>Within {radius} km</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} near {locationLabel}
                    {radiusKm === 'all' ? ` · ${activeDiscoveryStage.label.toLowerCase()} · nearest first` : ` · within ${radiusKm} km`}
                  </span>
                  {hasActiveSearch && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchInput('');
                        setCategoryFilter('All');
                        setConditionFilter('All');
                      }}
                      className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                {hasActiveSearch && (
                  <div className="mt-4 rounded-[1.25rem] border border-violet-100 bg-gradient-to-r from-violet-50/80 to-amber-50/80 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">Search results</p>
                      <p className="text-xs font-semibold text-violet-700">{filteredItems.length} match{filteredItems.length === 1 ? '' : 'es'}</p>
                    </div>
                    {filteredItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/80 p-4 text-center text-sm text-slate-500">
                        No products matched this search. Try clearing one filter or increasing the radius.
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredItems.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/80 bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                              <p className="truncate text-xs text-slate-500">{item.category} · {item.location} · {item.distance}</p>
                              <p className="mt-1 text-xs font-bold text-amber-700">₹0</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {visibleNotice && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {visibleNotice}
              </div>
            )}

            {activeView === 'home' && (
              <HomePage
                user={activeBuyer}
                businessSession={businessSession}
                items={communityFeedItems}
                businessItems={businessDealsNearby}
                homeSection={homeSection}
                onSelectItem={setSelectedItem}
                onBuyItem={handleBuyNow}
                onRequest={handleRequest}
                onBack={handleBack}
                onLogin={() => requireLogin('profile')}
                onSelectSection={setHomeSection}
                onOpenSectionView={() => {
                  setSectionView(homeSection);
                  setActiveView('section');
                }}
                locationLabel={locationLabel}
                onToggleFavorite={toggleFavorite}
                favorites={favorites}
                onEditItem={handleEditListing}
                onOpenSellerProfile={openPublicSellerProfile}
                hasMoreItems={hasMoreDiscoveryItems}
                loadMoreLabel={DISCOVERY_STAGES[discoveryStageIndex + 1]?.label || ''}
                onLoadMore={() => setDiscoveryStageIndex((index) => Math.min(DISCOVERY_STAGES.length - 1, index + 1))}
              />
            )}
            {activeView === 'section' && (
              <SectionPage
                section={sectionView}
                businessItems={filteredItems.filter((item) => item.isBusinessProduct)}
                onBack={handleBack}
                locationLabel={locationLabel}
                radiusKm={radiusKm}
                onSelectItem={setSelectedItem}
                onBuyItem={handleBuyNow}
                onToggleFavorite={toggleFavorite}
                favorites={favorites}
                actor={activeBuyer}
                onEditItem={handleEditListing}
                onOpenSellerProfile={openPublicSellerProfile}
              />
            )}
            {activeView === 'favorites' && (
              <div className="space-y-3">
                <div className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-violet-600">Saved favorites</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">Your favorite listings</h2>
                  <p className="mt-2 text-sm text-slate-500">Items you save with the heart icon appear here with their photos.</p>
                </div>
                {favorites.length === 0 ? (
                  <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">No favorites yet. Tap the heart on a listing to save it.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {favorites.map((item) => (
                      <article
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelectedItem(item);
                        }}
                        className="cursor-pointer overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-100"
                      >
                        <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-36 w-full object-cover" />
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                              <p className="mt-1 text-sm text-slate-500">{item.condition} · {item.distance}</p>
                            </div>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(item);
                              }}
                              className="rounded-full border border-rose-100 bg-rose-50 p-2 text-rose-500"
                              aria-label="Remove from favorites"
                            >
                              <Heart size={15} fill="currentColor" />
                            </button>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-slate-500">{item.description || 'No description added.'}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedItem(item);
                              }}
                              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                            >
                              View item
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(item);
                              }}
                              className="rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeView === 'notifications' && (
              <NotificationsPage
                notifications={visibleNotifications}
                selectedNotification={selectedNotification}
                onOpenNotification={handleNotificationOpen}
                onCloseNotification={() => setSelectedNotification(null)}
                onRequestDecision={handleRequestDecision}
                onSellerHandover={handleSellerHandover}
                onMarkCollected={handleMarkCollected}
                onBack={handleBack}
              />
            )}
            {activeView === 'profile' && <ProfilePage user={user} items={items} orders={visibleOrderHistory} receivedOrders={receivedOrders} onLogin={() => requireLogin('profile')} onBack={handleBack} onLogout={handleLogout} onSelectItem={setSelectedItem} onUpdateUser={handleUpdateUser} />}
          </div>
        </main>
      </div>

      <nav className={`${showListingSheet ? 'hidden' : 'fixed'} inset-x-0 bottom-0 z-40 border-t border-amber-100 bg-white/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur lg:hidden`}>
        <div className="relative mx-auto grid h-[72px] max-w-[390px] grid-cols-[1fr_1fr_72px_1fr_1fr] items-center rounded-full bg-gradient-to-r from-amber-50 to-violet-50 px-2 py-1 shadow-[0_12px_38px_rgba(15,23,42,0.1)]">
          {(businessSession ? [
            navItems[0],
            navItems[1],
            null,
            navItems[2],
            { key: 'business-dashboard', label: 'Dashboard', icon: Building2 },
          ] : bottomNavItems).map((item) => {
            if (!item) return <div key="create-spacer" className="h-full min-w-0" aria-hidden="true" />;
            const Icon = item.icon;
            const isActive = activeView === item.key;
            const handleBottomNav = () => {
              if (item.key === 'business-dashboard') {
                navigate('/business/dashboard');
                return;
              }
              if (businessSession && item.key === 'profile') {
                navigate('/business/profile');
                return;
              }
              handleNav(item.key);
            };
            return (
              <button key={item.key} onClick={handleBottomNav} className={`relative mx-auto flex h-[58px] w-full max-w-[74px] min-w-0 flex-col items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none sm:text-[11px] ${isActive ? 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow' : 'text-slate-600'}`}>
                <span className="relative">
                  <Icon size={19} strokeWidth={2.2} />
                  {item.key === 'notifications' && unreadNotificationCount > 0 && (
                    <span className="absolute -right-3 -top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 py-1 text-[9px] font-extrabold leading-none text-white shadow ring-2 ring-white">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                  {item.key === 'favorites' && favoriteBadgeCount > 0 && (
                    <span className="absolute -right-3 -top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 py-1 text-[9px] font-extrabold leading-none text-white shadow ring-2 ring-white">
                      {favoriteBadgeCount > 99 ? '99+' : favoriteBadgeCount}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
          <button onClick={handleOpenListing} className="absolute left-1/2 top-0 z-50 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-600/25 ring-4 ring-white" aria-label="List item">
            <Plus size={23} strokeWidth={2.2} />
            <span className="mt-0.5 text-[9px] font-extrabold leading-none">List Item</span>
          </button>
        </div>
      </nav>

      {!showListingSheet && (
        <button onClick={() => setShowBotAssistant(true)} className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-600/25 lg:bottom-6 lg:right-6">
          <Bot size={22} />
        </button>
      )}

      {selectedItemData && (
        <ItemDetailsModal
          item={selectedItemData}
          onClose={() => setSelectedItem(null)}
          onRequest={handleRequest}
          onRequireLogin={() => requireLogin('request')}
          onRequireBuyerAccess={(itemId) => {
            buyerAccessPendingRequestRef.current = { itemId, requestDetails: null };
            setShowBuyerPaySheet(true);
          }}
          onEdit={handleEditListing}
          onDelete={handleDeleteListing}
          user={activeBuyer}
          onOpenSellerProfile={openPublicSellerProfile}
        />
      )}

      {selectedPublicProfile && (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-100 to-violet-100 text-lg font-bold text-violet-700">
                  <img
                    src={selectedPublicProfile.image || buildFallbackAvatarImage(selectedPublicProfile.name)}
                    alt={selectedPublicProfile.name}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = buildFallbackAvatarImage(selectedPublicProfile.name);
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-violet-600">Good karma profile</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900">{selectedPublicProfile.name}</h3>
                    {selectedPublicProfile.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                        <ShieldCheck size={11} /> Verified
                      </span>
                    )}
                  </div>
                  {(selectedPublicProfile.accountType || selectedPublicProfile.location) && (
                    <p className="text-sm text-slate-500">
                      {[selectedPublicProfile.accountType === 'business' ? 'Business account' : selectedPublicProfile.accountType ? 'Community account' : '', selectedPublicProfile.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedPublicProfile(null)} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
                Close
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-amber-50 p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{selectedPublicProfile.karma}</p>
                <p className="text-xs text-slate-500">Karma score</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3 text-center">
                <p className="text-xl font-bold text-violet-700">{selectedPublicProfile.listings}</p>
                <p className="text-xs text-slate-500">Active listings</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{formatJoinedDate(selectedPublicProfile.joinedAt) || '--'}</p>
                <p className="text-xs text-slate-500">Joined</p>
              </div>
            </div>
            {selectedPublicProfile.bio && (
              <div className="mt-5 rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-4">
                <p className="font-semibold text-slate-900">About {selectedPublicProfile.name}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedPublicProfile.bio}</p>
              </div>
            )}
            <div className="mt-5">
              <p className="mb-3 font-semibold text-slate-900">Listed products</p>
              {selectedPublicProfileItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-4 text-sm text-slate-500">
                  No active products visible right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPublicProfileItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedPublicProfile(null);
                        setSelectedItem(item);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-2 text-left transition hover:bg-violet-50"
                    >
                        <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="truncate text-xs text-slate-500">{item.category} · {item.condition} · {item.distance}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">₹0</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOtpModal && <OtpModal onClose={() => setShowOtpModal(false)} onVerify={handleLogin} />}
      <ListingSheet
        open={showListingSheet}
        initialItem={editingItem}
        onClose={() => {
          setShowListingSheet(false);
          setEditingItem(null);
        }}
        onSubmit={handleListingSubmit}
      />
      <BuyerPaySheet open={showBuyerPaySheet} onClose={() => setShowBuyerPaySheet(false)} onComplete={handleBuyerUnlockComplete} onAuthRequired={handleAuthExpired} />
      {quantityItem && (
        <QuantityRequestModal
          item={quantityItem}
          buyerId={activeAccountId}
          collectionSettings={quantityItem.isBusinessProduct ? getCollectionSettings(quantityItem.businessId) : null}
          onClose={() => setQuantityItem(null)}
          onConfirm={handleQuantityConfirm}
        />
      )}
      <OrderSuccessModal
        order={orderSuccess}
        onClose={() => setOrderSuccess(null)}
        onTrack={() => {
          setOrderSuccess(null);
          if (businessSession) navigate('/business/profile');
          else handleNav('profile');
        }}
      />
      <KarmaPopup
        open={showKarmaPopup}
        seller={karmaTarget}
        onSubmit={handleKarmaSubmit}
        onDismiss={() => {
          if (karmaTarget?.mandatory) return;
          setShowKarmaPopup(false);
          setKarmaTarget(null);
        }}
        mandatory={Boolean(karmaTarget?.mandatory)}
        submitting={karmaSubmitting}
        error={karmaError}
      />
      <BotAssistant
        open={showBotAssistant}
        onClose={() => setShowBotAssistant(false)}
        items={items}
        favorites={favorites}
        orders={orderHistory}
        notifications={visibleNotifications}
        locationLabel={locationLabel}
        user={user}
        onSelectItem={setSelectedItem}
      />

      <BusinessAuthModal
        open={showBusinessAuth}
        onClose={() => setShowBusinessAuth(false)}
        onSuccess={(account) => {
          localStorage.removeItem('zeromart-user');
          setUser(null);
          setBusinessSession(account);
          setShowBusinessAuth(false);
          requestPushAccessForAccount(account?.userId || account?.id || account?.mobile || account?.businessName || '');
          navigate('/business/dashboard');
        }}
      />
      {showPostSuccessModal && (
        <div className="sheet-center">
          <div className="glass-card" style={{ maxWidth: 420, padding: 20, textAlign: 'center' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Product listed successfully 🎉</h3>
            <p style={{ color: 'var(--zm-text-dim)', marginBottom: 16 }}>Your item is now live. Would you like to add another?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowPostSuccessModal(false); setShowListingSheet(true); }}>Add another</button>
              <button type="button" className="btn btn-primary" onClick={() => setShowPostSuccessModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      <OnboardingTour open={!hasSeenTour} onFinish={handleTourFinish} />
    </div>
  );
}
