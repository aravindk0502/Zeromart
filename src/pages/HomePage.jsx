import { useEffect, useMemo, useRef } from 'react';
import {
  ArrowRight, Heart, MapPin, ShieldCheck, Sparkles, Star, Store, Users,
} from 'lucide-react';
import { formatExpiry, getExpiryTimestamp, normalizeProductStock } from '../services/transactionService';

const getCollectionCta = (item) => (
  item?.isBusinessProduct || item?.listingType === 'business' || item?.sellerType === 'business'
    ? 'Reserve & Collect'
    : 'Request to Collect'
);

const getPriceLabel = (item) => {
  const price = Number(item?.price ?? item?.sellingPrice ?? 0);
  return price === 0 ? '₹0' : `₹${price}`;
};

const getBusinessName = (item) => item?.sellerName || item?.storeName || item?.brand || 'Local store';

const getInitials = (name = 'Unknown') => String(name)
  .split(' ')
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase() || 'U';

export function ProductRail({
  title, eyebrow, icon: Icon, items, onSelectItem, onBuyItem, onToggleFavorite, favorites, rescue = false,
}) {
  if (!items?.length) return null;
  return (
    <section className={`rounded-[1.5rem] p-4 shadow-[0_14px_42px_rgba(15,23,42,0.06)] sm:p-5 ${rescue ? 'border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50' : 'border border-slate-100 bg-white/80'}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${rescue ? 'bg-gradient-to-br from-red-500 to-orange-500' : 'bg-gradient-to-br from-amber-500 to-violet-600'}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-600">{eyebrow}</p>
          <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">{title}</h2>
        </div>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map((item) => {
          const stock = normalizeProductStock(item);
          const requestState = item.requestState;
          const isFavorite = favorites.some((entry) => entry.id === item.id);
          return (
            <article
              key={`${title}-${item.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectItem?.(stock)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
              }}
              className="group min-w-[245px] max-w-[245px] snap-start cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-violet-100"
            >
              <div className="relative">
                <img src={item.image} alt={item.title} className="h-32 w-full object-cover" />
                {rescue && (
                  <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow ${item.hoursRemaining <= 24 ? 'bg-red-600' : item.hoursRemaining <= 48 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                    {item.rescueLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onToggleFavorite(item); }}
                  className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow backdrop-blur ${isFavorite ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-500'}`}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Save item'}
                >
                  <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 min-w-0 font-extrabold text-slate-900">{item.title}</h3>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">{getPriceLabel(item)}</span>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <MapPin size={12} /> {item.distance || 'Distance unavailable'}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-500">{item.sellerName}</span>
                  <span className="shrink-0 font-bold text-amber-600">★ {item.sellerKarma || 0}</span>
                </div>
                <button
                  type="button"
                  disabled={requestState && !requestState.canRequest}
                  onClick={(event) => { event.stopPropagation(); onBuyItem?.(stock); }}
                  className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    requestState && !requestState.canRequest
                      ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-800'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                >
                  {requestState && !requestState.canRequest ? requestState.buttonLabel : getCollectionCta(item)}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function HomePage({
  user, items = [], businessItems = [], onSelectItem, onBuyItem,
  locationLabel, onToggleFavorite, favorites = [], onEditItem,
  hasMoreItems = false, onLoadMore, loadMoreLabel = '',
}) {
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (!hasMoreItems || !loadMoreRef.current || !onLoadMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        onLoadMore();
      }
    }, { rootMargin: '240px 0px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreItems, onLoadMore, loadMoreLabel]);

  const nearbyProducts = useMemo(() => {
    const groupPriority = (item) => {
      const expiryAt = getExpiryTimestamp(item);
      const isNearExpiry = Boolean(
        item.nearExpiryDeal
        || item.nearExpiry
        || (expiryAt && expiryAt > Date.now() && expiryAt - Date.now() <= 7 * 24 * 60 * 60 * 1000),
      );
      if (isNearExpiry) return 0;
      if (item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business') return 1;
      return 2;
    };
    const distanceValue = (item) => (
      Number.isFinite(Number(item.distanceKm)) ? Number(item.distanceKm) : Number.POSITIVE_INFINITY
    );
    const karmaValue = (item) => Number(item.sellerKarma ?? item.karma ?? 0) || 0;
    const listedValue = (item) => new Date(item.createdAt || item.updatedAt || 0).getTime() || 0;
    const stores = businessItems.map((item) => normalizeProductStock({
      ...item,
      isBusinessProduct: true,
      listingType: 'business',
      sellerType: 'business',
      brand: getBusinessName(item),
      subtitle: item.subtitle || `Local business · ${item.distance || 'nearby'}`,
      badge: item.nearExpiryDeal ? 'Near Expiry' : 'Verified',
    }));
    const community = items
      .filter((item) => !item.isBusinessProduct && item.listingType !== 'business' && item.sellerType !== 'business')
      .map((item) => normalizeProductStock(item));
    const seen = new Set();
    return [...stores, ...community].filter((item) => {
      const key = String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => (
      groupPriority(a) - groupPriority(b)
      || distanceValue(a) - distanceValue(b)
      || karmaValue(b) - karmaValue(a)
      || listedValue(b) - listedValue(a)
    ));
  }, [businessItems, items]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.5rem] border border-emerald-100 bg-white/95 shadow-[0_16px_55px_rgba(15,23,42,0.08)]">
        <div className="border-b border-emerald-100/80 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_52%,#fffbeb_100%)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
                <Store size={16} /> Nearby marketplace
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">Nearby Products</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Store listings appear first, then useful items shared by people around {locationLabel || 'your area'}.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-100 bg-white/85 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">
              <ShieldCheck size={14} /> Live local feed
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
          {nearbyProducts.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
              No nearby products yet. List the first item in this location.
            </div>
          ) : nearbyProducts.map((item) => {
            const isBusiness = item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business';
            const isOwnListing = Boolean(user && (
              item.isOwn
              || item.ownerMobile === user.mobile
              || item.sellerId === user.userId
              || item.sellerName === user.name
              || item.sellerName === 'You'
            ));
            const stock = normalizeProductStock(item);
            const isFavorite = favorites.some((entry) => entry.id === item.id);
            const unavailable = !isOwnListing && item.requestState && !item.requestState.canRequest;
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectItem?.(stock)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
                }}
                className={`group cursor-pointer overflow-hidden rounded-[1.5rem] border bg-white shadow-[0_14px_45px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-4 ${isBusiness ? 'border-emerald-200 focus:ring-emerald-100' : 'border-amber-100/80 focus:ring-violet-100'}`}
              >
                <div className="relative">
                  <img src={item.image} alt={item.title} className="h-40 w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  {isBusiness && (
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700 shadow-sm backdrop-blur">
                        <ShieldCheck size={12} /> ZeroMart Partner
                      </span>
                      <span className="rounded-full bg-emerald-700/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur">
                        {item.nearExpiryDeal ? 'Near Expiry' : 'Verified'}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(item);
                    }}
                    className={`absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 shadow-lg backdrop-blur transition hover:scale-105 ${isFavorite ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-600 hover:text-rose-500'}`}
                    aria-label={isFavorite ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}
                  >
                    <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow-lg ${isBusiness ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 shadow-emerald-700/20' : 'bg-gradient-to-br from-amber-500 to-violet-600 shadow-violet-500/20'}`}>
                        {getInitials(item.sellerName)}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate font-extrabold ${isBusiness ? 'text-emerald-800' : 'text-slate-900'}`}>{item.sellerName || 'Unknown'}</p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          {isBusiness ? 'Local business partner' : 'Community listing'}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-800">{getPriceLabel(item)}</span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-lg font-extrabold text-slate-900">{item.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{item.requestState?.stockLabel || (stock.availableQuantity === 1 ? 'Only 1 left' : `${stock.availableQuantity} left`)}</span>
                    {formatExpiry(stock) && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Expires {formatExpiry(stock)}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm text-slate-500">{item.condition || item.category || 'Available'} · {item.distance || 'nearby'}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${isBusiness ? 'bg-emerald-50 text-emerald-800' : 'bg-gradient-to-r from-amber-50 to-violet-50 text-amber-700'}`}>
                      <Star size={13} fill="currentColor" />
                      <span className="truncate">{item.sellerKarma || 0} {isBusiness ? 'Store Karma' : 'karma'}</span>
                    </span>
                    <button
                      disabled={unavailable}
                      onClick={(event) => {
                        event.stopPropagation();
                        isOwnListing ? onEditItem?.(item) : onBuyItem?.(stock);
                      }}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                        unavailable
                          ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-800 shadow-none'
                          : isBusiness
                            ? 'bg-emerald-700 text-white shadow-lg shadow-emerald-700/15 hover:-translate-y-0.5 hover:bg-emerald-800'
                            : 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/15 hover:-translate-y-0.5'
                      }`}
                    >
                      {isOwnListing
                        ? 'Edit listing'
                        : unavailable
                          ? item.requestState.buttonLabel
                          : getCollectionCta(item)}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {hasMoreItems && (
        <div ref={loadMoreRef} className="flex justify-center py-2">
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3 text-sm font-extrabold text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50"
          >
            Show more · {loadMoreLabel} <ArrowRight size={17} />
          </button>
        </div>
      )}

      <footer className="rounded-[1.1rem] border border-amber-100 bg-white/90 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-700">
              <Sparkles size={15} /> ZeroMart
            </span>
            <span className="font-semibold text-slate-500">₹0 local sharing</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
            {['About', 'Help', 'Terms', 'Contact', 'Instagram', 'LinkedIn', 'WhatsApp'].map((label) => (
              <a
                key={label}
                href={['Help', 'Contact'].includes(label) ? 'mailto:support@zeromart.local' : '#'}
                onClick={(event) => {
                  if (!['Help', 'Contact'].includes(label)) event.preventDefault();
                }}
                className="transition hover:text-violet-700"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-400">
          © 2026 ZeroMart. Give what you do not need and keep useful items moving locally.
        </div>
      </footer>
    </div>
  );
}
