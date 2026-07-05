import { useMemo } from 'react';
import { ArrowLeft, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';

export default function ChatsPage({ items, chatItemId, onSelectChat, onConfirm, progress, onBack }) {
  const chatItem = useMemo(() => items.find((item) => item.id === chatItemId) ?? items[0], [items, chatItemId]);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">Temporary chat</p>
            <h2 className="text-xl font-semibold text-slate-900">{chatItem?.title}</h2>
          </div>
          <div className="rounded-full bg-amber-50 p-3 text-violet-600">
            <MessageCircle size={18} />
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-[1.5rem] bg-slate-50 p-4">
          <div className="rounded-2xl bg-white p-3 text-sm text-slate-600">Hi! I’m nearby and can collect this today.</div>
          <div className="rounded-2xl bg-amber-500 p-3 text-sm text-white">Perfect — I’ll leave it at the front desk.</div>
        </div>
        <p className="mt-3 text-sm text-slate-500">This chat will close after the item is collected.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => onConfirm(chatItem?.id, 'collected')} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white">
            I Collected the Item
          </button>
          <button onClick={() => onConfirm(chatItem?.id, 'gave')} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-violet-700">
            I Gave the Item
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <CheckCircle2 size={16} className="text-amber-500" />
          <span>Both confirmations unlock the Good Karma popup.</span>
        </div>
      </section>
      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Recent chats</h3>
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button key={item.id} onClick={() => onSelectChat(item.id)} className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${chatItemId === item.id ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <span className="font-medium text-slate-800">{item.title}</span>
              <span className="text-sm text-slate-500">{item.status}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
