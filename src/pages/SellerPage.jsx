import React from 'react';
import { Star, Zap, Gift, Package, Award } from 'lucide-react';
import { useApp } from '../context/AppContext';

const KARMA_MILESTONES = [
  { at: 5, reward: 'Swiggy ₹50 voucher', icon: '🍔', unlocked: true },
  { at: 10, reward: 'BookMyShow ₹100 voucher', icon: '🎬', unlocked: true },
  { at: 25, reward: 'Myntra ₹200 voucher', icon: '👗', unlocked: false },
  { at: 50, reward: 'Nykaa ₹300 voucher', icon: '💄', unlocked: false },
];

export default function SellerPage() {
  const { user, userListings, setListingSheet, triggerKarmaPopup } = useApp();

  const nextMilestone = KARMA_MILESTONES.find(m => m.at > user.karma);
  const progress = nextMilestone ? (user.karma / nextMilestone.at) * 100 : 100;

  return (
    <div className="page-content" style={{ padding: '52px 0 80px' }}>
      {/* Header */}
      <div style={{ padding: '0 16px 20px', background: 'linear-gradient(180deg, rgba(124,92,252,0.08) 0%, transparent 100%)' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 2 }}>My Seller Hub</div>
          <div style={{ fontSize: 12, color: 'var(--zm-amber)', fontStyle: 'italic' }}>✨ Do good. Get good. — every item given sends good karma back.</div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Star size={14} color="var(--zm-amber)" fill="var(--zm-amber)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-amber)' }}>{user.karma}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-muted)' }}>Good karma</div>
          </div>
          <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Zap size={14} color="var(--zm-green)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-green)' }}>{user.credits}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-muted)' }}>Credits</div>
          </div>
          <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Gift size={14} color="var(--zm-accent)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--zm-accent)' }}>{user.vouchers}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-muted)' }}>Vouchers</div>
          </div>
        </div>

        {/* Karma progress */}
        {nextMilestone && (
          <div style={{ background: 'var(--zm-card)', border: '1px solid var(--zm-border)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>Give {nextMilestone.at - user.karma} more to unlock</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{nextMilestone.icon} {nextMilestone.reward}</span>
            </div>
            <div style={{ height: 6, background: 'var(--zm-surface2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--zm-amber)', borderRadius: 999, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{user.karma} karma</span>
              <span style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{nextMilestone.at} karma</span>
            </div>
          </div>
        )}
      </div>

      {/* Add listing button */}
      <div style={{ padding: '0 16px', marginBottom: 20 }}>
        <button className="btn btn-primary btn-full" onClick={() => setListingSheet(true)} style={{ fontSize: 15, padding: '14px 20px' }}>
          <Package size={18} />
          List something for free
        </button>
      </div>

      {/* My listings */}
      <div style={{ padding: '0 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="section-title" style={{ marginBottom: 0 }}>My listings</span>
          <span style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>{userListings.length} active</span>
        </div>
        {userListings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--zm-text-dim)', fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
            Nothing listed yet. Tap the button above to get started!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {userListings.map(listing => (
              <div key={listing.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zm-surface2)', borderRadius: 10, flexShrink: 0, overflow: 'hidden' }}>
                  {listing.photo
                    ? <img src={listing.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : listing.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{listing.category} · {listing.condition}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginBottom: 4 }}>{listing.listed}</div>
                  <span className="badge badge-green" style={{ fontSize: 10 }}>Active</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Milestones */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Award size={16} color="var(--zm-amber)" />
          <span className="section-title" style={{ marginBottom: 0 }}>Karma milestones</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {KARMA_MILESTONES.map(m => (
            <div key={m.at} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: m.unlocked ? 1 : 0.5 }}>
              <div style={{ fontSize: 24 }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.reward}</div>
                <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>Give {m.at} items away</div>
              </div>
              <span className={`badge ${m.unlocked ? 'badge-green' : ''}`} style={{ fontSize: 11, background: m.unlocked ? undefined : 'var(--zm-surface2)', color: m.unlocked ? undefined : 'var(--zm-text-dim)' }}>
                {m.unlocked ? '✓ Unlocked' : `${m.at - user.karma} to go`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Demo karma popup button */}
      <div style={{ padding: '20px 16px 0' }}>
        <button className="btn btn-secondary btn-full btn-sm" onClick={() => triggerKarmaPopup({ name: 'Ravi K', initials: 'RK' })}>
          Demo: trigger karma popup
        </button>
      </div>
    </div>
  );
}
