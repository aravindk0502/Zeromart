import { useEffect, useMemo, useRef } from 'react';
import {
  ArrowRight, Heart, MapPin, ShieldCheck, Sparkles, Star, Store,
} from 'lucide-react';
import { getExpiryBadgeState, normalizeProductStock } from '../services/transactionService';
import { isListingOwnedByUser } from '../utils/listingOwnership';
import SiteFooter from '../components/SiteFooter';
import ShareButton from '../components/ShareButton';
import { getListingAvailability } from '../utils/listingPresentation';

const getCollectionCta = (item) => (
  item?.isBusinessProduct || item?.listingType === 'business' || item?.sellerType === 'business'
    ? 'Reserve & Collect'
    : 'Request to Collect'
);

const getPriceLabel = (item) => {
  const price = Number(item?.price ?? item?.sellingPrice ?? 0);
  return price === 0 ? '₹0' : `₹${price}`;
};

const getSellerName = (item) => (
  item?.sellerProfile?.name
  || item?.sellerName
  || item?.storeName
  || item?.brand
  || item?.sellerInitials
  || 'Drizn User'
);

const getBusinessName = (item) => getSellerName(item) || 'Local store';

const getSellerAvatar = (item) => (
  item?.sellerProfile?.logoUrl
  || item?.sellerLogo
  || item?.sellerProfile?.avatarUrl
  || item?.sellerProfileImage
  || item?.sellerAvatar
  || item?.avatarUrl
  || ''
);

const getInitials = (name = 'Drizn User') => String(name)
  .split(' ')
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase() || 'U';

const getFallbackAvatarImage = (name = 'Drizn User') => {
  const initials = getInitials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export function ProductRail({
  title, eyebrow, icon: Icon, items, onSelectItem, onBuyItem, onToggleFavorite, favorites, rescue = false, actor, onEditItem, onOpenSellerProfile,
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
          const expiryBadge = item.expiryBadge || getExpiryBadgeState(stock);
          const availability = getListingAvailability(item);
          const requestState = item.requestState;
          const isOwnListing = isListingOwnedByUser(item, actor);
          const isFavorite = favorites.some((entry) => entry.id === item.id);
          const sellerName = getSellerName(item);
          const sellerAvatar = getSellerAvatar(item) || (isOwnListing ? actor?.profileImage || '' : '') || getFallbackAvatarImage(sellerName);
          const sellerInitials = String(item?.sellerInitials || item?.sellerProfile?.initials || getInitials(sellerName) || 'DU').slice(0, 2).toUpperCase();
          return (
            <article
              key={`${title}-${item.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectItem?.(stock)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
              }}
              className="group min-w-[245px] max-w-[245px] snap-start cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white ring-1 ring-slate-200/80 shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-violet-100"
            >
              <div className="relative">
                <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-32 w-full object-cover" />
                {rescue && expiryBadge.nearExpiry && expiryBadge.rescueLabel && (
                  <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow ${expiryBadge.rescueClassName}`}>
                    {expiryBadge.rescueLabel}
                  </span>
                )}
                <span className="absolute bottom-2 left-2 rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">FREE</span>
                <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                  <ShareButton item={item} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-600 shadow backdrop-blur" />
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onToggleFavorite(item); }}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow backdrop-blur ${isFavorite ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-500'}`}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Save item'}
                  >
                    <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 min-w-0 font-extrabold text-slate-900">{item.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">{getPriceLabel(item)}</span>
                    {item.serverPersisted || isOwnListing ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Live</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Local</span>
                    )}
                  </div>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <MapPin size={12} /> {item.distance || 'Distance unavailable'}
                </p>
                {expiryBadge?.formattedExpiry && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Expires: {expiryBadge.formattedExpiry}
                  </p>
                )}
                {availability.timingLabel && <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{availability.timingLabel}</p>}
                {availability.statusLabel && <p className="mt-1 text-[11px] font-bold text-rose-600">{availability.statusLabel}</p>}
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenSellerProfile?.(item);
                    }}
                    className="flex min-w-0 items-center gap-2 text-slate-500 hover:text-violet-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[10px] font-extrabold text-violet-700">
                      <img
                        src={sellerAvatar}
                        alt={sellerName}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = getFallbackAvatarImage(sellerName);
                        }}
                      />
                    </span>
                    <span className="truncate">{sellerName}</span>
                  </button>
                  <span className="shrink-0 font-bold text-amber-600">★ {item.sellerKarma || 0}</span>
                </div>
                {expiryBadge.statusLabel && !expiryBadge.nearExpiry && (
                  <div className="mt-2 text-xs font-bold">
                    <span className={`rounded-full px-2.5 py-1 ${expiryBadge.statusClassName}`}>{expiryBadge.statusLabel}</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!isOwnListing && requestState && !requestState.canRequest}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isOwnListing) {
                      onEditItem?.(stock);
                      return;
                    }
                    onBuyItem?.(stock);
                  }}
                  className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    requestState && !requestState.canRequest
                      ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-800'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                >
                  {isOwnListing
                    ? 'Edit listing'
                    : requestState && !requestState.canRequest
                      ? requestState.buttonLabel
                      : getCollectionCta(item)}
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
  locationLabel, onToggleFavorite, favorites = [], onEditItem, onOpenSellerProfile,
  hasMoreItems = false, onLoadMore, loadMoreLabel = '',
  loadingFeed = false,
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
      const requestable = Number(item?.requestState?.requestableStock ?? item?.availableQuantity ?? 0);
      const soldOut = Boolean(item?.isSoldOut) || requestable <= 0 || String(item?.status || '').toLowerCase().includes('sold');
      if (soldOut) return 2;
      if (item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business') return 0;
      return 1;
    };
    const distanceValue = (item) => (
      Number.isFinite(Number(item.distanceKm)) ? Number(item.distanceKm) : Number.POSITIVE_INFINITY
    );
    const karmaValue = (item) => Number(item.sellerKarma ?? item.karma ?? 0) || 0;
    const listedValue = (item) => new Date(item.createdAt || item.updatedAt || 0).getTime() || 0;
    const stores = businessItems.map((item) => normalizeProductStock({
      ...item,
      expiryBadge: item.expiryBadge || getExpiryBadgeState(item),
      isBusinessProduct: true,
      listingType: 'business',
      sellerType: 'business',
      brand: getBusinessName(item),
      subtitle: item.subtitle || `Local business · ${item.distance || 'nearby'}`,
      badge: (item.expiryBadge || getExpiryBadgeState(item)).nearExpiry ? 'Near Expiry' : 'Verified',
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
      <section className="overflow-visible rounded-[1.5rem] border border-emerald-100 bg-white/95 shadow-[0_16px_55px_rgba(15,23,42,0.08)]">
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

        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3 [@media(min-width:1800px)]:grid-cols-4">
          {loadingFeed && nearbyProducts.length === 0 ? (
            [...Array(6)].map((_, index) => (
              <article key={`skeleton-${index}`} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.06)]">
                <div className="h-40 w-full animate-pulse bg-slate-200" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-10 w-full animate-pulse rounded-full bg-slate-200" />
                </div>
              </article>
            ))
          ) : nearbyProducts.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/80 p-6 text-center sm:col-span-2 xl:col-span-3 [@media(min-width:1800px)]:col-span-4">
              <p className="text-base font-bold text-slate-700">No live listings yet.</p>
              <p className="mt-1 text-sm text-slate-500">List an item and it will appear here instantly.</p>
            </div>
          ) : nearbyProducts.map((item) => {
            const isBusiness = item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business';
            const isOwnListing = isListingOwnedByUser(item, user);
            const stock = normalizeProductStock(item);
            const expiryBadge = item.expiryBadge || getExpiryBadgeState(stock);
            const availability = getListingAvailability(item);
            const isFavorite = favorites.some((entry) => entry.id === item.id);
            const unavailable = !isOwnListing && item.requestState && !item.requestState.canRequest;
            const sellerName = getSellerName(item);
            const sellerAvatar = getSellerAvatar(item) || (isOwnListing ? user?.profileImage || '' : '') || getFallbackAvatarImage(sellerName);
            const sellerInitials = String(item?.sellerInitials || item?.sellerProfile?.initials || getInitials(sellerName) || 'DU').slice(0, 2).toUpperCase();
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectItem?.(stock)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
                }}
                className={`group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-[1.5rem] border bg-white ring-1 shadow-[0_14px_45px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-4 ${isBusiness ? 'border-emerald-200 ring-emerald-100/90 focus:ring-emerald-100' : 'border-amber-200/90 ring-amber-100/90 focus:ring-violet-100'}`}
              >
                <div className="relative">
                  <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-40 w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  {isBusiness && (
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700 shadow-sm backdrop-blur">
                        <ShieldCheck size={12} /> Drizn Partner
                      </span>
                      <span className="rounded-full bg-emerald-700/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur">
                        Verified
                      </span>
                    </div>
                  )}
                  {expiryBadge.nearExpiry && expiryBadge.rescueLabel && (
                    <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow ${expiryBadge.rescueClassName}`}>
                      {expiryBadge.rescueLabel}
                    </span>
                  )}
                  <span className="absolute bottom-3 left-3 rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">FREE</span>
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <ShareButton item={item} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-600 shadow-lg backdrop-blur transition hover:scale-105" />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(item);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/70 shadow-lg backdrop-blur transition hover:scale-105 ${isFavorite ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-600 hover:text-rose-500'}`}
                      aria-label={isFavorite ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}
                    >
                      <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  {availability.timingLabel && <p className="mb-2 truncate text-[11px] font-semibold text-slate-500">{availability.timingLabel}</p>}
                  {availability.statusLabel && <p className="mb-2 text-[11px] font-bold text-rose-600">{availability.statusLabel}</p>}
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenSellerProfile?.(item);
                        }}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-extrabold text-white shadow-lg ${isBusiness ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 shadow-emerald-700/20' : 'bg-gradient-to-br from-amber-500 to-violet-600 shadow-violet-500/20'}`}
                        aria-label={`Open ${sellerName} profile`}
                      >
                        <img
                          src={sellerAvatar}
                          alt={sellerName}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.src = getFallbackAvatarImage(sellerName);
                          }}
                        />
                      </button>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenSellerProfile?.(item);
                          }}
                          className={`truncate text-left font-extrabold hover:text-violet-700 ${isBusiness ? 'text-emerald-800' : 'text-slate-900'}`}
                        >
                          {sellerName}
                        </button>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          {isBusiness ? 'Local business partner' : 'Community listing'}
                        </p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {item.serverPersisted || isOwnListing ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Live</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">Local</span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-lg font-extrabold text-slate-900">{item.title}</h3>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-[26px] font-black leading-none text-amber-600 sm:text-[28px]">{getPriceLabel(item)}</span>
                    <span className="mb-1 rounded-full bg-gradient-to-r from-amber-50 to-violet-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-violet-700">FREE</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{item.requestState?.stockLabel || (stock.availableQuantity === 1 ? 'Only 1 left' : `${stock.availableQuantity} left`)}</span>
                    {expiryBadge.statusLabel && !expiryBadge.nearExpiry && <span className={`rounded-full px-2.5 py-1 ${expiryBadge.statusClassName}`}>{expiryBadge.statusLabel}</span>}
                  </div>
                  <div className="mt-3">
                    <p className="min-w-0 text-sm text-slate-500">{item.condition || item.category || 'Available'} · {item.distance || 'nearby'}</p>
                    {expiryBadge?.formattedExpiry && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">Expires: {expiryBadge.formattedExpiry}</p>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${isBusiness ? 'bg-emerald-50 text-emerald-800' : 'bg-gradient-to-r from-amber-50 to-violet-50 text-amber-700'}`}>
                      <Star size={13} fill="currentColor" />
                      <span className="truncate">{item.sellerKarma || 0} {isBusiness ? 'Store Karma' : 'karma'}</span>
                    </span>
                    <button
                      disabled={unavailable}
                      onClick={(event) => {
                        event.stopPropagation();
                        isOwnListing ? onEditItem?.(item) : onBuyItem?.(stock);
                      }}
                      className={`w-full shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
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

      <SiteFooter currentPath={typeof window !== 'undefined' ? window.location.pathname : '/'} />
    </div>
  );
}
