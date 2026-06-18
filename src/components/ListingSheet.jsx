import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Check, MapPin, Loader } from 'lucide-react';
import { useApp, CATEGORIES } from '../context/AppContext';

const CONDITIONS = ['Like New', 'Very Good', 'Good', 'Fair'];

const CATEGORY_EMOJIS = {
  Electronics: '📱', Furniture: '🪑', 'Baby & Kids': '🍼',
  Sports: '⚽', Books: '📚', Appliances: '🍳', Clothing: '👕',
};

async function reverseGeocode(lat, lon) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    const addr = data.address || {};
    return addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || addr.city || '';
  } catch { return ''; }
}

async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in&addressdetails=1`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    return data.map(r => {
      const a = r.address || {};
      const label = a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.city || r.display_name.split(',')[0];
      const city  = a.city || a.town || a.state_district || '';
      return { label, city };
    }).filter((r, i, arr) => arr.findIndex(x => x.label === r.label) === i);
  } catch { return []; }
}

export default function ListingSheet() {
  const { listingSheet, setListingSheet, addProduct, requireAuth, setPage } = useApp();
  const [photo, setPhoto]       = useState(null);
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('Good');
  const [area, setArea]           = useState('');
  const [locStatus, setLocStatus] = useState('idle');
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting]   = useState(false);
  const [posted, setPosted]       = useState(false);
  const fileRef    = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!listingSheet) return;
    // Auto-detect location when sheet opens
    if (!navigator.geolocation) { setLocStatus('manual'); return; }
    setLocStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setArea(prev => prev || place); // don't overwrite if user already typed
        setLocStatus(place ? 'found' : 'manual');
      },
      () => setLocStatus('denied'),
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, [listingSheet]);

  if (!listingSheet) return null;

  function reset() {
    setPhoto(null); setTitle(''); setDesc('');
    setCategory(''); setCondition('Good');
    setArea(''); setLocStatus('idle'); setSuggestions([]); setPosted(false);
  }

  function handleAreaInput(val) {
    setArea(val);
    setLocStatus('manual');
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
    setArea(s.label);
    setSuggestions([]);
    setLocStatus('manual');
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (file) setPhoto(URL.createObjectURL(file));
  }

  function canPost() { return photo && title.trim() && category; }

  function doPost() {
    addProduct({
      title: title.trim(), category,
      emoji: CATEGORY_EMOJIS[category] || '📦',
      condition, description: desc.trim(),
      photo, area: area.trim(),
    });
    setPosted(true);
    setTimeout(() => {
      setListingSheet(false);
      reset();
      setPage('home'); // take user to home feed so they see their listing
    }, 1800);
  }

  function post() { if (!canPost()) return; requireAuth(doPost); }
  function close() { setListingSheet(false); reset(); }

  const cats = CATEGORIES.filter(c => c !== 'All');

  return (
    <div className="overlay">
      <div className="sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>List for free</div>
            <div style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>Photo · details · live instantly</div>
          </div>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {posted ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-green-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={32} color="var(--zm-green)" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>Listed! 🎉</div>
            <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>
              Your item is now live{area ? ` in ${area}` : ''}. Nearby buyers will be notified.
            </div>
          </div>
        ) : (
          <>
            {/* Photo */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{ height: 140, borderRadius: 16, border: `2px dashed ${photo ? 'var(--zm-accent)' : 'var(--zm-border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 12, overflow: 'hidden', background: photo ? 'transparent' : 'var(--zm-surface2)' }}
            >
              {photo ? (
                <img src={photo} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <Camera size={28} color="var(--zm-text-dim)" style={{ marginBottom: 6 }} />
                  <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Tap to add a photo</span>
                  <span style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 2 }}>Required</span>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />

            {/* Title */}
            <div style={{ marginBottom: 10 }}>
              <input
                className="input"
                placeholder="What are you giving away? (e.g. Sony Speaker)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={60}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      border: `1px solid ${category === cat ? 'var(--zm-accent)' : 'var(--zm-border)'}`,
                      background: category === cat ? 'var(--zm-accent-soft)' : 'transparent',
                      color: category === cat ? 'var(--zm-accent)' : 'var(--zm-text-muted)',
                    }}
                  >
                    {CATEGORY_EMOJIS[cat]} {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Condition</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {CONDITIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    style={{
                      flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      border: `1px solid ${condition === c ? 'var(--zm-green)' : 'var(--zm-border)'}`,
                      background: condition === c ? 'var(--zm-green-soft)' : 'transparent',
                      color: condition === c ? 'var(--zm-green)' : 'var(--zm-text-muted)',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 12 }}>
              <textarea
                className="input textarea"
                placeholder="Any extra details? (optional)"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                style={{ fontSize: 13, minHeight: 56 }}
              />
            </div>

            {/* Location with autocomplete */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> Pickup location
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  placeholder="Type area or city…"
                  value={area}
                  onChange={e => handleAreaInput(e.target.value)}
                  style={{ paddingRight: 36 }}
                  autoComplete="off"
                />
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                  {(locStatus === 'detecting' || suggesting) && <Loader size={14} color="var(--zm-accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {locStatus === 'found' && !suggesting && <MapPin size={14} color="var(--zm-green)" />}
                </div>

                {/* Dropdown */}
                {suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        onMouseDown={e => { e.preventDefault(); pickSuggestion(s); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--zm-border)' : 'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--zm-surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <MapPin size={12} color="var(--zm-green)" style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                          {s.city && s.city !== s.label && <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{s.city}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 4 }}>
                {locStatus === 'detecting' && 'Detecting your location…'}
                {locStatus === 'found'     && '📍 Current location detected — edit if needed'}
                {locStatus === 'denied'    && 'Location access denied — type your area above'}
                {(locStatus === 'idle' || locStatus === 'manual') && 'Start typing to search for your area'}
              </div>
            </div>

            {/* Price row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--zm-surface2)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Listing price</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--zm-green)' }}>₹0 — FREE</span>
            </div>

            <button
              className="btn btn-primary btn-full"
              style={{ fontSize: 15, padding: '14px' }}
              onClick={post}
              disabled={!canPost()}
            >
              {!photo ? 'Add a photo to continue'
                : !title.trim() ? 'Add a title to continue'
                : !category ? 'Pick a category to continue'
                : "Post listing — it's free"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
