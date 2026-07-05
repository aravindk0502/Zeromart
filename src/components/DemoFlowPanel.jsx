import {
  Bell, Building2, ClipboardList, MapPinned, PackageCheck, PlusCircle, QrCode,
  RotateCcw, ShoppingBag, Store, UserRound, X,
} from 'lucide-react';

const roleLabels = {
  buyer: 'Demo Buyer',
  seller: 'Community Seller',
  business: 'Business Store',
};

const requestLabel = (request) => {
  if (!request) return 'No active request';
  if (request.status === 'completed') return 'Collection completed';
  if (request.status === 'accepted') return 'Awaiting collection';
  if (request.status === 'declined') return 'Request declined';
  return 'Awaiting seller';
};

const businessOrderLabel = (order) => {
  if (!order) return 'No active reservation';
  return ['Collected', 'Completed'].includes(order.status) ? 'Collected' : 'Reserved';
};

function ActionButton({ icon: Icon, children, onClick, tone = 'violet' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
      : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-extrabold transition ${toneClass}`}
    >
      <Icon size={17} className="shrink-0" />
      <span>{children}</span>
    </button>
  );
}

function RoleCard({ icon: Icon, title, account, status, tone, children }) {
  const business = tone === 'emerald';
  const seller = tone === 'amber';
  const shellClass = business
    ? 'border-emerald-200 bg-emerald-50/50'
    : seller
      ? 'border-amber-200 bg-amber-50/50'
      : 'border-violet-200 bg-violet-50/50';
  const iconClass = business
    ? 'bg-emerald-700 text-white'
    : seller
      ? 'bg-amber-500 text-white'
      : 'bg-violet-600 text-white';

  return (
    <article className={`rounded-2xl border p-4 ${shellClass}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{account}</p>
          <p className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm">
            {status}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </article>
  );
}

export default function DemoFlowPanel({
  open,
  currentRole,
  latestRequest,
  latestBusinessOrder,
  onClose,
  onBuyer,
  onSeller,
  onBusiness,
  onReset,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="max-h-[96dvh] w-full max-w-4xl overflow-y-auto rounded-t-[1.75rem] bg-slate-50 p-4 shadow-2xl sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-600">Temporary testing tool</p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Test ZeroMart Flow</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Switch between Buyer, Seller, and Business to test the real end-to-end collection flow.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-white p-2.5 text-slate-500 shadow-sm" aria-label="Close demo flow">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Current role</span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold text-violet-700">
            {roleLabels[currentRole] || 'Choose a role'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <RoleCard
            icon={ShoppingBag}
            title="Buyer Demo"
            account="demo_buyer"
            status={latestBusinessOrder ? businessOrderLabel(latestBusinessOrder) : requestLabel(latestRequest)}
            tone="violet"
          >
            <ActionButton icon={ShoppingBag} onClick={() => onBuyer('community-product')}>Browse & Request Community Item</ActionButton>
            <ActionButton icon={Bell} onClick={() => onBuyer('alerts')}>View Accepted Request</ActionButton>
            <ActionButton icon={PackageCheck} onClick={() => onBuyer('alerts')}>Mark Item Collected</ActionButton>
            <ActionButton icon={Store} onClick={() => onBuyer('business-product')}>Reserve From Business Store</ActionButton>
            <ActionButton icon={QrCode} onClick={() => onBuyer('profile')}>View Business Collection Pass</ActionButton>
          </RoleCard>

          <RoleCard
            icon={UserRound}
            title="Community Seller Demo"
            account="demo_seller"
            status={requestLabel(latestRequest)}
            tone="amber"
          >
            <ActionButton tone="amber" icon={PlusCircle} onClick={() => onSeller('list')}>List Community Product</ActionButton>
            <ActionButton tone="amber" icon={Bell} onClick={() => onSeller('alerts')}>View Buyer Requests</ActionButton>
            <ActionButton tone="amber" icon={MapPinned} onClick={() => onSeller('alerts')}>Accept Request & Send Collection Details</ActionButton>
            <ActionButton tone="amber" icon={PackageCheck} onClick={() => onSeller('alerts')}>Mark Item Handed Over</ActionButton>
          </RoleCard>

          <RoleCard
            icon={Building2}
            title="Business Store Demo"
            account="demo_business"
            status={businessOrderLabel(latestBusinessOrder)}
            tone="emerald"
          >
            <ActionButton tone="emerald" icon={PlusCircle} onClick={() => onBusiness('inventory')}>Add Store Product</ActionButton>
            <ActionButton tone="emerald" icon={ClipboardList} onClick={() => onBusiness('orders')}>View Store Reservations</ActionButton>
            <ActionButton tone="emerald" icon={QrCode} onClick={() => onBusiness('orders')}>Verify Collection ID / QR</ActionButton>
            <ActionButton tone="emerald" icon={PackageCheck} onClick={() => onBusiness('orders')}>Mark Order Collected</ActionButton>
          </RoleCard>
        </div>

        <button type="button" onClick={onReset} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
          <RotateCcw size={16} /> Reset demo data
        </button>
      </section>
    </div>
  );
}
