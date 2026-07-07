import { ArrowLeft, Award, Gift, Package, Star, Zap } from 'lucide-react';

const KARMA_MILESTONES = [
  { at: 5, reward: 'Swiggy ₹50 voucher', icon: '🍔', unlocked: true },
  { at: 10, reward: 'BookMyShow ₹100 voucher', icon: '🎬', unlocked: true },
  { at: 25, reward: 'Myntra ₹200 voucher', icon: '👗', unlocked: false },
  { at: 50, reward: 'Nykaa ₹300 voucher', icon: '💄', unlocked: false },
];

export default function SellerPage({ user, items, onBack, onOpenListing, onOpenKarmaDemo }) {
  const safeUser = user || { name: 'You', karma: 0, credits: 0, vouchers: 0 };
  const userItems = items.filter((item) => item.sellerName === safeUser.name || item.sellerName === 'Asha Rao');
  const nextMilestone = KARMA_MILESTONES.find((milestone) => milestone.at > safeUser.karma);
  const progress = nextMilestone ? (safeUser.karma / nextMilestone.at) * 100 : 100;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50">
        <ArrowLeft size={16} /> Back
      </button>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">My Listings</p>
            <h2 className="text-xl font-semibold text-slate-900">List what you don’t need</h2>
          </div>
          <div className="rounded-full bg-amber-50 p-3 text-violet-600">
            <Package size={18} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-600"><Star size={15} fill="currentColor" /> <span className="text-lg font-semibold">{safeUser.karma}</span></div>
            <p className="mt-1 text-xs text-slate-500">Good karma</p>
          </div>
          <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-violet-600"><Zap size={15} /> <span className="text-lg font-semibold">{safeUser.credits || 0}</span></div>
            <p className="mt-1 text-xs text-slate-500">Delivery credits</p>
          </div>
          <div className="rounded-[1.25rem] border border-violet-100 bg-violet-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-violet-600"><Gift size={15} /> <span className="text-lg font-semibold">{safeUser.vouchers || 0}</span></div>
            <p className="mt-1 text-xs text-slate-500">Vouchers</p>
          </div>
        </div>
        {nextMilestone && (
          <div className="mt-4 rounded-[1.25rem] border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{nextMilestone.at - safeUser.karma} more to unlock</span>
              <span className="font-semibold text-slate-700">{nextMilestone.icon} {nextMilestone.reward}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        )}
        <button onClick={onOpenListing} className="mt-4 w-full rounded-[1.1rem] bg-violet-600 px-4 py-3 font-semibold text-white">List for ₹0</button>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Your listings</h3>
          <span className="text-sm text-slate-500">{userItems.length} live</span>
        </div>
        <div className="mt-3 space-y-2">
          {userItems.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nothing listed yet. Tap the button above to get started.</div>
          ) : (
            userItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-[1.25rem] border border-slate-100 bg-slate-50 px-3 py-3">
                <div>
                  <p className="font-medium text-slate-800">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.category} · {item.condition}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-violet-700">{item.status || 'Active'}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Award size={16} className="text-amber-500" />
          <h3 className="font-semibold text-slate-900">Karma milestones</h3>
        </div>
        <div className="mt-3 space-y-2">
          {KARMA_MILESTONES.map((milestone) => (
            <div key={milestone.at} className="flex items-center justify-between rounded-[1.25rem] border border-slate-100 bg-slate-50 px-3 py-3">
              <div>
                <p className="font-medium text-slate-800">{milestone.reward}</p>
                <p className="text-sm text-slate-500">Reach {milestone.at} karma</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${milestone.unlocked ? 'bg-amber-50 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>{milestone.unlocked ? 'Unlocked' : 'Locked'}</span>
            </div>
          ))}
        </div>
        <button onClick={onOpenKarmaDemo} className="mt-4 w-full rounded-[1.1rem] border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700">Preview karma popup</button>
      </section>
    </div>
  );
}
