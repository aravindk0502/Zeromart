import { ArrowLeft, Check, MapPin, PackageCheck, Truck, X } from 'lucide-react';

const getProgress = (status = '') => {
  const value = status.toLowerCase();
  if (value.includes('declined')) return -1;
  if (value.includes('completed') || value.includes('delivered') || value.includes('collected personally')) return 3;
  if (value.includes('ready')) return 2;
  if (value.includes('accepted')) return 1;
  return 0;
};

export default function OrderTrackingModal({ order, onClose }) {
  if (!order) return null;
  const isDelivery = order.type === 'delivery' || order.fulfilment === 'Delivery';
  const isBusinessCollection = Boolean(order.collectionCode || order.businessId || order.isBusinessProduct);
  const steps = isBusinessCollection
    ? ['Reserved', 'Collected']
    : isDelivery
      ? ['Order placed', 'Accepted', 'Ready for dispatch', 'Delivered']
      : ['Request placed', 'Accepted', 'Ready for pickup', 'Collected personally'];
  const progress = isBusinessCollection
    ? (['collected', 'completed'].includes(String(order.status || '').toLowerCase()) ? 1 : 0)
    : getProgress(order.status);

  return (
    <div className="fixed inset-0 z-[205] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="max-h-[calc(100dvh-12px)] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[1.75rem]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 p-4 backdrop-blur">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"><ArrowLeft size={16} /> Back</button>
          <h2 className="font-extrabold text-slate-900">Track status</h2>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2.5 text-slate-500" aria-label="Close tracking"><X size={17} /></button>
        </header>

        <div className="p-5">
          <div className="flex items-start gap-3">
            {order.image ? <img src={order.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck size={28} /></div>}
            <div className="min-w-0">
              <h3 className="break-words text-xl font-extrabold text-slate-900">{order.title || order.productName}</h3>
              <p className="mt-1 text-sm text-slate-500">From {order.sellerName || 'ZeroMart seller'}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                {isDelivery ? <Truck size={13} /> : <PackageCheck size={13} />}
                {isDelivery ? 'Delivery' : 'In-person collection'}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Order ID</p>
            <p className="mt-1 break-all font-extrabold text-slate-900">{order.orderId || order.id}</p>
            <p className="mt-2 text-sm font-bold capitalize text-emerald-700">
              {isBusinessCollection
                ? (progress === 1 ? 'Collected' : 'Reserved')
                : order.status}
            </p>
          </div>

          {progress === -1 ? (
            <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">This order was declined by the seller.</div>
          ) : (
            <div className="mt-6 space-y-0">
              {steps.map((step, index) => {
                const complete = index <= progress;
                return (
                  <div key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${complete ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-300'}`}>{complete ? <Check size={15} /> : index + 1}</span>
                      {index < steps.length - 1 && <span className={`h-10 w-0.5 ${index < progress ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-bold ${complete ? 'text-slate-900' : 'text-slate-400'}`}>{step}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {order.deliveryStatus && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">{order.deliveryStatus}</p>}
          {order.buyerAddress && <p className="mt-3 rounded-2xl border border-slate-100 p-4 text-sm text-slate-600"><strong className="block text-slate-900">Delivery address</strong>{order.buyerAddress}</p>}
          {(order.location || order.distance) && <p className="mt-3 flex items-start gap-2 text-sm text-slate-500"><MapPin size={16} className="mt-0.5 shrink-0" /> {order.location}{order.distance ? ` · ${order.distance}` : ''}</p>}
          {order.createdAt && <p className="mt-2 text-xs text-slate-400">Placed {order.createdAt}</p>}
        </div>
      </section>
    </div>
  );
}
