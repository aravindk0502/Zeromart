import { Minus, PackageCheck, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  formatExpiry, formatRequestCountdown, getQuantityAllowance, normalizeProductStock,
} from '../services/transactionService';

export default function QuantityRequestModal({ item, buyerId, collectionSettings, onClose, onConfirm }) {
  const product = useMemo(() => normalizeProductStock(item), [item]);
  const [quantity, setQuantity] = useState(1);
  const [slot, setSlot] = useState('');
  const [now, setNow] = useState(Date.now());
  const allowance = getQuantityAllowance(product, buyerId, quantity, now);
  const maximum = Math.min(allowance.remainingLimit, allowance.requestableStock, product.maxQuantityPerUserPer24h);
  const isBusiness = product.listingType === 'business';

  useEffect(() => {
    if (maximum > 0 && quantity > maximum) setQuantity(maximum);
  }, [maximum, quantity]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!item) return null;

  const submit = () => {
    if (allowance.allowedQuantity < 1) return;
    onConfirm({
      quantity: allowance.allowedQuantity,
      collectionWindow: collectionSettings?.allowAnytime ? 'Anytime during store opening hours' : slot,
    });
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="w-full max-w-md rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">{isBusiness ? 'Store reservation' : 'Community request'}</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{product.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Close quantity selection"><X size={18} /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3">
            <p className="text-xs font-bold text-emerald-700">Stock</p>
            <p className="mt-1 font-extrabold text-slate-900">{allowance.requestableStock} available</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-700">Limit</p>
            <p className="mt-1 font-extrabold text-slate-900">{product.maxQuantityPerUserPer24h} per 24h</p>
          </div>
        </div>

        {formatExpiry(product) && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">Expires: {formatExpiry(product)}</p>}

        {maximum > 0 ? (
          <>
            <div className="mt-5">
              <p className="text-sm font-bold text-slate-700">Choose quantity</p>
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-slate-200 p-2">
                <button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Minus size={18} /></button>
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-slate-900">{quantity}</p>
                  <p className="text-[11px] text-slate-400">Maximum {maximum}</p>
                </div>
                <button onClick={() => setQuantity((value) => Math.min(maximum, value + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white"><Plus size={18} /></button>
              </div>
            </div>

            {isBusiness && !collectionSettings?.allowAnytime && (
              <label className="mt-4 block text-sm font-bold text-slate-700">
                Collection window
                <select value={slot} onChange={(event) => setSlot(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-emerald-500">
                  <option value="">Choose an available time</option>
                  {(collectionSettings?.windows || []).filter((window) => !window.closed).map((window) => {
                    const label = `${window.days} · ${window.start}–${window.end}`;
                    return <option key={label} value={label}>{label}</option>;
                  })}
                </select>
              </label>
            )}

            <button onClick={submit} disabled={isBusiness && !collectionSettings?.allowAnytime && !slot} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-violet-600 px-4 py-3.5 font-bold text-white shadow-lg disabled:opacity-40">
              <PackageCheck size={18} />
              {isBusiness ? 'Reserve & Collect' : 'Send Request'}
            </button>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            {allowance.remainingLimit <= 0
              ? `Limit reached. You can request again in ${formatRequestCountdown(allowance.retryAt, now) || '24h 0m'}.`
              : 'SOLD OUT'}
          </div>
        )}
      </section>
    </div>
  );
}
