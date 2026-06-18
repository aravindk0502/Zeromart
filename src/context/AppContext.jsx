import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { supabase, isOnline } from '../lib/supabase';
import { fetchProducts, fetchFavourites, fetchProfile, fetchOrders, insertProduct, addFavourite, removeFavourite, upsertProfile } from '../lib/api';

const AppContext = createContext(null);

export const MOCK_PRODUCTS = [
  { id: 1, title: 'Sony Bluetooth Speaker', category: 'Electronics', emoji: '🔊', distance: 0.4, condition: 'Good', seller: { name: 'Ravi K', karma: 47, initials: 'RK' }, description: 'Used for 6 months, works perfectly. Moving abroad, no use for it.', nearbyEligible: true, listed: '2 hours ago' },
  { id: 2, title: 'Wooden Study Table', category: 'Furniture', emoji: '🪑', distance: 1.2, condition: 'Very Good', seller: { name: 'Priya M', karma: 83, initials: 'PM' }, description: 'Solid teak wood. Kids outgrew it. Ideal for 8–14 year olds.', nearbyEligible: false, listed: '5 hours ago' },
  { id: 3, title: 'Baby Stroller', category: 'Baby & Kids', emoji: '🍼', distance: 0.7, condition: 'Like New', seller: { name: 'Ananya R', karma: 29, initials: 'AR' }, description: 'Used only 3 months. Baby preferred to be carried! Perfect condition.', nearbyEligible: true, listed: '1 day ago' },
  { id: 4, title: 'Yoga Mat', category: 'Sports', emoji: '🧘', distance: 2.1, condition: 'Good', seller: { name: 'Karthik S', karma: 62, initials: 'KS' }, description: '6mm thick mat, washed and clean. Bought a premium one, giving this away.', nearbyEligible: false, listed: '3 hours ago' },
  { id: 5, title: 'Stack of Engineering Books', category: 'Books', emoji: '📚', distance: 0.3, condition: 'Good', seller: { name: 'Meera V', karma: 115, initials: 'MV' }, description: 'GATE prep books, Anna University syllabus. Take all 12 books.', nearbyEligible: true, listed: '6 hours ago' },
  { id: 6, title: 'Air Fryer', category: 'Appliances', emoji: '🍳', distance: 1.8, condition: 'Very Good', seller: { name: 'Suresh P', karma: 38, initials: 'SP' }, description: 'Upgraded to a bigger one. 2.5L capacity, works great.', nearbyEligible: false, listed: '2 days ago' },
  { id: 7, title: 'Kids Bicycle', category: 'Sports', emoji: '🚲', distance: 0.6, condition: 'Good', seller: { name: 'Lakshmi T', karma: 74, initials: 'LT' }, description: '14 inch wheels, suitable for 5–8 year olds. Slightly scratched but fully functional.', nearbyEligible: true, listed: '4 hours ago' },
  { id: 8, title: 'Formal Shirts (5 pcs)', category: 'Clothing', emoji: '👔', distance: 3.0, condition: 'Very Good', seller: { name: 'Vikram B', karma: 21, initials: 'VB' }, description: 'Size 40, wore each maybe 3–4 times. Moving to startup life!', nearbyEligible: false, listed: '1 hour ago' },
];

export const CATEGORIES = ['All', 'Electronics', 'Furniture', 'Baby & Kids', 'Sports', 'Books', 'Appliances', 'Clothing'];

const PLATFORM_ANSWERS = {
  'how to sell': 'Tap the + button at the bottom to list a product. Take a photo, add a short description, and it goes live instantly — completely free!',
  'how to buy': 'Pay a one-time ₹29 to unlock buyer access forever. Then browse, search, and request any item you like.',
  'delivery': 'The buyer pays the actual delivery cost. We work with Shadowfax and Porter. Prices are shown before you confirm.',
  'karma': 'Karma points are given by buyers after receiving an item. Higher karma = more visibility and better rewards. You earn 1 karma per successful transaction.',
  'in person': 'If a seller is within 1 km of you, you can request to collect in person. If the seller accepts, a temporary chat opens to coordinate.',
  'free': 'Yes! Listing on ZeroMart is completely free for sellers. Items are listed at ₹0.',
  'reward': 'Sellers earn delivery credits and unlock vouchers from brands like Swiggy and BookMyShow when they hit karma milestones.',
  'account': 'One account can switch between Seller and Buyer mode anytime. Buyer mode requires a one-time ₹29 fee.',
  '29': 'The ₹29 is a one-time lifetime fee to unlock buyer access. Pay once, browse and buy forever.',
  'chat': 'A temporary chat opens between buyer and seller only when the seller accepts an in-person collection request. It disappears once the handoff is complete.',
  'report': 'Tap the flag icon on any listing or profile to report. Three verified reports trigger a review. Serious fraud leads to permanent ban.',
  'voucher': 'Hit karma milestones (5, 10, 25 items given) to unlock real vouchers from partner brands.',
  'credits': 'Delivery credits are earned every time you successfully give away an item. Use them to offset your own delivery costs when buying.',
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
  {
    id: 'ORD003',
    product: { title: 'Yoga Mat', emoji: '🧘', category: 'Sports' },
    seller: { name: 'Karthik S', initials: 'KS', karma: 62 },
    type: 'delivery', status: 'delivered', statusLabel: 'Delivered',
    placedAt: '3 days ago', eta: null,
    steps: [
      { label: 'Request accepted', done: true },
      { label: 'Item picked up', done: true },
      { label: 'Out for delivery', done: true },
      { label: 'Delivered', done: true },
    ],
  },
];

const DEFAULT_USER = {
  name: 'You', initials: 'ME', mode: 'seller', isBuyer: false,
  karma: 0, credits: 0, vouchers: 0,
  isLoggedIn: false, phone: null, hasSeenTour: false,
  supabaseId: null,
};

export function AppProvider({ children }) {
  const [page, setPage] = useState('home');
  const [user, setUser] = useState(DEFAULT_USER);
  const [authGate, setAuthGate] = useState(null);
  const nextId = useRef(100);
  const isBuyerRef = useRef(false);
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [favourites, setFavourites] = useState([3, 5]);
  const [karmaPopup, setKarmaPopup] = useState(null);
  const [chatOpen, setChatOpen] = useState(null);
  const [botOpen, setBotOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: 'Meera V listed new books nearby!', time: '5m ago', read: false },
    { id: 2, text: 'You received a karma point from Raj S', time: '2h ago', read: false },
    { id: 3, text: 'Your stroller request was accepted', time: '1d ago', read: true },
  ]);
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [listingSheet, setListingSheet] = useState(false);
  const [buyerPaySheet, setBuyerPaySheet] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [collectRequest, setCollectRequest] = useState(null);
  const [viewingSeller, setViewingSeller] = useState(null);

  // ── Supabase bootstrap ──────────────────────────────────────────────────────

  useEffect(() => {
    // Load real products from Supabase in background
    fetchProducts().then(data => { if (data && data.length > 0) setProducts(data); });

    if (!isOnline()) return;

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadUserFromSupabase(session.user.id);
      }
    });

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserFromSupabase(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserFromSupabase(uid) {
    const profile = await fetchProfile(uid);
    if (profile) {
      setUser(prev => ({
        ...prev,
        name: profile.name || prev.name,
        initials: profile.initials || prev.initials,
        mode: profile.mode || 'seller',
        isBuyer: profile.is_buyer || false,
        karma: profile.karma || 0,
        credits: profile.credits || 0,
        vouchers: profile.vouchers || 0,
        hasSeenTour: profile.has_seen_tour || false,
        isLoggedIn: true,
        supabaseId: uid,
        phone: profile.phone,
      }));
      isBuyerRef.current = profile.is_buyer || false;

      // Load user's favourites and orders
      fetchFavourites(uid).then(favs => { if (favs) setFavourites(favs); });
      fetchOrders(uid).then(userOrders => { if (userOrders && userOrders.length > 0) setOrders(userOrders); });
    } else {
      setUser(prev => ({ ...prev, isLoggedIn: true, supabaseId: uid }));
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => { isBuyerRef.current = user.isBuyer; }, [user.isBuyer]);

  const requireAuth = useCallback((action) => {
    if (user.isLoggedIn) { action(); return; }
    setAuthGate({ pendingAction: action });
  }, [user.isLoggedIn]);

  const completeAuth = useCallback(async (phone, tokens) => {
    // If we got real Supabase tokens from verify-otp, sign in client
    if (tokens?.access_token && isOnline()) {
      const { data: { session } } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (session?.user) {
        // loadUserFromSupabase will be called by onAuthStateChange
        // Ensure profile exists with phone
        await upsertProfile(session.user.id, { phone, name: 'ZeroMart User', initials: phone.slice(-2).toUpperCase() });
      }
    }

    setUser(prev => ({ ...prev, isLoggedIn: true, phone }));
    setAuthGate(prev => {
      if (prev?.pendingAction) setTimeout(prev.pendingAction, 0);
      return null;
    });
  }, []);

  // ── Products ────────────────────────────────────────────────────────────────

  const addProduct = useCallback(async (listing) => {
    // Optimistic local add
    const localId = ++nextId.current;
    const newProduct = {
      id: localId,
      title: listing.title,
      category: listing.category,
      emoji: listing.emoji,
      distance: 0.0,
      condition: listing.condition,
      seller: { name: user.name, karma: user.karma, initials: user.initials },
      description: listing.description || '',
      nearbyEligible: true,
      listed: 'just now',
      photo: listing.photo || null,
      isOwn: true,
    };
    setProducts(prev => [newProduct, ...prev]);

    // Sync to Supabase
    const realId = await insertProduct(listing, user);
    if (realId && realId !== localId) {
      setProducts(prev => prev.map(p => p.id === localId ? { ...p, id: realId } : p));
    }

    return localId;
  }, [user]);

  // ── Favourites ──────────────────────────────────────────────────────────────

  const toggleFavourite = useCallback((id) => {
    setFavourites(prev => {
      const isFav = prev.includes(id);
      const uid = user.supabaseId;
      if (isFav) {
        removeFavourite(uid, id);
        return prev.filter(f => f !== id);
      } else {
        addFavourite(uid, id);
        return [...prev, id];
      }
    });
  }, [user.supabaseId]);

  // ── Karma ───────────────────────────────────────────────────────────────────

  const triggerKarmaPopup = useCallback((seller) => setKarmaPopup(seller), []);

  const closeKarmaPopup = useCallback(() => {
    setKarmaPopup(null);
    setUser(prev => {
      const updated = { ...prev, karma: prev.karma + 1 };
      if (prev.supabaseId) upsertProfile(prev.supabaseId, { karma: updated.karma });
      return updated;
    });
  }, []);

  // ── Mode switch ─────────────────────────────────────────────────────────────

  const switchMode = useCallback((targetMode) => {
    if (targetMode === 'buyer' && !isBuyerRef.current) {
      setBuyerPaySheet(true);
    } else {
      setUser(prev => ({ ...prev, mode: targetMode }));
    }
  }, []);

  const completeBuyerPayment = useCallback(() => {
    setUser(prev => {
      const updated = { ...prev, isBuyer: true, mode: 'buyer' };
      isBuyerRef.current = true;
      if (prev.supabaseId) upsertProfile(prev.supabaseId, { is_buyer: true, mode: 'buyer' });
      return updated;
    });
    setBuyerPaySheet(false);
  }, []);

  // ── Bot ─────────────────────────────────────────────────────────────────────

  const getBotAnswer = useCallback((question) => {
    const q = question.toLowerCase();
    for (const [key, answer] of Object.entries(PLATFORM_ANSWERS)) {
      if (q.includes(key)) return answer;
    }
    return "I can help you with: selling, buying, delivery, karma, in-person collection, rewards, and account info. Try asking about any of these!";
  }, []);

  // ── Notifications ───────────────────────────────────────────────────────────

  const markNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const userListings = products.filter(p => p.isOwn || p.sellerId === user.supabaseId);

  return (
    <AppContext.Provider value={{
      page, setPage,
      user, setUser,
      products,
      userListings,
      addProduct,
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

export function useApp() {
  return useContext(AppContext);
}
