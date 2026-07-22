import { Bell, Building2, ClipboardList, Home, Plus } from 'lucide-react';

export const BUSINESS_NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: Home, path: '/' },
  { key: 'notifications', label: 'Alerts', icon: Bell, path: '/' },
  { key: 'business-list-item', label: 'List Item', icon: Plus, path: '/business/inventory', primary: true },
  { key: 'business-orders', label: 'Orders', icon: ClipboardList, path: '/business/orders' },
  { key: 'business-dashboard', label: 'Dashboard', icon: Building2, path: '/business/dashboard' },
];

export const BUSINESS_BOTTOM_NAV_ITEMS = [
  BUSINESS_NAV_ITEMS[0],
  BUSINESS_NAV_ITEMS[1],
  null,
  BUSINESS_NAV_ITEMS[3],
  BUSINESS_NAV_ITEMS[4],
];

export const openBusinessAlerts = (navigate) => {
  sessionStorage.setItem('zeromart-business-navigation-view', 'notifications');
  navigate('/');
};

export function BottomNavigation({
  items,
  activeKey,
  onSelect,
  primaryAction,
  unreadNotificationCount = 0,
  favoriteBadgeCount = 0,
  hidden = false,
}) {
  return (
    <nav className={`${hidden ? 'hidden' : 'fixed'} inset-x-0 bottom-0 z-40 border-t border-amber-100 bg-white/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur lg:hidden`}>
      <div className="relative mx-auto grid h-[72px] max-w-[390px] grid-cols-[1fr_1fr_72px_1fr_1fr] items-center rounded-full bg-gradient-to-r from-amber-50 to-violet-50 px-2 py-1 shadow-[0_12px_38px_rgba(15,23,42,0.1)]">
        {items.map((item, index) => {
          if (!item) return <div key={`spacer-${index}`} className="h-full min-w-0" aria-hidden="true" />;
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item)}
              className={`relative mx-auto flex min-w-0 flex-col items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none sm:text-[11px] ${
                isActive ? 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow' : 'text-slate-600'
              }`}
            >
              <span className="relative">
                <Icon size={19} strokeWidth={2.2} />
                {item.key === 'notifications' && unreadNotificationCount > 0 && (
                  <span className="absolute -right-3 -top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 py-1 text-[9px] font-extrabold leading-none text-white shadow ring-2 ring-white">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
                {item.key === 'favorites' && favoriteBadgeCount > 0 && (
                  <span className="absolute -right-3 -top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 py-1 text-[9px] font-extrabold leading-none text-white shadow ring-2 ring-white">
                    {favoriteBadgeCount > 99 ? '99+' : favoriteBadgeCount}
                  </span>
                )}
              </span>
              <span className="mt-1.5 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
        <button onClick={primaryAction} className="absolute left-1/2 top-0 z-50 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-600/25 ring-4 ring-white" aria-label="List item">
          <Plus size={23} strokeWidth={2.2} />
          <span className="mt-0.5 text-[9px] font-extrabold leading-none">List Item</span>
        </button>
      </div>
    </nav>
  );
}