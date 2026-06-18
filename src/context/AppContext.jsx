import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  isLoggedIn, setToken, clearToken,
  fetchProfile, updateProfile,
  fetchProducts, insertProduct,
  fetchFavourites, toggleFavouriteAPI,
  fetchOrders,
} from '../lib/api';

const AppContext = createContext(null);

export const MOCK_PRODUCTS = [
  { id: 1, title: 'Sony Bluetooth Speaker', category: 'Electronics', emoji: '🔊', distance: 0.4, condition: 'Good', seller: { name: 'Ravi K', karma: 47, initials: 'RK' }, description: 'Used for 6 months, works perfectly. Moving abroad.', nearbyEligible: true, listed: '2 hours ago' },
  { id: 2, title: 'Wooden Study Table', category: 'Furniture', emoji: '🪑', distance: 1.2, condition: 'Very Good', seller: { name: 'Priya M', karma: 83, initials: 'PM' }, description: 'Solid teak wood. Kids outgrew it.', nearbyEligible: false, listed: '5 hours ago' },
  { id: 3, title: 'Baby Stroller', category: 'Baby & Kids', emoji: '🍼', distance: 0.7, condition: 'Like New', seller: { name: 'Ananya R', karma: 29, initials: 'AR' }, description: 'Used only 3 months. Baby preferred to be carried!', nearbyEligible: true, listed: '1 day ago' },
  { id: 4, title: 'Yoga Mat', category: 'Sports', emoji: '🧘', distance: 2.1, condition: 'Good', seller: { name: 'Karthik S', karma: 62, initials: 'KS' }, description: '6mm thick mat, washed and clean.', nearbyEligible: false, listed: '3 hours ago' },
  { id: 5, title: 'Stack of Engineering Books', category: 'Books', emoji: '📚', distance: 0.3, condition: 'Good', seller: { name: 'Meera V', karma: 115, initials: 'MV' }, description: 'GATE prep books. Take all 12 books.', nearbyEligible: true, listed: '6 hours ago' },
  { id: 6, title: 'Air Fryer', category: 'Appliances', emoji: '🍳', distance: 1.8, condition: 'Very Good', seller: { name: 'Suresh P', karma: 38, initials: 'SP' }, description: 'Upgraded to a bigger one. 2.5L capacity.', nearbyEligible: false, listed: '2 days ago' },
  { id: 7, title: 'Kids Bicycle', category: 'Sports', emoji: '🚲', distance: 0.6, condition: 'Good', seller: { name: 'Lakshmi T', karma: 74, initials: 'LT' }, description: '14 inch wheels, suitable for 5–8 year olds.', nearbyEligible: true, listed: '4 hours ago' },
  { id: 8, title: 'Formal Shirts (5 pcs)', category: 'Clothing', emoji: '👔', distance: 3.0, condition: 'Very Good', seller: { name: 'Vikram B', karma: 21, initials: 'VB' }, description: 'Size 40, wore each maybe 3–4 times.', nearbyEligible: false, listed: '1 hour ago' },
];

export const CATEGORIES = ['All', 'Electronics', 'Furniture', 'Baby & Kids', 'Sports', 'Books', 'Appliances', 'Clothing'];

const PLATFORM_ANSWERS = {
  'how to sell': 'Tap the + button at the bottom to list a product. Take a photo, add a short description, and it goes live instantly — completely free!',
  'how to buy': 'Pay a one-time ₹29 to unlock buyer access forever. Then browse, search, and request any item you like.',
  'delivery': 'The buyer pays the actual delivery cost. We work with Shadowfax and Porter. Prices are shown before you confirm.',
  'karma': 'Karma points are given by buyers after receiving an item. Higher karma = more visibility and better rewards.',
  'in person': 'If a seller is within 1 km of you, you can request to collect in person.',
  'free': 'Yes! Listing on ZeroMart is completely free for sellers. Items are listed at ₹0.',
  'reward': 'Sellers earn delivery credits and unlock vouchers from brands like Swiggy and BookMyShow when they hit karma milestones.',
  'account': 'One account can switch between Seller and Buyer mode anytime. Buyer mode requires a one-time ₹29 fee.',
  '29': 'The ₹29 is a one-time lifetime fee to unlock buyer access. Pay once, browse and buy forever.',
  'chat': 'A temporary chat opens between buyer and seller only for in-person collection. It disappears once the handoff is complete.',
  'report': 'Tap the flag icon on any listing or profile to report. Three verified reports trigger a review.',
  'voucher': 'Hit karma milestones (5, 10, 25 items given) to unlock real vouchers from partner brands.',
  'credits': 'Delivery credits are earned every time you successfully give away an item.',
};

export const MOCK_ORDERS = [
  {
    id: 'ORD001',
    product: { title: 'Sony Bluetooth Speaker', emoji: '🔊', category: 'Electronics' },
    seller: { name: 'Ravi K', initials: 'RK', karma: 47 },
    type: 'delivery', status: 'in_transit', statusLabel: 'Out for delivery',
    placedAt: '2 hours ago', eta: 'Today, 6–8 PM',
    steps: [
      { label: 'Request accepted', done: true },
      { label: 'Item picked up', done: true },
      { label: 'Out for delivery', done: true, active: true },
      { label: 'Delivered', done: false },
    ],
  },
  {
    id: 'ORD002',
    product: { title: 'Baby Stroller', emoji: '🍼', category: 'Baby & Kids' },
    seller: { name: 'Ananya R', initials: 'AR', karma: 29 },
    type: 'collect', status: 'pending', statusLabel: 'Awaiting seller confirmation',
    placedAt: '30 min ago', eta: null,
    steps: [
      { label: 'Request sent', done: true, active: true },
      { label: 'Seller confirms', done: false },
      { label: 'Meet for handoff', done: false },
      { label: 'Collected', done: false },
    ],
  },
];

const DEFAULT_USER = {
  name: 'You', initials: 'ME', mode: 'seller', isBuyer: false,
  karma: 0, credits: 0, vouchers: 0,
  isLoggedIn: false, phone: null, hasSeenTour: false,
};

function dbToUser(row) {
  return {
    name:         row.name,
    initials:     row.initials,
    mode:         row.mode,
    isBuyer:      row.is_buyer,
    karma:        row.karma,
    credits:      row.credits,
    vouchers:     row.vouchers,
    hasSeenTour:  row.has_seen_tour,
    phone:        row.phone,
    isLoggedIn:   true,
  };
}

function dbToProduct(row) {
  return {
    id:             row.id,
    title:          row.title,
    category:       row.category,
    emoji:          row.emoji,
    distance:       row.distance,
    condition:      row.condition,
    description:    row.description || '',
    photo:          row.photo_url || null,
    nearbyEligible: row.nearby_eligible,
    listed:         row.listed,
    seller:         { name: row.seller_name, karma: row.seller_karma, initials: row.seller_initials },
    sellerId:       row.seller_id,
  };
}

export function AppProvider({ children }) {
  const [page, setPage]           = useState('home');
  const [user, setUser]           = useState(DEFAULT_USER);
  const [authGate, setAuthGate]   = useState(null);
  const nextId                    = useRef(100);
  const isBuyerRef                = useRef(false);
  const [products, setProducts]   = useState(MOCK_PRODUCTS);
  const [favourites, setFavourites] = useState([3, 5]);
  const [karmaPopup, setKarmaPopup] = useState(null);
  const [chatOpen, setChatOpen]   = useState(null);
  const [botOpen, setBotOpen]     = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: 'Meera V listed new books nearby!', time: '5m ago', read: false },
    { id: 2, text: 'You received a karma point from Raj S', time: '2h ago', read: false },
    { id: 3, text: 'Your stroller request was accepted', time: '1d ago', read: true },
  ]);
  const [orders, setOrders]       = useState(MOCK_ORDERS);
  const [listingSheet, setListingSheet]   = useState(false);
  const [buyerPaySheet, setBuyerPaySheet] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [collectRequest, setCollectRequest]   = useState(null);
  const [viewingSeller, setViewingSeller]     = useState(null);

  // ── Bootstrap: load real products + restore session ──────────────────────────
  useEffect(() => {
    // Load products from DB (falls back gracefully to mock if API unavailable)
    fetchProducts()
      .then(rows => { if (rows && rows.length > 0) setProducts(rows.map(dbToProduct)); })
      .catch(() => {});

    // Restore session from localStorage token
    if (isLoggedIn()) {
      fetchProfile()
        .then(row => {
          setUser(prev => ({ ...prev, ...dbToUser(row) }));
          isBuyerRef.current = row.is_buyer;
          fetchFavourites().then(favs => { if (favs.length) setFavourites(favs); }).catch(() => {});
          fetchOrders().then(dbOrders => { if (dbOrders.length) setOrders(dbOrders); }).catch(() => {});
        })
        .catch(() => clearToken()); // token expired — log out
    }
  }, []);

  useEffect(() => { isBuyerRef.current = user.isBuyer; }, [user.isBuyer]);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const requireAuth = useCallback((action) => {
    if (user.isLoggedIn) { action(); return; }
    setAuthGate({ pendingAction: action });
  }, [user.isLoggedIn]);

  const completeAuth = useCallback((phone, data) => {
    if (data?.token) {
      setToken(data.token);
      if (data.user) setUser(prev => ({ ...prev, ...dbToUser(data.user), isLoggedIn: true }));
    }
    setUser(prev => ({ ...prev, isLoggedIn: true, phone: phone || prev.phone }));
    setAuthGate(prev => {
      if (prev?.pendingAction) setTimeout(prev.pendingAction, 0);
      return null;
    });
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(DEFAULT_USER);
    isBuyerRef.current = false;
  }, []);

  // ── Products ──────────────────────────────────────────────────────────────────
  const addProduct = useCallback(async (listing) => {
    const localId = ++nextId.current;
    const newProduct = {
      id: localId, title: listing.title, category: listing.category,
      emoji: listing.emoji, distance: 0, condition: listing.condition,
      seller: { name: user.name, karma: user.karma, initials: user.initials },
      description: listing.description || '', nearbyEligible: true,
      listed: 'just now', photo: listing.photo || null, isOwn: true,
    };
    setProducts(prev => [newProduct, ...prev]);
    try {
      const res = await insertProduct(listing, user);
      if (res?.id) setProducts(prev => prev.map(p => p.id === localId ? { ...p, id: res.id } : p));
    } catch {}
    return localId;
  }, [user]);

  // ── Favourites ────────────────────────────────────────────────────────────────
  const toggleFavourite = useCallback((id) => {
    setFavourites(prev => {
      toggleFavouriteAPI(id).catch(() => {});
      return prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
    });
  }, []);

  // ── Karma ─────────────────────────────────────────────────────────────────────
  const triggerKarmaPopup = useCallback((seller) => setKarmaPopup(seller), []);
  const closeKarmaPopup = useCallback(() => {
    setKarmaPopup(null);
    setUser(prev => {
      const updated = { ...prev, karma: prev.karma + 1 };
      if (updated.isLoggedIn) updateProfile({ karma: updated.karma }).catch(() => {});
      return updated;
    });
  }, []);

  // ── Mode switch ───────────────────────────────────────────────────────────────
  const switchMode = useCallback((targetMode) => {
    if (targetMode === 'buyer' && !isBuyerRef.current) {
      setBuyerPaySheet(true);
    } else {
      setUser(prev => {
        updateProfile({ mode: targetMode }).catch(() => {});
        return { ...prev, mode: targetMode };
      });
    }
  }, []);

  const completeBuyerPayment = useCallback(() => {
    setUser(prev => {
      isBuyerRef.current = true;
      updateProfile({ is_buyer: true, mode: 'buyer' }).catch(() => {});
      return { ...prev, isBuyer: true, mode: 'buyer' };
    });
    setBuyerPaySheet(false);
  }, []);

  // ── Bot ───────────────────────────────────────────────────────────────────────
  const getBotAnswer = useCallback((question) => {
    const q = question.toLowerCase();
    for (const [key, answer] of Object.entries(PLATFORM_ANSWERS)) {
      if (q.includes(key)) return answer;
    }
    return "I can help with: selling, buying, delivery, karma, in-person collection, rewards, and account info.";
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const userListings = products.filter(p => p.isOwn);

  return (
    <AppContext.Provider value={{
      page, setPage,
      user, setUser, signOut,
      products, userListings, addProduct,
      favourites, toggleFavourite,
      karmaPopup, triggerKarmaPopup, closeKarmaPopup,
      chatOpen, setChatOpen,
      botOpen, setBotOpen,
      notifications, markNotificationsRead,
      listingSheet, setListingSheet,
      buyerPaySheet, setBuyerPaySheet,
      selectedProduct, setSelectedProduct,
      collectRequest, setCollectRequest,
      switchMode, completeBuyerPayment,
      getBotAnswer,
      orders, setOrders,
      authGate, requireAuth, completeAuth,
      viewingSeller, setViewingSeller,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
