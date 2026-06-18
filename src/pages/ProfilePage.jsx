import React, { useState } from 'react';
import { Star, Package, Heart, Settings, ChevronRight, LogOut, Zap, Gift, X, Bell, Shield, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';

function SettingsSheet({ onClose }) {
  const { user, setUser } = useApp();
  const [name, setName] = useState(user.name || '');

  function saveName() {
    if (name.trim()) setUser(prev => ({ ...prev, name: name.trim(), initials: name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }));
    onClose();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Display name</div>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Phone</div>
          <div className="input" style={{ color: 'var(--zm-text-dim)', fontSize: 14 }}>+91 {user.phone || '—'}</div>
        </div>

        {[
          { icon: <Bell size={15} />, label: 'Notification preferences', sub: 'All alerts on' },
          { icon: <Shield size={15} />, label: 'Privacy & data', sub: 'Your data is safe' },
          { icon: <Info size={15} />, label: 'About ZeroMart', sub: 'v1.0 · Terms & Privacy' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--zm-border)' }}>
            <span style={{ color: 'var(--zm-accent)' }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{item.sub}</div>
            </div>
            <ChevronRight size={14} color="var(--zm-text-dim)" />
          </div>
        ))}

        <button className="btn btn-primary btn-full" style={{ marginTop: 20 }} onClick={saveName}>Save changes</button>
      </div>
    </div>
  );
}

function KarmaHistorySheet({ onClose }) {
  const { user } = useApp();
  const events = user.karma > 0
    ? Array.from({ length: user.karma }, (_, i) => ({ label: `Item ${i + 1} given`, pts: 1, time: `${i + 1} day${i > 0 ? 's' : ''} ago` }))
    : [];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>Karma history</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, padding: 16, background: 'var(--zm-accent-soft)', borderRadius: 12 }}>
          <Star size={20} color="var(--zm-amber)" fill="var(--zm-amber)" />
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--zm-amber)' }}>{user.karma}</span>
          <span style={{ fontSize: 14, color: 'var(--zm-text-muted)' }}>total karma</span>
        </div>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--zm-text-dim)', fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⭐</div>
            Give items away to earn karma points
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--zm-border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--zm-amber-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={14} color="var(--zm-amber)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{e.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{e.time}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--zm-amber)' }}>+{e.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, switchMode, products, favourites, userListings, setPage, signOut } = useApp();
  const favProducts = products.filter(p => favourites.includes(p.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [karmaOpen, setKarmaOpen] = useState(false);

  function handleSignOut() {
    signOut(); // signOut already navigates to home and resets state
  }

  return (
    <div className="page-content" style={{ padding: '52px 16px 80px' }}>
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 16, padding: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-accent-soft)', border: '2px solid var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, color: 'var(--zm-accent)', flexShrink: 0 }}>
          {user.initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 2 }}>{user.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
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

      {/* Saved items preview */}
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
          { icon: <Package size={16} />, label: 'My listings', count: userListings.length, onClick: () => setPage('sell') },
          { icon: <Heart size={16} />, label: 'Saved items', count: favProducts.length, onClick: () => setPage('home') },
          { icon: <Star size={16} />, label: 'Karma history', onClick: () => setKarmaOpen(true) },
          { icon: <Settings size={16} />, label: 'Settings', onClick: () => setSettingsOpen(true) },
        ].map((item, i) => (
          <div
            key={i}
            onClick={item.onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--zm-card)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--zm-text-muted)' }}>{item.icon}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{item.label}</span>
            {item.count !== undefined && <span className="badge badge-purple" style={{ fontSize: 11 }}>{item.count}</span>}
            <ChevronRight size={14} color="var(--zm-text-dim)" />
          </div>
        ))}

        <div
          onClick={handleSignOut}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', color: 'var(--zm-red)', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--zm-red-soft, rgba(239,68,68,0.08))'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={16} />
          <span style={{ fontSize: 14 }}>Sign out</span>
        </div>
      </div>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {karmaOpen    && <KarmaHistorySheet onClose={() => setKarmaOpen(false)} />}
    </div>
  );
}
