import { ArrowLeft, MapPin, Sparkles, Star } from 'lucide-react';

export default function SearchPage({ items, onSelectItem, onBack }) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-600">
          <Sparkles size={16} />
          Search nearby gems
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <MapPin size={16} className="text-amber-500" />
          <input className="w-full bg-transparent outline-none" placeholder="Try books, chair, lamp..." />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <button key={item.id} onClick={() => onSelectItem(item)} className="rounded-[1.5rem] border border-amber-100 bg-white p-4 text-left shadow-sm">
            <p className="font-semibold text-slate-900">{item.title}</p>
            <p className="mt-2 text-sm text-slate-500">{item.category} · {item.condition}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-violet-600">✨ {item.sellerKarma} karma</span>
              <span className="text-slate-500">{item.distance}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
