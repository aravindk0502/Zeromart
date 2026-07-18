import React, { useState } from 'react';
import { X, ShoppingBag, CheckCircle, Zap, Star } from 'lucide-react';

export default function BuyerPaySheet({ open, onClose, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handlePay() {
    setError('');
    setLoading(true);
    try {
      setTimeout(() => {
        onComplete();
        setLoading(false);
      }, 900);
    } catch (err) {
      setError(err.message || 'Payment failed. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className="overlay">
      <div className="sheet">
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 20px' }} />

        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ShoppingBag size={28} color="var(--zm-accent)" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>Platform fee for buyer access</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.6 }}>
            Pay ₹29 once per year for buyer access.<br />Then request any ₹0 item on Drizn.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {[
            { icon: <ShoppingBag size={14} />, text: 'Request any listed item' },
            { icon: <Zap size={14} />,         text: 'In-person collect for nearby items' },
            { icon: <Star size={14} />,        text: 'Give karma to sellers' },
            { icon: <CheckCircle size={14} />, text: 'Save favourite sellers and items' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--zm-surface2)', borderRadius: 10 }}>
              <span style={{ color: 'var(--zm-accent)' }}>{item.icon}</span>
              <span style={{ fontSize: 14 }}>{item.text}</span>
              <CheckCircle size={14} color="var(--zm-green)" style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'Sora, sans-serif', color: 'var(--zm-accent)' }}>₹29</div>
          <div style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>Once per year • Full buyer access • No auto-renew</div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--zm-red)', textAlign: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--zm-red-soft)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          style={{ fontSize: 16, padding: '15px' }}
          onClick={handlePay}
          disabled={loading}
        >
          {loading ? 'Opening payment…' : 'Pay ₹29 for yearly access'}
        </button>

        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
