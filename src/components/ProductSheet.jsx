import React, { useState } from 'react';
import { X, MapPin, Star, Truck, Users, Heart, Flag } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ProductSheet() {
  const { selectedProduct, setSelectedProduct, user, favourites, toggleFavourite, triggerKarmaPopup, setCollectRequest, setBuyerPaySheet, requireAuth, setViewingSeller } = useApp();
  const [requested, setRequested] = useState(false);
  const [collectSent, setCollectSent] = useState(false);

  if (!selectedProduct) return null;
  const p = selectedProduct;
  const isFav = favourites.includes(p.id);

  function doDelivery() {
    if (!user.isBuyer) { setBuyerPaySheet(true); return; }
    setRequested(true);
    setTimeout(() => {
      setSelectedProduct(null);
      setRequested(false);
      triggerKarmaPopup(p.seller);
    }, 1500);
  }

  function doCollect() {
    if (!user.isBuyer) { setBuyerPaySheet(true); return; }
    setCollectSent(true);
    setTimeout(() => {
      setSelectedProduct(null);
      setCollectSent(false);
      setCollectRequest({ product: p, status: 'pending' });
    }, 1000);
  }

  function handleDelivery() { requireAuth(doDelivery); }
  function handleCollect()  { requireAuth(doCollect);  }

  return (
    <div className="overlay" onClick={() => setSelectedProduct(null)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', flex: 1, maxWidth: 40, margin: '0 auto' }} />
          <button onClick={() => setSelectedProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)', marginLeft: 'auto' }}>
            <X size={20} />
          </button>
        </div>

        {/* Product image */}
        <div style={{ fontSize: 80, textAlign: 'center', background: 'var(--zm-surface2)', borderRadius: 16, padding: '24px 0', marginBottom: 16 }}>
          {p.emoji}
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 4 }}>{p.title}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge badge-green" style={{ fontSize: 11 }}>FREE</span>
              <span className="badge badge-purple" style={{ fontSize: 11 }}>{p.condition}</span>
              <span className="badge" style={{ fontSize: 11, background: 'var(--zm-surface2)', color: 'var(--zm-text-muted)' }}>{p.category}</span>
            </div>
          </div>
          <button onClick={() => toggleFavourite(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Heart size={22} fill={isFav ? '#ff5f5f' : 'none'} color={isFav ? '#ff5f5f' : 'var(--zm-text-muted)'} />
          </button>
        </div>

        {/* Description */}
        <div style={{ fontSize: 14, color: 'var(--zm-text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          {p.description}
        </div>

        <div className="divider" />

        {/* Seller */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }} onClick={() => { setSelectedProduct(null); setViewingSeller(p.seller); }}>
          <div className="avatar" style={{ border: '2px solid var(--zm-accent)' }}>{p.seller.initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{p.seller.name}</div>
            <span className="karma-badge" style={{ fontSize: 11 }}>
              <Star size={10} fill="currentColor" /> {p.seller.karma} good karma
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} color="var(--zm-green)" />
            <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>{p.distance} km</span>
          </div>
        </div>

        {/* Location info */}
        <div style={{ background: 'var(--zm-surface2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color="var(--zm-text-dim)" />
          <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>Listed {p.listed} • Chennai, TN</span>
        </div>

        {/* Actions */}
        {p.nearbyEligible && p.distance < 1 && (
          <button
            className="btn btn-green btn-full"
            style={{ marginBottom: 10, fontSize: 14 }}
            onClick={handleCollect}
            disabled={collectSent}
          >
            <Users size={16} />
            {collectSent ? 'Request sent…' : `📍 Request in-person collect (${p.distance} km away)`}
          </button>
        )}

        <button
          className="btn btn-primary btn-full"
          style={{ fontSize: 14, marginBottom: 10 }}
          onClick={handleDelivery}
          disabled={requested}
        >
          <Truck size={16} />
          {requested ? 'Requesting delivery…' : 'Request with delivery'}
        </button>

        {!user.isBuyer && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--zm-text-dim)', marginBottom: 8 }}>
            Unlock buyer access for ₹29 once — yours forever
          </div>
        )}

        <button className="btn btn-ghost btn-full btn-sm" style={{ color: 'var(--zm-text-dim)', fontSize: 12 }}>
          <Flag size={12} /> Report listing
        </button>
      </div>
    </div>
  );
}
