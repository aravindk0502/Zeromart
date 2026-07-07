import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Copy, MapPin, Navigation, PackageSearch, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const TERMINAL_STATUSES = ['completed', 'collected', 'collected personally', 'expired', 'no show', 'no-show', 'cancelled', 'declined'];

export const getCollectionPassState = (order, now = Date.now()) => {
  const status = String(order?.status || '').toLowerCase();
  const timedOut = Boolean(
    order?.reservationExpiresAt
    && new Date(order.reservationExpiresAt).getTime() <= now
    && !TERMINAL_STATUSES.includes(status)
  );
  const terminal = TERMINAL_STATUSES.includes(status) || timedOut;
  const collected = ['completed', 'collected', 'collected personally'].includes(status);
  return {
    active: Boolean(order?.collectionCode) && !terminal,
    collected,
    expired: Boolean(order?.collectionCode) && terminal && !collected,
    label: collected ? 'Collected · Past order' : terminal ? 'QR expired · Past order' : 'Active collection pass',
  };
};

export default function CollectionPass({ order, onTrack }) {
  const [, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (!order?.collectionCode) return null;
  const state = getCollectionPassState(order);
  const expiresAt = order.reservationExpiresAt ? new Date(order.reservationExpiresAt) : null;
  const directionsLink = order.directionsLink || (order.businessPickupAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.businessPickupAddress)}`
    : '');

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(order.collectionCode);
    } catch {
      // The collection ID remains selectable when clipboard access is unavailable.
    }
  };

  return (
    <article className={`overflow-hidden rounded-[1.5rem] border p-4 shadow-sm ${state.active ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {state.active ? <QrCode size={18} className="text-emerald-700" /> : <CheckCircle2 size={18} className="text-slate-500" />}
            <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${state.active ? 'text-emerald-700' : 'text-slate-500'}`}>{state.label}</p>
          </div>
          <h3 className="mt-2 truncate text-lg font-extrabold text-slate-900">{order.title || order.productName}</h3>
          <p className="mt-1 text-sm text-slate-500">{order.sellerName ? `Collect from ${order.sellerName}` : 'Drizn collection'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
          {state.active ? order.status || 'Reserved' : state.collected ? 'Collected' : 'Expired'}
        </span>
      </div>

      {state.active ? (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <div className="w-fit rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
            <QRCodeSVG value={String(order.qrCodeValue || `${order.orderId || order.id}|${order.collectionCode}`)} size={116} level="M" includeMargin aria-label="Collection QR code" />
          </div>
          <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white/90 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Collection ID</p>
            <p className="mt-1 break-all text-lg font-extrabold text-slate-900">{order.collectionCode}</p>
            <p className="mt-2 text-sm font-semibold text-emerald-800">{order.collectionWindow || 'Anytime during store opening hours'}</p>
            {expiresAt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock3 size={13} /> QR valid until {expiresAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            {order.businessPickupAddress && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <p className="flex items-start gap-2 text-xs font-semibold leading-5 text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-700" />
                  {order.businessPickupAddress}
                </p>
                {directionsLink && (
                  <a href={directionsLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">
                    <Navigation size={14} /> Get directions
                  </a>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={copyCode} className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Copy size={14} /> Copy ID</button>
              {onTrack && <button type="button" onClick={onTrack} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><PackageSearch size={14} /> Track</button>}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
          <p className="font-bold text-slate-600">Collection ID: {order.collectionCode}</p>
          <p className="mt-1 text-sm text-slate-500">
            {state.collected ? 'This item was collected successfully. The QR can no longer be used.' : 'This reservation is no longer active. The QR can no longer be used.'}
          </p>
          {onTrack && <button type="button" onClick={onTrack} className="mt-3 text-xs font-bold text-violet-700">View past order details</button>}
        </div>
      )}
    </article>
  );
}
