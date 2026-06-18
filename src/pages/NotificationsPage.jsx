import React, { useEffect } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function NotificationsPage() {
  const { notifications, markNotificationsRead, setPage } = useApp();

  useEffect(() => {
    markNotificationsRead();
  }, []);

  return (
    <div className="page-content" style={{ padding: '52px 16px 80px' }}>
      <button onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--zm-text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 0 12px', fontFamily: 'Inter, sans-serif' }}>
        <ArrowLeft size={16} /> Back
      </button>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 20 }}>Notifications</div>
      {notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Bell size={40} color="var(--zm-text-dim)" style={{ marginBottom: 12 }} />
          <div style={{ color: 'var(--zm-text-muted)' }}>No notifications yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map(n => (
            <div key={n.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: n.read ? 0.6 : 1 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'var(--zm-text-dim)' : 'var(--zm-accent)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{n.text}</div>
                <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
