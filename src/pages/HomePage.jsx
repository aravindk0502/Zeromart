import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Bell, Star, Heart, Zap, ChevronRight, Tag, ShoppingBag, X, Loader } from 'lucide-react';
import { useApp, CATEGORIES } from '../context/AppContext';

async function reverseGeocode(lat, lon) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    const a = data.address || {};
    return a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.city || '';
  } catch { return ''; }
}

async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=in&addressdetails=1`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    return data.map(r => {
      const a = r.address || {};
      const label = a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.city || r.display_name.split(',')[0];
      const city  = a.city || a.town || a.state_district || '';
      return { label, city, display: city ? `${label}, ${city}` : label };
    }).filter((r, i, arr) => arr.findIndex(x => x.label === r.label) === i);
  } catch { return []; }
}

function ProductCard({ product, onOpen }) {
  const { favourites, toggleFavourite } = useApp();
  const isFav = favourites.includes(product.id);

  return (
    <div className="product-card" onClick={() => onOpen(product)} style={{ position: 'relative' }}>
      {product.isOwn && (
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'var(--zm-accent)', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 6, padding: '2px 6px', zIndex: 1 }}>
          YOUR LISTING
        </div>
      )}
      <div className="product-img" style={{ fontSize: 48, background: 'var(--zm-surface2)', overflow: 'hidden' }}>
        {product.photo
          ? <img src={product.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>{product.emoji}</span>}
      </div>
      <div className="product-info">
        <div className="product-name">{product.title}</div>
        <div className="product-meta">
          <span className="product-price">FREE</span>
          <span className="product-dist">
            {product.area ? `📍 ${product.area}` : `${product.distance} km`}
          </span>
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
        <span style={{ fontSize: 14, fontWeight: 600 }}>Favourite sellers</span>
        <span style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>Tap to see their profile</span>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {sellers.map(s => (
          <div key={s.name} onClick={() => setViewingSeller(s)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--zm-accent-soft)', border: '2.5px solid var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--zm-accent)', fontSize: 18 }}>
              {s.initials}
            </div>
            <span style={{ fontSize: 11, color: 'var(--zm-text-muted)', maxWidth: 52, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name.split(' ')[0]}</span>
            <span style={{ fontSize: 10, color: 'var(--zm-amber)' }}>⭐ {s.karma}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { products, setSelectedProduct, notifications, setPage, user, switchMode } = useApp();
  const [search, setSearch]         = useState('');
  const [category, setCategory]     = useState('All');
  const [areaLabel, setAreaLabel]   = useState('');
  const [locating, setLocating]     = useState(true);
  const [editingLoc, setEditingLoc] = useState(false);
  const [locInput, setLocInput]     = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const locInputRef                 = useRef(null);
  const debounceRef                 = useRef(null);
  const unread = notifications.filter(n => !n.read).length;

  // Auto-detect location on mount
  useEffect(() => {
    if (!navigator.geolocation) { setAreaLabel(''); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setAreaLabel(place);
        setLocating(false);
      },
      () => { setAreaLabel(''); setLocating(false); },
      { timeout: 6000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => {
    if (editingLoc) setTimeout(() => locInputRef.current?.focus(), 50);
  }, [editingLoc]);

  // Debounced autocomplete search
  function handleLocInput(val) {
    setLocInput(val);
    setSuggestions([]);
    clearTimeout(debounceRef.current);
    if (!val.trim() || val.length < 2) { setSuggesting(false); return; }
    setSuggesting(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(val);
      setSuggestions(results);
      setSuggesting(false);
    }, 350);
  }

  function pickSuggestion(s) {
    setAreaLabel(s.label);
    setLocInput('');
    setSuggestions([]);
    setEditingLoc(false);
  }

  function applyLocation() {
    if (locInput.trim()) setAreaLabel(locInput.trim());
    setLocInput('');
    setSuggestions([]);
    setEditingLoc(false);
  }

  function clearLocation() {
    setAreaLabel('');
    setLocInput('');
    setSuggestions([]);
    setEditingLoc(false);
  }

  // Filter: own listings always appear first, then by search/category/area
  const ownListings = products.filter(p => p.isOwn);
  const otherProducts = products.filter(p => !p.isOwn);

  const filterFn = p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
    const matchCat    = category === 'All' || p.category === category;
    const matchArea   = !areaLabel || !p.area || p.area.toLowerCase().includes(areaLabel.toLowerCase()) || areaLabel.toLowerCase().includes(p.area.toLowerCase());
    return matchSearch && matchCat && matchArea;
  };

  const filtered = [
    ...ownListings.filter(filterFn),
    ...otherProducts.filter(filterFn).sort((a, b) => b.seller.karma - a.seller.karma),
  ];

  const topKarma = [...products].sort((a, b) => b.seller.karma - a.seller.karma).slice(0, 4);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ padding: '52px 16px 16px', background: user.mode === 'buyer' ? 'linear-gradient(180deg, rgba(45,212,160,0.1) 0%, transparent 100%)' : 'linear-gradient(180deg, rgba(124,92,252,0.08) 0%, transparent 100%)', transition: 'background 0.4s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>
              Zero<span style={{ color: user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-accent)', transition: 'color 0.3s' }}>Mart</span>
            </div>

            {/* Location chip — click to change, with autocomplete */}
            {editingLoc ? (
              <div style={{ position: 'relative', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={11} color="var(--zm-accent)" />
                  <input
                    ref={locInputRef}
                    value={locInput}
                    onChange={e => handleLocInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') applyLocation(); if (e.key === 'Escape') { setEditingLoc(false); setSuggestions([]); } }}
                    placeholder="Type area, city…"
                    style={{ fontSize: 12, background: 'var(--zm-surface2)', border: '1px solid var(--zm-accent)', borderRadius: 8, padding: '4px 8px', color: 'var(--zm-text)', outline: 'none', width: 150 }}
                  />
                  {suggesting && <Loader size={11} color="var(--zm-accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  <button onClick={applyLocation} style={{ fontSize: 11, color: 'var(--zm-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>Set</button>
                  <button onClick={clearLocation} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-dim)', display: 'flex', flexShrink: 0 }}><X size={12} /></button>
                </div>
                {/* Autocomplete dropdown */}
                {suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, marginTop: 4, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => pickSuggestion(s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--zm-border)' : 'none', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--zm-surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <MapPin size={12} color="var(--zm-green)" style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--zm-text)' }}>{s.label}</div>
                          {s.city && s.city !== s.label && <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{s.city}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setLocInput(''); setSuggestions([]); setEditingLoc(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <MapPin size={11} color="var(--zm-green)" />
                <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>
                  {locating ? 'Detecting…' : areaLabel || 'Set your location'}
                </span>
                {locating && <Loader size={10} color="var(--zm-accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                {!locating && <span style={{ fontSize: 10, color: 'var(--zm-accent)' }}>· change</span>}
              </button>
            )}
          </div>

          <button
            onClick={() => setPage('notifications')}
            style={{ position: 'relative', background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Bell size={18} color="var(--zm-text-muted)" />
            {unread > 0 && <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--zm-accent)' }} />}
          </button>
        </div>

        {/* Mode switcher */}
        <div style={{ display: 'flex', background: 'var(--zm-surface2)', borderRadius: 999, padding: 3, marginBottom: 14, alignSelf: 'flex-start' }}>
          {[
            { mode: 'seller', icon: <Tag size={12} />, label: 'Seller', bg: 'var(--zm-accent)' },
            { mode: 'buyer',  icon: <ShoppingBag size={12} />, label: user.isBuyer ? 'Buyer' : 'Buyer · ₹29', bg: 'var(--zm-green)' },
          ].map(({ mode, icon, label, bg }) => (
            <button key={mode} onClick={() => switchMode(mode)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, border: 'none', cursor: user.mode === mode ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, transition: 'all 0.2s', background: user.mode === mode ? bg : 'transparent', color: user.mode === mode ? 'white' : 'var(--zm-text-dim)' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--zm-text-dim)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search clothes, toys, books, electronics…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Category chips */}
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {CATEGORIES.map(cat => (
          <button key={cat} className={`chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>{cat}</button>
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
              <span style={{ fontSize: 14, fontWeight: 600 }}>Top karma sellers</span>
            </div>
            <ChevronRight size={14} color="var(--zm-text-dim)" />
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {topKarma.map(p => (
              <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ flexShrink: 0, width: 120, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{p.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <span className="karma-badge" style={{ fontSize: 11 }}><Star size={9} fill="currentColor" /> {p.seller.karma}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results count */}
      <div style={{ padding: '0 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>
          {filtered.length} {search ? `results for "${search}"` : areaLabel ? `listings in ${areaLabel}` : 'listings near you'}
        </span>
        {areaLabel && (
          <button onClick={clearLocation} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--zm-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={10} /> Clear location
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Nothing found</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Try a different keyword or clear the location filter</div>
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
