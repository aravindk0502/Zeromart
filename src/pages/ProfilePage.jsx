import React from 'react';
import { Star, Package, Heart, Settings, ChevronRight, LogOut, Zap, Gift } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ProfilePage() {
  const { user, switchMode, products, favourites, userListings } = useApp();
  const favProducts = products.filter(p => favourites.includes(p.id));

  return (
    <div className="page-content" style={{ padding: '52px 16px 80px' }}>
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 16, padding: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-accent-soft)', border: '2px solid var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, color: 'var(--zm-accent)', flexShrink: 0 }}>
          {user.initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 2 }}>{user.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', gap: 6 }}>
            <span className="karma-badge"><Star size={10} fill="currentColor" /> {user.karma} karma</span>
            <span className={`badge ${user.isBuyer ? 'badge-green' : 'badge-purple'}`}>{user.isBuyer ? 'Buyer ✓' : 'Seller'}</span>
          </div>
        </div>
      </div>

      {/* Mode switcher */}
      <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', marginBottom: 10 }}>Current mode</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => switchMode('seller')}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${user.mode === 'seller' ? 'var(--zm-accent)' : 'var(--zm-border)'}`, background: user.mode === 'seller' ? 'var(--zm-accent-soft)' : 'transparent', color: user.mode === 'seller' ? 'var(--zm-accent)' : 'var(--zm-text-muted)', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            🏷️ Seller
          </button>
          <button
            onClick={() => switchMode('buyer')}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-border)'}`, background: user.mode === 'buyer' ? 'var(--zm-green-soft)' : 'transparent', color: user.mode === 'buyer' ? 'var(--zm-green)' : 'var(--zm-text-muted)', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            🛍️ Buyer {!user.isBuyer && '— ₹29'}
          </button>
        </div>
        {!user.isBuyer && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--zm-text-dim)', textAlign: 'center' }}>
            Pay ₹29 once to unlock buyer access forever
          </div>
        )}
      </div>

      {/* Wallet */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 14, padding: 14 }}>
          <Zap size={16} color="var(--zm-green)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--zm-green)', marginBottom: 2 }}>{user.credits}</div>
          <div style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>Delivery credits</div>
        </div>
        <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 14, padding: 14 }}>
          <Gift size={16} color="var(--zm-accent)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--zm-accent)', marginBottom: 2 }}>{user.vouchers}</div>
          <div style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>Vouchers ready</div>
        </div>
      </div>

      {/* Saved items */}
      {favProducts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Saved items</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {favProducts.map(p => (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{p.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{p.distance} km away • {p.seller.name}</div>
                </div>
                <span className="product-price" style={{ fontSize: 13 }}>FREE</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[
          { icon: <Package size={16} />, label: 'My listings', count: userListings.length },
          { icon: <Heart size={16} />, label: 'Saved items', count: favProducts.length },
          { icon: <Star size={16} />, label: 'Karma history' },
          { icon: <Settings size={16} />, label: 'Settings' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--zm-card)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--zm-text-muted)' }}>{item.icon}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{item.label}</span>
            {item.count !== undefined && <span className="badge badge-purple" style={{ fontSize: 11 }}>{item.count}</span>}
            <ChevronRight size={14} color="var(--zm-text-dim)" />
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', color: 'var(--zm-red)' }}>
          <LogOut size={16} />
          <span style={{ fontSize: 14 }}>Sign out</span>
        </div>
      </div>
    </div>
  );
}
