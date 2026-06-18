import React, { useState } from 'react';
import { Package, MapPin, Truck, Users, CheckCircle, Clock, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

function StatusDot({ done, active }) {
  if (done && !active) return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--zm-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CheckCircle size={12} color="white" />
    </div>
  );
  if (active) return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--zm-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--zm-accent-soft)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
    </div>
  );
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--zm-border)', background: 'var(--zm-surface2)', flexShrink: 0 }} />
  );
}

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(order.status !== 'delivered');
  const isActive = order.status !== 'delivered';
  const activeStep = order.steps.find(s => s.active);

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
      {/* Card header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zm-surface2)', borderRadius: 10, flexShrink: 0 }}>
          {order.product.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.product.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {order.type === 'delivery'
              ? <Truck size={11} color="var(--zm-text-dim)" />
              : <Users size={11} color="var(--zm-text-dim)" />}
            <span style={{ fontSize: 11, color: isActive ? 'var(--zm-accent)' : 'var(--zm-green)', fontWeight: 500 }}>
              {order.statusLabel}
            </span>
          </div>
          {order.eta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Clock size={10} color="var(--zm-amber)" />
              <span style={{ fontSize: 11, color: 'var(--zm-amber)' }}>ETA: {order.eta}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--zm-text-dim)' }}>{order.id}</span>
          {expanded ? <ChevronUp size={14} color="var(--zm-text-dim)" /> : <ChevronDown size={14} color="var(--zm-text-dim)" />}
        </div>
      </div>

      {/* Expanded tracker */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--zm-border)', padding: '14px 16px' }}>
          {/* Seller row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 10px', background: 'var(--zm-surface2)', borderRadius: 10 }}>
            <div className="avatar avatar-sm">{order.seller.initials}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{order.seller.name}</div>
              <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>Seller · {order.placedAt}</div>
            </div>
            <span className="karma-badge" style={{ fontSize: 10, marginLeft: 'auto' }}>⭐ {order.seller.karma}</span>
          </div>

          {/* Progress steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {order.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <StatusDot done={step.done} active={step.active} />
                  {i < order.steps.length - 1 && (
                    <div style={{ width: 2, height: 28, background: step.done ? 'var(--zm-green)' : 'var(--zm-border)', borderRadius: 1, margin: '3px 0' }} />
                  )}
                </div>
                <div style={{ paddingTop: 1, paddingBottom: i < order.steps.length - 1 ? 0 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: step.active ? 600 : 400, color: step.active ? 'var(--zm-text)' : step.done ? 'var(--zm-text-muted)' : 'var(--zm-text-dim)', lineHeight: 1.4 }}>
                    {step.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Type badge */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`badge ${order.type === 'delivery' ? 'badge-purple' : 'badge-green'}`} style={{ fontSize: 11 }}>
              {order.type === 'delivery' ? '🚚 Delivery' : '📍 In-person collect'}
            </span>
            {order.status === 'delivered' && (
              <span className="badge badge-green" style={{ fontSize: 11 }}>✓ Completed</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const { orders, setPage } = useApp();
  const [tab, setTab] = useState('active');

  const active = orders.filter(o => o.status !== 'delivered');
  const history = orders.filter(o => o.status === 'delivered');
  const shown = tab === 'active' ? active : history;

  return (
    <div className="page-content" style={{ padding: '52px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--zm-text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 0 12px', fontFamily: 'Inter, sans-serif' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 4 }}>My Orders</div>
        <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Track requests and collection history</div>
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', background: 'var(--zm-surface2)', borderRadius: 12, padding: 4, marginBottom: 20 }}>
        {[
          { key: 'active', label: `Active${active.length ? ` (${active.length})` : ''}` },
          { key: 'history', label: `History${history.length ? ` (${history.length})` : ''}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
              background: tab === t.key ? 'var(--zm-card)' : 'transparent',
              color: tab === t.key ? 'var(--zm-text)' : 'var(--zm-text-muted)',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{tab === 'active' ? '📦' : '🛍️'}</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {tab === 'active' ? 'No active orders' : 'No order history yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>
            {tab === 'active' ? 'Request an item from the home feed to get started.' : 'Completed orders will appear here.'}
          </div>
        </div>
      ) : (
        shown.map(order => <OrderCard key={order.id} order={order} />)
      )}
    </div>
  );
}
