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
  clearBusinessSession, createBusinessOrder, getBusinessAccounts, getBusinessMarketplaceItems,
  getBusinessOrders, getBusinessProducts, getBusinessPurchases, getBusinessSession,
  saveBusinessAccounts, saveBusinessOrders, saveBusinessProducts, saveBusinessPurchases,
  saveBusinessSession,
} from './lib/businessStore';
import { useLocationEngine } from './hooks/useLocationEngine';
import {
  formatDistance, formatShortAddress, getLocationScopes, getLocationScopeValue, haversineKm,
} from './services/locationService';
import {
  applyProductExpiry, createCollectionCode, getCollectionSettings, getExpiryTimestamp,
  getProductRequestState, getPurchaseHistory, getQuantityAllowance, isMarketplaceVisible, normalizeProductStock, recordPurchaseAttempt,
  savePurchaseHistory, saveRequests, getRequests, saveReservations, getReservations, createWhatsAppLink,
  updatePurchaseHistoryStatus, confirmHandoff, getTransactionProducts, saveTransactionProducts,
  completePendingKarmaAction, getPendingKarmaActions, savePendingKarmaAction,
  getLiveListings, saveLiveListings, upsertLiveListing, removeLiveListing, normalizeLiveListing,
} from './services/transactionService';

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

const platformSearchKeywords = 'zeromart zero mart karma good karma free 0 rs ₹0 rupees local business b2b marketplace listing list item seller buyer pickup delivery in person collect product item movie movies ticket tickets food electronics books cosmetics home furniture';

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
  return identifiers.some((value) => (
    value.startsWith('demo_')
    || value.startsWith('demo-')
    || value.startsWith('chennai-')
    || value.startsWith('business-product-demo-')
  ));
};

const fallbackMarketplaceListings = () => mergeListingsById(
  getTransactionProducts(),
  getBusinessMarketplaceItems(),
).map(normalizeLiveListing);

const stripFallbackDemoWhenLiveExists = (catalog) => {
  const normalized = catalog.filter(Boolean).map(normalizeLiveListing);
  const hasRealListings = normalized.some((item) => !isLegacyDemoRecord(item));
  return hasRealListings ? normalized.filter((item) => !isLegacyDemoRecord(item)) : normalized;
};

const loadMarketplaceItems = () => {
  const liveListings = getLiveListings();
  const fallbackListings = fallbackMarketplaceListings();
  const source = liveListings.length ? mergeListingsById(fallbackListings, liveListings) : fallbackListings;
  return applyProductExpiry(stripFallbackDemoWhenLiveExists(source).map(normalizeProductStock));
};

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

const createOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ZM-${date}-${suffix}`;
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
      : getHeaderLocationLabel(locationEngine.location, locationEngine.label)
  ));
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [conditionFilter, setConditionFilter] = useState('All');
  const [radiusKm, setRadiusKm] = useState('all');
  const [discoveryStageIndex, setDiscoveryStageIndex] = useState(0);
  const [leaderboardScope, setLeaderboardScope] = useState('area');
  const [currentCoordinates, setCurrentCoordinates] = useState(locationEngine.location);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [notice, setNotice] = useState('');
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
  const [showBotAssistant, setShowBotAssistant] = useState(false);
  const [showBusinessAuth, setShowBusinessAuth] = useState(false);
  const [karmaTarget, setKarmaTarget] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [notifications, setNotifications] = useState(loadNotifications);
  const skipTransactionPersistRef = useRef(false);
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
  } : null);
  const activeAccountId = activeBuyer?.userId || activeBuyer?.businessId || activeBuyer?.mobile || activeBuyer?.name || '';
  const commitNotifications = (updater) => {
    setNotifications((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      localStorage.setItem('zeromart-notifications', JSON.stringify(next));
      return next;
    });
  };
  const isOwnedByActiveAccount = (item) => Boolean(
    (user && (
      item?.isOwn
      || (user.userId && item?.sellerId === user.userId)
      || item?.ownerMobile === user.mobile
      || item?.sellerName === user.name
      || item?.sellerName === 'You'
    ))
    || (businessSession && item?.businessId === businessSession.id)
  );

  useEffect(() => {
    const timer = window.setInterval(() => setRequestClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('zeromart-user');
    if (savedUser && !getBusinessSession()) {
      setUser(JSON.parse(savedUser));
    }
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
      try {
        const unifiedPending = getPendingKarmaActions().find((entry) => (
          accountKey(entry.buyerId) === accountKey(activeAccountId)
        ));
        if (unifiedPending) {
          setKarmaTarget({
            ...unifiedPending,
            mandatory: true,
            initials: unifiedPending.initials || unifiedPending.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
          });
          setShowKarmaPopup(true);
          return;
        }
        const pendingCommunity = JSON.parse(localStorage.getItem('zeromart-pending-community-karma'));
        if (pendingCommunity && accountKey(pendingCommunity.buyerId) === accountKey(activeAccountId)) {
          setKarmaTarget({ ...pendingCommunity, type: 'user', mandatory: true });
          setShowKarmaPopup(true);
          return;
        }
        const pendingBusiness = JSON.parse(localStorage.getItem('zeromart-pending-business-karma'));
        const relatedOrder = pendingBusiness
          ? getBusinessOrders().find((order) => order.id === pendingBusiness.orderId || order.orderId === pendingBusiness.orderId)
          : null;
        const buyerId = pendingBusiness?.buyerId || relatedOrder?.buyerId || relatedOrder?.buyerMobile;
        if (pendingBusiness && buyerId && accountKey(buyerId) === accountKey(activeAccountId)) {
          setKarmaTarget({
            ...pendingBusiness,
            buyerId,
            type: 'business',
            mandatory: true,
            initials: pendingBusiness.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
          });
          setShowKarmaPopup(true);
        }
      } catch {
        // Invalid pending records should not block the buyer journey.
      }
    };
    showPendingBuyerKarma();
    window.addEventListener('storage', showPendingBuyerKarma);
    window.addEventListener('zeromart-karma-pending', showPendingBuyerKarma);
    return () => {
      window.removeEventListener('storage', showPendingBuyerKarma);
      window.removeEventListener('zeromart-karma-pending', showPendingBuyerKarma);
    };
  }, [activeAccountId]);

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
        : getHeaderLocationLabel(locationEngine.location, locationEngine.label)
    );
    setCurrentCoordinates(locationEngine.location);
  }, [locationEngine.label, locationEngine.location, locationEngine.status]);

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
    const request = getRequests().find((entry) => entry.requestId === requestId);
    if (!request) {
      setNotice('This collection request could not be found or is no longer available.');
      return;
    }
    if (!activeBuyer) {
      localStorage.setItem('zeromart-pending-request-route', requestId);
      setNotice('Log in as the seller to review this collection request.');
      setShowOtpModal(true);
      return;
    }
    if (String(request.sellerId) !== String(activeAccountId)) {
      setNotice('This request link belongs to the seller. Log in with the seller account to continue.');
      return;
    }
    const requestNotification = notifications.find((entry) => entry.requestId === requestId && entry.type === 'request');
    if (requestNotification) {
      localStorage.removeItem('zeromart-pending-request-route');
      setActiveView('notifications');
      setSelectedNotification(requestNotification);
    }
  }, [path, activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    const acceptedRequests = getRequests().filter((request) => (
      ['accepted', 'completed'].includes(request.status)
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
        const status = request.status === 'completed' ? 'completed' : 'accepted';
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

  const handleLogin = (mobile) => {
    const savedKarma = getKarmaLedger()[accountKey(mobile)];
    setUser({
      name: 'Unknown',
      mobile,
      karma: Number(savedKarma ?? 0),
      listed: 0,
      collected: 0,
      activeListings: 0,
      givenAway: 0,
      isBuyer: false,
      profileImage: '',
      location: locationEngine.location,
    });
    setShowOtpModal(false);
    setNotice('Welcome! You can list for free and buy anything for ₹0 with a one-time ₹29 platform fee for lifetime unlimited buying access.');
  };

  const handleNav = (view) => {
    if (view === 'home') {
      setActiveView('home');
      setSelectedNotification(null);
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
    setUser(null);
    setActiveView('home');
    setNotice('You are logged out. Sign up / Login to request items, list items, and keep your karma.');
  };

  const handleBack = () => {
    setActiveView('home');
    setSelectedItem(null);
    setNotice('');
  };

  const handleTourFinish = () => {
    setHasSeenTour(true);
  };

  const handleRequest = (itemId, requestDetails = null) => {
    const requestedItem = normalizeProductStock(items.find((item) => item.id === itemId) ?? selectedItem);
    const isOwnListing = isOwnedByActiveAccount(requestedItem);
    if (isOwnListing) {
      setNotice('This is your listing. You can edit or delete it, but you cannot purchase it.');
      return;
    }
    if (!activeBuyer) {
      setSelectedItem(items.find((item) => item.id === itemId) ?? null);
      requireLogin('request');
      return;
    }
    if (!activeBuyer.isBuyer) {
      setShowBuyerPaySheet(true);
      return;
    }
    if (!requestDetails?.quantity) {
      setQuantityItem(requestedItem);
      return;
    }
    const allowance = getQuantityAllowance(requestedItem, activeAccountId, requestDetails.quantity);
    if (allowance.allowedQuantity < 1) {
      setQuantityItem(requestedItem);
      return;
    }
    const quantity = allowance.allowedQuantity;
    const orderId = createOrderId();
    const requestUrl = `${window.location.origin}/request/${encodeURIComponent(orderId)}`;
    const createdAtIso = new Date().toISOString();
    const createdAt = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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
      buyerName: requestDetails?.buyerName || activeBuyer.name,
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
    setNotice('Request sent. Chat and contact sharing will unlock only after the seller accepts.');
    if (requestRecord.sellerPhone) {
      const sellerMessage = [
        'Hello,',
        '',
        `${historyEntry.buyerName} from ${requestRecord.buyerLocation} requested to collect your product:`,
        '',
        historyEntry.title,
        '',
        `Quantity: ${quantity}`,
        '',
        'Please confirm here:',
        requestUrl,
      ].join('\n');
      window.open(createWhatsAppLink(requestRecord.sellerPhone, sellerMessage), '_blank', 'noopener,noreferrer');
    }
  };

  const handleQuantityConfirm = ({ quantity, collectionWindow }) => {
    const requestedItem = normalizeProductStock(quantityItem);
    if (!requestedItem?.isBusinessProduct) {
      handleRequest(requestedItem.id, { quantity });
      return;
    }
    const allowance = getQuantityAllowance(requestedItem, activeAccountId, quantity);
    if (allowance.allowedQuantity < 1) return;
    const reservedQuantity = allowance.allowedQuantity;
    const orderId = createOrderId();
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
    reservation.whatsappLink = createWhatsAppLink(activeBuyer.mobile, `Your ZeroMart order ${collectionCode} is reserved at ${requestedItem.sellerName}. Show this collection ID or QR at the store to collect ${requestedItem.title} × ${reservedQuantity}.`);
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
      whatsappLink: createWhatsAppLink(reservation.storePhone, `Hello, I reserved ${requestedItem.title} on ZeroMart. Collection ID: ${collectionCode}.`),
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

  const handleRequestDecision = (notification, decision, confirmation = {}) => {
    const accepted = decision === 'accepted';
    const nextStatus = accepted ? 'Seller confirmed' : 'Request declined';
    const currentRequest = getRequests().find((request) => request.requestId === notification.requestId);
    saveRequests(getRequests().map((request) => (
      request.requestId === notification.requestId
        ? {
            ...request,
            status: decision,
            collectionDate: confirmation.collectionDate || '',
            collectionTime: confirmation.collectionTime || '',
            pickupAddress: confirmation.pickupAddress || '',
            sellerPhone: accepted ? (confirmation.sellerPhone || notification.sellerPhone || '') : '',
            optionalMessage: confirmation.optionalMessage || '',
            sellerGave: request.sellerGave,
          }
        : request
    )));
    updatePurchaseHistoryStatus(notification.requestId, decision);
    if (accepted) {
      const productName = notification.productName || notification.title.replace('Request for ', '');
      const sellerPhone = confirmation.sellerPhone || notification.sellerPhone || '';
      const collectionSummary = `${confirmation.collectionDate} at ${confirmation.collectionTime}`;
      const buyerWhatsappLink = createWhatsAppLink(notification.buyerPhone, `Your ZeroMart request for ${productName} is confirmed by ${notification.sellerName}. Collect on ${collectionSummary} from ${confirmation.pickupAddress}. Seller phone: ${sellerPhone}.${confirmation.optionalMessage ? ` Message: ${confirmation.optionalMessage}` : ''}`);
      const sellerWhatsappLink = createWhatsAppLink(sellerPhone, `Hello, I am ${notification.buyerName}. My ZeroMart collection for ${productName} is confirmed for ${collectionSummary}.`);
      const emailSubject = encodeURIComponent('ZeroMart Collection Confirmation');
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
        requestStatus: 'accepted',
        chatEnabled: false,
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
                requestStatus: 'accepted',
                chatEnabled: false,
                body: `Awaiting collection from ${notification.buyerName}. Collection details were sent to the buyer.`,
              }
            : entry
        ));
        return [acceptedNotification, ...sellerUpdate.filter((entry) => entry.id !== acceptedNotification.id)];
      });
      if (notification.buyerPhone) window.open(buyerWhatsappLink, '_blank', 'noopener,noreferrer');
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
            ? { ...entry, read: true, requestStatus: 'declined', chatEnabled: false, body: 'Request declined by the seller.' }
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
            requestStatus: decision,
            chatEnabled: false,
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
    } else {
      localStorage.removeItem(`zeromart-chat-${notification.requestId}`);
      setNotice('The request was declined. Reserved stock was released.');
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

  const handleUpdateUser = (updates) => {
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
          sellerName: nextUser.name || 'Unknown',
          sellerProfileImage: nextUser.profileImage || '',
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
    setNotice('Profile updated successfully');
  };

  const handleListingSubmit = (formData) => {
    if (editingItem) {
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
        updatedAt: new Date().toISOString(),
      };
      setItems((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
      setFavorites((prev) => prev.map((item) => (item.id === editingItem.id ? updatedItem : item)));
      upsertLiveListing(updatedItem);
      setSelectedItem(updatedItem);
      setEditingItem(null);
      setShowListingSheet(false);
      setNotice('Your listing has been updated.');
      return;
    }
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
      sellerProfileImage: user?.profileImage || '',
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
    setItems((prev) => [newItem, ...prev]);
    upsertLiveListing(newItem);
    setUser((prev) => (prev ? {
      ...prev,
      listed: (Number(prev.listed) || 0) + 1,
      activeListings: (Number(prev.activeListings) || 0) + 1,
    } : prev));
    setShowListingSheet(false);
    setSelectedItem(null);
    setActiveView('home');
    setNotice('Your item is live. You can manage it from its card or your profile.');
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
    removeLiveListing(item.id);
    setUser((prev) => (prev ? {
      ...prev,
      listed: Math.max(0, (Number(prev.listed) || 0) - 1),
      activeListings: Math.max(0, (Number(prev.activeListings) || 0) - ((item.status || 'Available') === 'Completed' ? 0 : 1)),
    } : prev));
    setSelectedItem(null);
    setEditingItem(null);
    setNotice('Your listing has been deleted.');
  };

  const handleBuyerUnlockComplete = () => {
    if (businessSession) {
      const nextBusinessSession = { ...businessSession, isBuyer: true };
      setBusinessSession(nextBusinessSession);
      saveBusinessSession(nextBusinessSession);
      saveBusinessAccounts([
        nextBusinessSession,
        ...getBusinessAccounts().filter((account) => account.id !== nextBusinessSession.id),
      ]);
    } else {
      setUser((prev) => (prev ? { ...prev, isBuyer: true } : prev));
    }
    setShowBuyerPaySheet(false);
    setNotice('Lifetime buying access unlocked. You can request ₹0 items now.');
  };

  const handleKarmaSubmit = () => {
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
      window.dispatchEvent(new Event('storage'));
      return;
    }
    if (karmaTarget?.sellerId) {
      const ledger = getKarmaLedger();
      const key = accountKey(karmaTarget.sellerId);
      const currentValue = Number(ledger[key] ?? karmaTarget.currentKarma ?? 0);
      localStorage.setItem('zeromart-community-karma', JSON.stringify({ ...ledger, [key]: currentValue + 1 }));
      saveRequests(getRequests().map((request) => (
        request.requestId === karmaTarget.requestId ? { ...request, karmaGiven: true } : request
      )));
    }
    completePendingKarmaAction(karmaTarget?.pendingActionId || `community:${karmaTarget?.requestId}`);
    setItems((prev) => prev.map((item) => (
      item.sellerName === karmaTarget?.name
        ? { ...item, sellerKarma: Number(item.sellerKarma || 0) + 1 }
        : item
    )));
    localStorage.removeItem('zeromart-pending-community-karma');
    setShowKarmaPopup(false);
    setKarmaTarget(null);
    setNotice(`Good karma sent to ${karmaTarget?.name || 'the seller'}.`);
  };

  const finishCompletedHandoff = (result, target) => {
    const quantity = Number(result.request?.quantity || 1);
    localStorage.removeItem(`zeromart-chat-${target.requestId}`);
    const pendingKarma = {
      ...(target.karmaRecipient || target),
      id: `community:${target.requestId}`,
      pendingActionId: `community:${target.requestId}`,
      buyerId: result.request?.buyerId,
      sellerId: result.request?.sellerId,
      requestId: target.requestId,
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
    const result = confirmHandoff(notification.requestId, 'seller');
    if (!result.request) {
      setNotice('This collection request could not be found.');
      return;
    }
    if (result.alreadyCompleted) {
      setNotice('This handover is already completed.');
      setSelectedNotification(null);
      return;
    }
    commitNotifications((current) => current.map((entry) => (
      entry.requestId === notification.requestId
        ? {
            ...entry,
            sellerGave: true,
            requestStatus: result.completed ? 'completed' : 'accepted',
            body: result.completed
              ? `${result.request.buyerName} collected ${result.request.productName}. Status: Completed.`
              : entry.type === 'request'
                ? `You handed over ${result.request.productName}. Waiting for ${result.request.buyerName} to confirm collection.`
                : `${result.request.sellerName} marked ${result.request.productName} as handed over. Confirm after you collect it.`,
          }
        : entry
    )));
    if (!result.completed) {
      setNotice('Handover confirmed. Waiting for the buyer to mark the item as collected.');
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
        type: 'user',
        currentKarma: Number(item?.sellerKarma || 0),
      },
    });
    setSelectedNotification(null);
  };

  const handleNotificationOpen = (notification) => {
    setNotifications((prev) => prev.map((entry) => (entry.id === notification.id ? { ...entry, read: true } : entry)));
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
    setSelectedNotification(notification);
  };

  const selectedItemData = useMemo(() => {
    const item = items.find((entry) => entry.id === selectedItem?.id) ?? selectedItem;
    if (!item) return null;
    const coordinates = getItemCoordinates(item);
    const distanceKm = coordinates && currentCoordinates ? haversineKm(currentCoordinates, coordinates) : item.distanceKm ?? null;
    return {
      ...item,
      distanceKm,
      distance: distanceKm === null ? item.distance : formatDistance(distanceKm),
      requestState: getProductRequestState(item, activeAccountId, requestClock),
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
      if (request.status === 'accepted') {
        return {
          ...notification,
          requestStatus: 'accepted',
          sellerGave: Boolean(request.sellerGave),
          buyerCollected: Boolean(request.buyerCollected),
          body: request.sellerGave
            ? `You handed over ${request.productName}. Waiting for ${request.buyerName} to confirm collection.`
            : `Awaiting collection from ${request.buyerName}. Collection details were sent to the buyer.`,
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
    const activeLocation = currentCoordinates;
    if (!activeLocation) return [];
    const catalogItems = hasActiveSearch
      ? items
      : items;
    return catalogItems.map(normalizeProductStock).filter(isMarketplaceVisible).map((item) => {
      const itemCoordinates = getItemCoordinates(item);
      const distanceFromActive = activeLocation && itemCoordinates ? haversineKm(activeLocation, itemCoordinates) : null;
      return {
        ...item,
        distanceKm: distanceFromActive,
        distance: distanceFromActive === null ? item.distance : formatDistance(distanceFromActive),
        requestState: getProductRequestState(item, activeAccountId, requestClock),
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
      const firstDistance = first.distanceKm ?? Number.POSITIVE_INFINITY;
      const secondDistance = second.distanceKm ?? Number.POSITIVE_INFINITY;
      if (firstDistance !== secondDistance) return firstDistance - secondDistance;
      if ((second.sellerKarma || 0) !== (first.sellerKarma || 0)) return (second.sellerKarma || 0) - (first.sellerKarma || 0);
      const firstAvailable = Number(first.requestState?.requestableStock ?? first.availableQuantity ?? 0);
      const secondAvailable = Number(second.requestState?.requestableStock ?? second.availableQuantity ?? 0);
      if (secondAvailable !== firstAvailable) return secondAvailable - firstAvailable;
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });
  }, [activeAccountId, categoryFilter, conditionFilter, currentCoordinates, hasActiveSearch, items, radiusKm, requestClock, searchQuery]);

  const rescueItems = useMemo(() => rankedItems
    .map((item) => {
      const expiryTimestamp = getExpiryTimestamp(item);
      const hoursRemaining = expiryTimestamp === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, (expiryTimestamp - requestClock) / (60 * 60 * 1000));
      const rescueWindowDays = Number(item.expiryWindowDays ?? item.listBeforeExpiryDays ?? 5);
      const rescueEligible = expiryTimestamp !== null
        && hoursRemaining <= rescueWindowDays * 24
        && Number(item.requestState?.requestableStock ?? item.availableQuantity ?? 0) > 0;
      if (!rescueEligible) return null;
      const rescueLabel = hoursRemaining <= 12
        ? `Expires in ${Math.max(1, Math.ceil(hoursRemaining))} hours`
        : hoursRemaining <= 24
          ? 'Expires Today'
          : hoursRemaining <= 48
            ? 'Expires Tomorrow'
            : `${Math.ceil(hoursRemaining / 24)} Days Left`;
      return { ...item, hoursRemaining, rescueLabel };
    })
    .filter(Boolean)
    .sort((first, second) => (
      first.hoursRemaining - second.hoursRemaining
      || (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity)
      || (second.sellerKarma || 0) - (first.sellerKarma || 0)
    ))
    .slice(0, 10), [rankedItems, requestClock]);
  const rescueIds = useMemo(() => new Set(rescueItems.map((item) => String(item.id))), [rescueItems]);
  const communityRankedItems = useMemo(
    () => rankedItems.filter((item) => !item.isBusinessProduct && !rescueIds.has(String(item.id))),
    [rankedItems, rescueIds]
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
  const filteredItems = useMemo(() => rankedItems.filter((item) => (
    !currentCoordinates || item.distanceKm === null || item.distanceKm <= activeFeedRadius
  )), [activeFeedRadius, currentCoordinates, rankedItems]);
  const communityFeedItems = useMemo(() => communityRankedItems.filter((item) => (
    !currentCoordinates || item.distanceKm === null || item.distanceKm <= activeFeedRadius
  )), [activeFeedRadius, communityRankedItems, currentCoordinates]);
  const hasMoreDiscoveryItems = radiusKm === 'all'
    && discoveryStageIndex < DISCOVERY_STAGES.length - 1
    && communityFeedItems.length < communityRankedItems.length;
  const businessDealsNearby = rankedItems
    .filter((item) => (
      item.isBusinessProduct
      && !rescueIds.has(String(item.id))
      && (item.distanceKm === null || item.distanceKm <= 25)
    ))
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
    const localCoordinates = currentCoordinates;
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
      const name = item.sellerName || item.brand || 'ZeroMart giver';
      const itemCoordinates = getItemCoordinates(item);
      const itemDistanceKm = localCoordinates && itemCoordinates
        ? haversineKm(localCoordinates, itemCoordinates)
        : Number.POSITIVE_INFINITY;
      const existing = profileMap.get(name) || {
        name,
        karma: 0,
        listings: 0,
        completed: 0,
        distanceKm: Number.POSITIVE_INFINITY,
        location: item.location,
        image: item.sellerProfileImage || (user?.name === name ? user.profileImage : ''),
      };
      profileMap.set(name, {
        ...existing,
        karma: Math.max(existing.karma, item.sellerKarma || 0),
        listings: existing.listings + 1,
        completed: existing.completed + Number(item.completedCount || item.soldQuantity || 0),
        distanceKm: Math.min(existing.distanceKm, itemDistanceKm ?? Number.POSITIVE_INFINITY),
        location: existing.location || item.location,
        image: existing.image || item.sellerProfileImage || (user?.name === name ? user.profileImage : ''),
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
          a.distanceKm - b.distanceKm
          || b.karma - a.karma
          || b.completed - a.completed
        )).slice(0, 5);
      }
      const existing = profileMap.get(user.name) || {
        name: user.name, karma: 0, listings: 0, completed: 0,
        distanceKm: userDistanceKm ?? Number.POSITIVE_INFINITY,
        location: locationLabel, image: user.profileImage,
      };
      profileMap.set(user.name, {
        ...existing,
        karma: Math.max(existing.karma, user.karma || 0),
        location: existing.location || locationLabel,
        image: user.profileImage || existing.image,
      });
    }
    return [...profileMap.values()].sort((a, b) => (
      a.distanceKm - b.distanceKm
      || b.karma - a.karma
      || b.completed - a.completed
    )).slice(0, 5);
  }, [currentCoordinates, items, leaderboardScope, locationEngine.location, locationLabel, radiusKm, user]);
  const selectedPublicProfileItems = useMemo(() => {
    if (!selectedPublicProfile) return [];
    return items.filter((item) => (item.sellerName || item.brand) === selectedPublicProfile.name);
  }, [items, selectedPublicProfile]);
  const hasActiveSession = Boolean(user || businessSession);
  const visibleNotice = hasActiveSession && /you are logged out/i.test(notice) ? '' : notice;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(124,58,237,0.14),_transparent_28%),linear-gradient(135deg,_#fffaf2_0%,_#f7f4ff_48%,_#f8fafc_100%)] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <aside className="hidden w-80 flex-col justify-between rounded-r-[2rem] border border-amber-100/80 bg-white/75 p-8 shadow-[0_20px_65px_rgba(15,23,42,0.08)] backdrop-blur lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-violet-600 text-xl text-white shadow-lg shadow-violet-500/20">✨</div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">ZeroMart</p>
                <p className="text-sm text-slate-500">₹0 goods, real kindness</p>
              </div>
            </div>
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
                <p className="text-3xl font-extrabold text-white drop-shadow-sm sm:text-4xl">ZeroMart</p>
                <p className="mt-2 max-w-xs text-sm font-medium leading-6 text-white/90">Pass useful things forward. Find nearby items and earn good karma.</p>
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
                        <img src={user.profileImage} alt={user.name} className="h-full w-full object-cover" />
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
                  onSelectItem={setSelectedItem}
                  onBuyItem={handleBuyNow}
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
                                {profile.image ? <img src={profile.image} alt={profile.name} className="h-full w-full object-cover" /> : initials}
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
                        placeholder="Search anything on ZeroMart"
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
                            <img src={item.image} alt={item.title} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
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
                user={user}
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
                      <article key={item.id} className="overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white shadow-sm">
                        <img src={item.image} alt={item.title} className="h-36 w-full object-cover" />
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                              <p className="mt-1 text-sm text-slate-500">{item.condition} · {item.distance}</p>
                            </div>
                            <button onClick={() => toggleFavorite(item)} className="rounded-full border border-rose-100 bg-rose-50 p-2 text-rose-500" aria-label="Remove from favorites">
                              <Heart size={15} fill="currentColor" />
                            </button>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-slate-500">{item.description || 'No description added.'}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button onClick={() => setSelectedItem(item)} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
                              View item
                            </button>
                            <button onClick={() => toggleFavorite(item)} className="rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
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
          onRequireBuyerAccess={() => setShowBuyerPaySheet(true)}
          onEdit={handleEditListing}
          onDelete={handleDeleteListing}
          user={activeBuyer}
        />
      )}

      {selectedPublicProfile && (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-100 to-violet-100 text-lg font-bold text-violet-700">
                  {selectedPublicProfile.image ? (
                    <img src={selectedPublicProfile.image} alt={selectedPublicProfile.name} className="h-full w-full object-cover" />
                  ) : (
                    selectedPublicProfile.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-violet-600">Good karma profile</p>
                  <h3 className="text-xl font-bold text-slate-900">{selectedPublicProfile.name}</h3>
                  <p className="text-sm text-slate-500">{selectedPublicProfile.location}</p>
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
                <p className="text-xs text-slate-500">Products listed</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">₹0</p>
                <p className="text-xs text-slate-500">Giving price</p>
              </div>
            </div>
            <div className="mt-5 rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-4">
              <p className="font-semibold text-slate-900">About {selectedPublicProfile.name}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {selectedPublicProfile.name} has shared {selectedPublicProfile.listings} product{selectedPublicProfile.listings === 1 ? '' : 's'} around {selectedPublicProfile.location} and earned {selectedPublicProfile.karma} good karma points.
              </p>
            </div>
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
                      <img src={item.image} alt={item.title} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
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
      <BuyerPaySheet open={showBuyerPaySheet} onClose={() => setShowBuyerPaySheet(false)} onComplete={handleBuyerUnlockComplete} />
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
      <KarmaPopup open={showKarmaPopup} seller={karmaTarget} onSubmit={handleKarmaSubmit} mandatory={Boolean(karmaTarget?.mandatory)} />
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
          navigate('/business/dashboard');
        }}
      />
      <OnboardingTour open={!hasSeenTour} onFinish={handleTourFinish} />
    </div>
  );
}
