import { CheckCircle2, ExternalLink, MapPin, Navigation, PackageSearch, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

function CollectionQr({ value }) {
  return (
    <div className="mx-auto w-fit rounded-xl border-4 border-white bg-white p-2 shadow">
      <QRCodeSVG value={String(value || 'DRIZN')} size={128} level="M" includeMargin aria-label="Collection QR code" />
    </div>
  );
}

export default function OrderSuccessModal({ order, onClose, onTrack }) {
  if (!order) return null;
  const isReservation = Boolean(order.collectionCode);
  const directionsLink = order.directionsLink || (order.businessPickupAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.businessPickupAddress)}`
    : '');

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-white p-5 text-center shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="ml-auto flex justify-end">
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Close order confirmation"><X size={18} /></button>
        </div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold text-slate-900">{isReservation ? 'Your item is reserved' : 'Request sent successfully'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isReservation
            ? `${order.title} × ${order.quantity} is reserved at ${order.sellerName}. Show this ID or QR when collecting.`
            : `Your request for ${order.title} × ${order.quantity || 1} has been sent to ${order.sellerName}. Contact and pickup details appear after acceptance.`}
        </p>
        {isReservation && <div className="mt-5"><CollectionQr value={order.qrCodeValue} /></div>}
        {isReservation && order.businessPickupAddress && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pickup location</p>
            <p className="mt-2 flex items-start gap-2 text-sm font-semibold leading-6 text-slate-700">
              <MapPin size={16} className="mt-1 shrink-0 text-emerald-700" />
              {order.businessPickupAddress}
            </p>
            {directionsLink && (
              <a href={directionsLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">
                <Navigation size={17} /> Get directions
              </a>
            )}
          </div>
        )}
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{isReservation ? 'Collection ID' : 'Request ID'}</p>
          <p className="mt-1 break-all text-lg font-extrabold text-slate-900">{order.collectionCode || order.orderId || order.id}</p>
          {isReservation && <p className="mt-2 text-sm font-semibold text-emerald-800">{order.collectionWindow}</p>}
          <p className="mt-2 text-xs text-slate-500">Keep this ID to track collection updates.</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-600">Continue browsing</button>
          <button onClick={onTrack} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white shadow-lg shadow-emerald-700/15">
            <PackageSearch size={18} /> Track status
          </button>
        </div>
        {isReservation && order.whatsappLink && (
          <a href={order.whatsappLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
            Send confirmation to WhatsApp <ExternalLink size={14} />
          </a>
        )}
      </section>
    </div>
  );
}
