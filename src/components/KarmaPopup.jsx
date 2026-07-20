import React, { useState } from 'react';
import { Sparkles, Star, X } from 'lucide-react';

export default function KarmaPopup({
  open,
  seller,
  onSubmit,
  onDismiss,
  mandatory = false,
  submitting = false,
  error = '',
}) {
  const [note, setNote] = useState('');

  if (!open) return null;

  function handleGive() {
    onSubmit(note);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" aria-modal="true" role="dialog">
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white text-center shadow-[0_28px_90px_rgba(15,23,42,0.34)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-amber-100/80 via-amber-50/80 to-transparent" />
        {!mandatory && (
          <button onClick={onDismiss} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800" aria-label="Close karma popup">
            <X size={18} />
          </button>
        )}
        <div className="relative px-5 pb-6 pt-8 sm:px-6">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-100 text-2xl font-bold text-violet-700 shadow-inner ring-4 ring-white">
            {seller?.initials || 'NZ'}
          </div>

          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            You received from
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{seller?.name || 'Nearby neighbour'}</div>
          <div className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
            They gave freely. Now send them good karma — what you give always comes back.
          </div>

          {(seller?.productName || seller?.pickupAddress || seller?.collectionDate || seller?.collectionTime) && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-left text-sm text-amber-950">
              {seller?.productName && <p><strong>Item:</strong> {seller.productName}</p>}
              {seller?.pickupAddress && <p className="mt-1"><strong>Collection:</strong> {seller.pickupAddress}</p>}
              {(seller?.collectionDate || seller?.collectionTime) && <p className="mt-1"><strong>When:</strong> {[seller.collectionDate, seller.collectionTime].filter(Boolean).join(' · ')}</p>}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-amber-50 px-4 py-3 text-sm font-semibold italic text-amber-800">
            “Do good. Get good.” — the Drizn way
          </div>

          <div className="my-5 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={30} className="text-amber-500 drop-shadow-sm" fill="currentColor" />
            ))}
          </div>

          <input
            className="input"
            placeholder="Add a kind note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginBottom: 14, fontSize: 14, background: '#fff' }}
          />

          {error && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <button disabled={submitting} className="btn btn-full disabled:opacity-60" onClick={handleGive} style={{ marginBottom: 10, fontSize: 15, padding: '14px', background: 'linear-gradient(135deg, #f59e0b, #059669)', color: '#fff', boxShadow: '0 14px 35px rgba(5, 150, 105, 0.24)' }}>
            <Sparkles size={18} /> {submitting ? 'Submitting…' : 'Give Good Karma'}
          </button>

          <div className="text-xs font-medium text-slate-400">
            Required to complete the exchange
          </div>
        </div>
      </div>
    </div>
  );
}
