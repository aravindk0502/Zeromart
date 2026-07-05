import React from 'react';
import { X, Star, Package, Heart, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

const MEMBER_SINCE = { 'Ravi K': 'Jan 2024', 'Priya M': 'Mar 2024', 'Ananya R': 'Nov 2023', 'Karthik S': 'Feb 2024', 'Meera V': 'Sep 2023', 'Suresh P': 'Apr 2024', 'Lakshmi T': 'Dec 2023', 'Vikram B': 'May 2024' };
const SELLER_BIO = {
  'Ravi K': 'Moving often, always decluttering. Electronics and gadgets mostly.',
  'Priya M': 'Home downsizing. Good furniture looking for good homes.',
  'Ananya R': 'Mom of two. Love passing on baby gear to young families.',
  'Karthik S': 'Fitness enthusiast. Sports gear that deserves more use.',
  'Meera V': 'Educator. Books should never gather dust.',
  'Suresh P': 'Kitchen upgrade mode. Passing on perfectly good appliances.',
  'Lakshmi T': 'Kids outgrow things fast — happy to pass them on.',
  'Vikram B': 'Startup founder, casual dress code now. Formal stuff free to a good home.',
};

export default function SellerProfileSheet() {
  const { viewingSeller, setViewingSeller, products, setSelectedProduct, favourites, toggleFavourite } = useApp();

  if (!viewingSeller) return null;

  const sellerProducts = products.filter(p => p.seller.name === viewingSeller.name);
  const itemsGiven = Math.max(0, viewingSeller.karma - 5);
  const bio = SELLER_BIO[viewingSeller.name] || 'Giving away things I no longer need.';
  const since = MEMBER_SINCE[viewingSeller.name] || '2024';

  function open(product) {
    setViewingSeller(null);
    setSelectedProduct(product);
  }

  return (
    <div className="overlay" onClick={() => setViewingSeller(null)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 20px' }} />

        {/* Close */}
        <button onClick={() => setViewingSeller(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
          <X size={18} />
        </button>

        {/* Profile header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--zm-accent-soft)', border: '3px solid var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'var(--zm-accent)', marginBottom: 12 }}>
            {viewingSeller.initials}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 4 }}>{viewingSeller.name}</div>
          <div style={{ fontSize: 12, color: 'var(--zm-text-dim)', marginBottom: 12 }}>Member since {since}</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.6, maxWidth: 280 }}>{bio}</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--zm-surface2)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Star size={13} color="var(--zm-amber)" fill="var(--zm-amber)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-amber)' }}>{viewingSeller.karma}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--zm-text-dim)' }}>Good karma</div>
          </div>
          <div style={{ background: 'var(--zm-surface2)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Package size={13} color="var(--zm-green)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-green)' }}>{itemsGiven}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--zm-text-dim)' }}>Items given</div>
          </div>
          <div style={{ background: 'var(--zm-surface2)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Zap size={13} color="var(--zm-accent)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-accent)' }}>{sellerProducts.length}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--zm-text-dim)' }}>Listed now</div>
          </div>
        </div>

        {/* Karma philosophy badge */}
        <div style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.12), rgba(124,92,252,0.08))', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--zm-amber)', marginBottom: 2 }}>Do good. Get good.</div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', lineHeight: 1.5 }}>
              {viewingSeller.name.split(' ')[0]} has given {itemsGiven} items — good karma flows back to generous givers.
            </div>
          </div>
        </div>

        {/* Listings */}
        {sellerProducts.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--zm-text)', marginBottom: 10 }}>
              Active listings ({sellerProducts.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sellerProducts.map(p => {
                const isFav = favourites.includes(p.id);
                return (
                  <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => open(p)}>
                    <div style={{ fontSize: 28, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zm-surface2)', borderRadius: 10, flexShrink: 0 }}>
                      {p.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 2 }}>{p.distance} km away · {p.condition}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--zm-green)' }}>₹0</span>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={e => { e.stopPropagation(); toggleFavourite(p.id); }}
                      >
                        <Heart size={13} fill={isFav ? '#ff5f5f' : 'none'} color={isFav ? '#ff5f5f' : 'var(--zm-text-dim)'} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {sellerProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--zm-text-dim)', fontSize: 13 }}>
            No active listings right now. Check back soon!
          </div>
        )}
      </div>
    </div>
  );
}
