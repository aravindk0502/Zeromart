import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Sparkles, Star, X } from 'lucide-react';

export default function KarmaPopup({ open, seller, onSubmit, mandatory = false }) {
  const [given, setGiven] = useState(false);
  const [note, setNote] = useState('');
  const successTimer = useRef(null);

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  if (!open) return null;

  function handleGive() {
    setGiven(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => {
      onSubmit();
      setGiven(false);
      setNote('');
      successTimer.current = null;
    }, 5000);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white text-center shadow-[0_28px_90px_rgba(15,23,42,0.34)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-amber-100/80 via-amber-50/80 to-transparent" />
        {!mandatory && (
          <button onClick={onSubmit} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800" aria-label="Close karma popup">
            <X size={18} />
          </button>
        )}
        {given ? (
          <div className="relative px-6 py-10">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-violet-700 ring-8 ring-amber-50">
              <CheckCircle2 size={42} />
            </div>
            <div className="font-sora text-2xl font-bold text-slate-900">Good karma sent!</div>
            <div className="mt-2 text-sm text-slate-600">You gave karma to {seller?.name || 'a neighbour'}.</div>
            <div className="mx-auto mt-5 max-w-xs rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Your kindness has been recorded.
            </div>
          </div>
        ) : (
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

            <div className="mt-5 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-amber-50 px-4 py-3 text-sm font-semibold italic text-amber-800">
              “Do good. Get good.” — the ZeroMart way
            </div>

            <div className="my-5 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} size={30} className="text-amber-500 drop-shadow-sm" fill="currentColor" />
              ))}
            </div>

            <input
              className="input"
              placeholder="Add a kind note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ marginBottom: 14, fontSize: 14, background: '#fff' }}
            />

            <button className="btn btn-full" onClick={handleGive} style={{ marginBottom: 10, fontSize: 15, padding: '14px', background: 'linear-gradient(135deg, #f59e0b, #059669)', color: '#fff', boxShadow: '0 14px 35px rgba(5, 150, 105, 0.24)' }}>
              <Sparkles size={18} /> Send good karma
            </button>

            <div className="text-xs font-medium text-slate-400">
              Required to complete the exchange
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
