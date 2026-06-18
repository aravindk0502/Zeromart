import React from 'react';
import './index.css';
import { AppProvider, useApp } from './context/AppContext';
import HomePage from './pages/HomePage';
import SellerPage from './pages/SellerPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import OrdersPage from './pages/OrdersPage';
import ProductSheet from './components/ProductSheet';
import KarmaPopup from './components/KarmaPopup';
import TempChat from './components/TempChat';
import BotAssistant from './components/BotAssistant';
import ListingSheet from './components/ListingSheet';
import BuyerPaySheet from './components/BuyerPaySheet';
import CollectRequestHandler from './components/CollectRequestHandler';
import OtpSheet from './components/OtpSheet';
import OnboardingTour from './components/OnboardingTour';
import SellerProfileSheet from './components/SellerProfileSheet';
import { Home, Tag, User, ShoppingBag, Plus, Bot, Star, Zap, Gift, Package } from 'lucide-react';

function DesktopSidebarLeft() {
  return (
    <aside className="desktop-sidebar-left">
      <div style={{ marginBottom: 32 }}>
        <div className="sidebar-logo">
          Zero<span style={{ color: 'var(--zm-accent)' }}>Mart</span>
        </div>
        <div className="sidebar-tagline">
          Give what you don't need.<br />
          Receive good karma in return.<br />
          <span style={{ color: 'var(--zm-amber)', fontStyle: 'italic', fontSize: 13 }}>
            Do good. Get good.
          </span>
        </div>
      </div>

      <div className="sidebar-feature">
        <div className="sidebar-feature-icon" style={{ background: 'var(--zm-accent-soft)' }}>🏷️</div>
        <div className="sidebar-feature-text">
          <h4>Free to give</h4>
          <p>List anything you don't need — books, clothes, gadgets, furniture. Always ₹0 for sellers.</p>
        </div>
      </div>

      <div className="sidebar-feature">
        <div className="sidebar-feature-icon" style={{ background: 'var(--zm-green-soft)' }}>🛍️</div>
        <div className="sidebar-feature-text">
          <h4>₹29 to receive — forever</h4>
          <p>One-time fee. No subscription. Browse and request anything near you, always.</p>
        </div>
      </div>

      <div className="sidebar-feature">
        <div className="sidebar-feature-icon" style={{ background: 'var(--zm-amber-soft)' }}>✨</div>
        <div className="sidebar-feature-text">
          <h4>Karma is real</h4>
          <p>Every item you give earns karma. Redeem for Swiggy, BookMyShow & more vouchers.</p>
        </div>
      </div>

      <div className="sidebar-feature">
        <div className="sidebar-feature-icon" style={{ background: 'rgba(45,212,160,0.1)' }}>📍</div>
        <div className="sidebar-feature-text">
          <h4>Meet your neighbour</h4>
          <p>Items within 1 km? Skip the courier. Meet in person, zero waste, real community.</p>
        </div>
      </div>

      <div className="sidebar-divider" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="sidebar-stat">
          <div className="sidebar-stat-num">2.4k</div>
          <div className="sidebar-stat-label">Givers</div>
        </div>
        <div className="sidebar-stat">
          <div className="sidebar-stat-num">8.1k</div>
          <div className="sidebar-stat-label">Items given</div>
        </div>
        <div className="sidebar-stat">
          <div className="sidebar-stat-num">47</div>
          <div className="sidebar-stat-label">Cities</div>
        </div>
        <div className="sidebar-stat">
          <div className="sidebar-stat-num">4.9★</div>
          <div className="sidebar-stat-label">Avg karma</div>
        </div>
      </div>

      <div className="sidebar-divider" />

      <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', lineHeight: 1.6 }}>
        ZeroMart is built on one simple truth — the more you give, the more flows back to you.
        Every item listed at ₹0. Every giver rewarded.
      </div>
    </aside>
  );
}

function DesktopSidebarRight() {
  return (
    <aside className="desktop-sidebar-right">
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--zm-text-muted)' }}>
        Get the app
      </div>

      <a className="sidebar-app-btn" href="#" onClick={e => e.preventDefault()}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>🍎</span>
        <div>
          <div className="sidebar-app-btn-label">Download on the</div>
          <div className="sidebar-app-btn-name">App Store</div>
        </div>
      </a>

      <a className="sidebar-app-btn" href="#" onClick={e => e.preventDefault()}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>▶️</span>
        <div>
          <div className="sidebar-app-btn-label">Get it on</div>
          <div className="sidebar-app-btn-name">Google Play</div>
        </div>
      </a>

      <div className="sidebar-divider" />

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--zm-text-muted)' }}>
        Why ZeroMart?
      </div>

      {[
        { icon: <Package size={13} />, text: 'Give away clutter for free' },
        { icon: <Star size={13} />,   text: 'Earn karma with every gift' },
        { icon: <Zap size={13} />,    text: 'Delivery credits you can use' },
        { icon: <Gift size={13} />,   text: 'Brand vouchers at milestones' },
      ].map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--zm-border)' }}>
          <span style={{ color: 'var(--zm-accent)' }}>{item.icon}</span>
          <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>{item.text}</span>
        </div>
      ))}

      <div className="sidebar-divider" />

      <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--zm-text-dim)', marginBottom: 8, fontStyle: 'italic' }}>
          "I gave away 14 items last month and earned enough credits to offset my delivery for an air fryer. ZeroMart actually works."
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--zm-accent)' }}>MV</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Meera V</div>
            <div style={{ fontSize: 10, color: 'var(--zm-text-dim)' }}>⭐ 115 karma</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Shell() {
  const {
    page, setPage,
    user,
    authGate,
    viewingSeller,
    selectedProduct,
    karmaPopup,
    chatOpen,
    botOpen, setBotOpen,
    listingSheet, setListingSheet,
    buyerPaySheet,
    collectRequest,
    orders,
  } = useApp();

  const activeOrders = orders.filter(o => o.status !== 'delivered').length;

  const navItems = [
    { key: 'home',    icon: <Home size={20} />,        label: 'Home' },
    { key: 'orders',  icon: <ShoppingBag size={20} />, label: 'Orders', badge: activeOrders },
    { key: 'list',    icon: <Plus size={22} />,         label: 'List',  special: true },
    { key: 'sell',    icon: <Tag size={20} />,          label: 'Sell' },
    { key: 'profile', icon: <User size={20} />,         label: 'Profile' },
  ];

  function handleNav(key) {
    if (key === 'list') { setListingSheet(true); return; }
    setPage(key);
  }

  return (
    <div className="desktop-root">
      <DesktopSidebarLeft />

      <div className="desktop-center">
        <div className="app-shell">
          {page === 'home'          && <HomePage />}
          {page === 'orders'        && <OrdersPage />}
          {page === 'sell'          && <SellerPage />}
          {page === 'profile'       && <ProfilePage />}
          {page === 'notifications' && <NotificationsPage />}

          <nav className="bottom-nav">
            {navItems.map(item => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key && item.key !== 'list' ? 'active' : ''}`}
                onClick={() => handleNav(item.key)}
                style={item.special ? {
                  background: 'var(--zm-accent)',
                  color: 'white',
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  padding: 0,
                  boxShadow: '0 4px 16px rgba(124,92,252,0.4)',
                } : {}}
              >
                <div style={{ position: 'relative' }}>
                  {item.icon}
                  {item.badge > 0 && (
                    <div style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 999, background: 'var(--zm-accent)', border: '1.5px solid var(--zm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', padding: '0 3px' }}>
                      {item.badge}
                    </div>
                  )}
                </div>
                {!item.special && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          <button className="bot-btn" onClick={() => setBotOpen(true)} title="Ask ZeroBot">
            <Bot size={22} color="white" />
          </button>

          {selectedProduct && <ProductSheet />}
          {karmaPopup      && <KarmaPopup />}
          {chatOpen        && <TempChat />}
          {botOpen         && <BotAssistant />}
          {listingSheet    && <ListingSheet />}
          {buyerPaySheet   && <BuyerPaySheet />}
          {collectRequest  && <CollectRequestHandler />}
          {authGate        && <OtpSheet />}
          {viewingSeller   && <SellerProfileSheet />}
          <OnboardingTour />
        </div>
      </div>

      <DesktopSidebarRight />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
