import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function KarmaPopup() {
  const { karmaPopup, closeKarmaPopup } = useApp();
  const [given, setGiven] = useState(false);
  const [note, setNote] = useState('');

  if (!karmaPopup) return null;

  function handleGive() {
    setGiven(true);
    setTimeout(() => {
      closeKarmaPopup();
      setGiven(false);
      setNote('');
    }, 1800);
  }

  return (
    <div className="sheet-center">
      <div className="modal" style={{ textAlign: 'center' }}>
        {given ? (
          <div style={{ padding: '24px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✨</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: 'var(--zm-amber)', marginBottom: 6 }}>Good karma sent!</div>
            <div style={{ fontSize: 14, color: 'var(--zm-text-muted)', marginBottom: 4 }}>You gave to {karmaPopup.name}.</div>
            <div style={{ fontSize: 13, color: 'var(--zm-text-dim)', lineHeight: 1.6 }}>The universe remembers every act of giving. Good things are coming your way. 🌟</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-amber-soft)', border: '2px solid var(--zm-amber)', margin: '0 auto 16px', fontWeight: 700, fontSize: 24, color: 'var(--zm-accent)' }}>
              {karmaPopup.initials}
            </div>

            <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              You received from
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 4 }}>{karmaPopup.name}</div>
            <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.6, marginBottom: 6 }}>
              They gave freely. Now send them good karma — what you give always comes back.
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.1), rgba(124,92,252,0.08))', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--zm-amber)', fontStyle: 'italic' }}>
              "Do good. Get good." — the ZeroMart way ✨
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} size={26} color="var(--zm-amber)" fill="var(--zm-amber)" />
              ))}
            </div>

            <input
              className="input"
              placeholder="Add a kind note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ marginBottom: 14, fontSize: 13 }}
            />

            <button className="btn btn-primary btn-full" onClick={handleGive} style={{ marginBottom: 10, fontSize: 15, padding: '14px', background: 'linear-gradient(135deg, var(--zm-amber), #e8930a)' }}>
              <span style={{ fontSize: 16 }}>✨</span> Send good karma
            </button>

            <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>
              Required to complete the exchange
            </div>
          </>
        )}
      </div>
    </div>
  );
}
