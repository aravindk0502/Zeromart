import React, { useState, useRef } from 'react';
import { X, Camera, Check, ChevronDown } from 'lucide-react';
import { useApp, CATEGORIES } from '../context/AppContext';

const CONDITIONS = ['Like New', 'Very Good', 'Good', 'Fair'];

const CATEGORY_EMOJIS = {
  Electronics: '📱', Furniture: '🪑', 'Baby & Kids': '🍼',
  Sports: '⚽', Books: '📚', Appliances: '🍳', Clothing: '👕',
};

export default function ListingSheet() {
  const { listingSheet, setListingSheet, addProduct, requireAuth } = useApp();
  const [photo, setPhoto] = useState(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('Good');
  const [posted, setPosted] = useState(false);
  const fileRef = useRef(null);

  if (!listingSheet) return null;

  function reset() {
    setPhoto(null);
    setTitle('');
    setDesc('');
    setCategory('');
    setCondition('Good');
    setPosted(false);
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (file) setPhoto(URL.createObjectURL(file));
  }

  function canPost() {
    return photo && title.trim() && category;
  }

  function doPost() {
    addProduct({
      title: title.trim(),
      category,
      emoji: CATEGORY_EMOJIS[category] || '📦',
      condition,
      description: desc.trim(),
      photo,
    });
    setPosted(true);
    setTimeout(() => {
      setListingSheet(false);
      reset();
    }, 2000);
  }

  function post() {
    if (!canPost()) return;
    requireAuth(doPost);
  }

  function close() {
    setListingSheet(false);
    reset();
  }

  const cats = CATEGORIES.filter(c => c !== 'All');

  return (
    <div className="overlay">
      <div className="sheet">
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
            <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Your item is now live. Nearby buyers will be notified.</div>
          </div>
        ) : (
          <>
            {/* Photo */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{ height: 160, borderRadius: 16, border: `2px dashed ${photo ? 'var(--zm-accent)' : 'var(--zm-border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 14, overflow: 'hidden', background: photo ? 'transparent' : 'var(--zm-surface2)' }}
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
            <div style={{ marginBottom: 14 }}>
              <textarea
                className="input textarea"
                placeholder="Any extra details? (optional)"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                style={{ fontSize: 13, minHeight: 64 }}
              />
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
              {!photo ? 'Add a photo to continue' : !title.trim() ? 'Add a title to continue' : !category ? 'Pick a category to continue' : "Post listing — it's free"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
