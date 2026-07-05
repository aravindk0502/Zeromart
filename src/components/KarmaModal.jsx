import { Sparkles } from 'lucide-react';

export default function KarmaModal({ onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-[2rem] bg-gradient-to-br from-amber-500 to-violet-600 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-100">Completed exchange</p>
            <h3 className="mt-1 text-2xl font-semibold">Thank the giver</h3>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/20 px-3 py-2 text-sm">Close</button>
        </div>
        <div className="mt-6 rounded-[1.5rem] bg-white/20 p-5">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles size={20} />
            Give +1 Good Karma for this item.
          </div>
          <button onClick={onConfirm} className="mt-5 w-full rounded-2xl bg-white px-4 py-3 font-semibold text-violet-700">
            ✨ Give +1 Good Karma
          </button>
        </div>
      </div>
    </div>
  );
}
