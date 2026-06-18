import React, { useState, useEffect } from 'react';
import { Search, MapPin, Bell, Star, Heart, Zap, ChevronRight, Tag, ShoppingBag } from 'lucide-react';
import { useApp, CATEGORIES } from '../context/AppContext';

function ProductCard({ product, onOpen }) {
  const { favourites, toggleFavourite } = useApp();
  const isFav = favourites.includes(product.id);

  return (
    <div className="product-card" onClick={() => onOpen(product)}>
      <div className="product-img" style={{ fontSize: 48, background: 'var(--zm-surface2)' }}>
        <span>{product.emoji}</span>
      </div>
      <div className="product-info">
        <div className="product-name">{product.title}</div>
        <div className="product-meta">
          <span className="product-price">FREE</span>
          <span className="product-dist">{product.distance} km</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="karma-badge">
            <Star size={10} fill="currentColor" /> {product.seller.karma}
          </span>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            onClick={e => { e.stopPropagation(); toggleFavourite(product.id); }}
          >
            <Heart size={14} fill={isFav ? '#ff5f5f' : 'none'} color={isFav ? '#ff5f5f' : 'var(--zm-text-dim)'} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FavouriteSellerRow({ products }) {
  const { favourites, setViewingSeller } = useApp();
  const favProducts = products.filter(p => favourites.includes(p.id));
  const sellers = [...new Map(favProducts.map(p => [p.seller.name, p.seller])).values()];

  if (!sellers.length) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--zm-text)' }}>Favourite sellers</span>
        <span style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>Tap to see their profile</span>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {sellers.map(s => (
          <div key={s.name} onClick={() => setViewingSeller(s)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--zm-accent-soft)', border: '2.5px solid var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--zm-accent)', fontSize: 18, boxShadow: '0 2px 12px rgba(124,92,252,0.2)', transition: 'transform 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {s.initials}
            </div>
            <span style={{ fontSize: 11, color: 'var(--zm-text-muted)', maxWidth: 52, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name.split(' ')[0]}</span>
            <span style={{ fontSize: 10, color: 'var(--zm-amber)', display: 'flex', alignItems: 'center', gap: 2 }}>⭐ {s.karma}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { products, setSelectedProduct, notifications, setPage, user, switchMode } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    setLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Chennai, TN' });
          setLocating(false);
        },
        () => {
          setLocation({ label: 'Chennai, TN' });
          setLocating(false);
        }
      );
    } else {
      setLocation({ label: 'Chennai, TN' });
      setLocating(false);
    }
  }, []);

  const filtered = products.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || p.category === category;
    return matchSearch && matchCat;
  }).sort((a, b) => {
    const aKarma = a.seller.karma;
    const bKarma = b.seller.karma;
    return bKarma - aKarma;
  });

  const topKarma = [...products].sort((a, b) => b.seller.karma - a.seller.karma).slice(0, 4);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ padding: '52px 16px 16px', background: user.mode === 'buyer' ? 'linear-gradient(180deg, rgba(45,212,160,0.1) 0%, transparent 100%)' : 'linear-gradient(180deg, rgba(124,92,252,0.08) 0%, transparent 100%)', transition: 'background 0.4s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: 'var(--zm-text)' }}>
              Zero<span style={{ color: user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-accent)', transition: 'color 0.3s' }}>Mart</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <MapPin size={12} color={user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-green)'} />
              <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>
                {locating ? 'Locating…' : location?.label || 'Chennai, TN'}
              </span>
              <span style={{ fontSize: 11, color: user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-accent)', fontWeight: 600, marginLeft: 4, opacity: 0.8 }}>
                · {user.mode === 'buyer' ? 'Browsing' : 'Giving'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setPage('notifications')}
            style={{ position: 'relative', background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Bell size={18} color="var(--zm-text-muted)" />
            {unread > 0 && (
              <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--zm-accent)' }} />
            )}
          </button>
        </div>

        {/* Mode switcher */}
        <div style={{ display: 'flex', background: 'var(--zm-surface2)', borderRadius: 999, padding: 3, marginBottom: 14, alignSelf: 'flex-start' }}>
          {[
            { mode: 'seller', icon: <Tag size={12} />, label: 'Seller', bg: 'var(--zm-accent)' },
            { mode: 'buyer',  icon: <ShoppingBag size={12} />, label: user.isBuyer ? 'Buyer' : 'Buyer · ₹29', bg: 'var(--zm-green)' },
          ].map(({ mode, icon, label, bg }) => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, border: 'none',
                cursor: user.mode === mode ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                transition: 'all 0.2s',
                background: user.mode === mode ? bg : 'transparent',
                color: user.mode === mode ? 'white' : 'var(--zm-text-dim)',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--zm-text-dim)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="input"
            style={{ paddingLeft: 40 }}
            placeholder="Search clothes, toys, books, electronics…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {CATEGORIES.map(cat => (
          <button key={cat} className={`chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* Favourite sellers */}
      <FavouriteSellerRow products={products} />

      {/* Top karma section */}
      {category === 'All' && !search && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="var(--zm-amber)" fill="var(--zm-amber)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--zm-text)' }}>Top karma sellers</span>
            </div>
            <ChevronRight size={14} color="var(--zm-text-dim)" />
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {topKarma.map(p => (
              <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ flexShrink: 0, width: 120, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{p.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <span className="karma-badge" style={{ fontSize: 11 }}>
                  <Star size={9} fill="currentColor" /> {p.seller.karma}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>
          {filtered.length} {search ? `results for "${search}"` : 'listings near you'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Nothing found</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Try a different keyword or browse all categories</div>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onOpen={setSelectedProduct} />
          ))}
        </div>
      )}
    </div>
  );
}
