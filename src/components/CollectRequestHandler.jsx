import React from 'react';
import { MapPin, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function CollectRequestHandler() {
  const { collectRequest, setCollectRequest, setChatOpen } = useApp();

  if (!collectRequest || collectRequest.status !== 'pending') return null;

  const p = collectRequest.product;

  function accept() {
    setCollectRequest(null);
    setChatOpen(p.seller);
  }

  function decline() {
    setCollectRequest(null);
  }

  return (
    <div className="sheet-center">
      <div className="modal">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>Collect request sent!</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.6 }}>
            Waiting for <strong>{p.seller.name}</strong> to accept.<br />
            If they accept, a chat opens to coordinate.
          </div>
        </div>

        <div style={{ background: 'var(--zm-surface2)', borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>{p.emoji}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <MapPin size={11} color="var(--zm-green)" />
                <span style={{ fontSize: 12, color: 'var(--zm-text-muted)' }}>{p.distance} km from you</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simulate seller accepting */}
        <div style={{ fontSize: 12, color: 'var(--zm-text-dim)', textAlign: 'center', marginBottom: 16 }}>
          Demo: simulate seller's response
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-green" style={{ flex: 1 }} onClick={accept}>
            <Check size={15} /> Seller accepts
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={decline}>
            <X size={15} /> Seller declines
          </button>
        </div>
      </div>
    </div>
  );
}
