import { useEffect, useRef } from 'react';
import { ArrowRight, Heart, MapPin, ShieldCheck, Sparkles, Star, Store, Users } from 'lucide-react';
import { formatExpiry, normalizeProductStock } from '../services/transactionService';

const sectionProducts = {
  b2b: [
    {
      id: 'business-1',
      brand: 'FreshCart',
      title: 'Fresh vegetable basket',
      subtitle: 'Restaurant · 2.4 km',
      badge: 'Local',
      category: 'Food',
      condition: 'Fresh',
      description: 'A single fresh vegetable basket from a nearby local business.',
      location: 'Koramangala',
      distance: '2.4 km',
      sellerName: 'FreshCart',
      sellerKarma: 31,
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
      status: 'Available',
      deliveryMode: 'pickup',
      allowInPersonCollection: true,
      requiresDelivery: false,
    },
    {
      id: 'business-2',
      brand: 'Urban Pantry',
      title: 'Coffee beans pack',
      subtitle: 'Cafe · 1.6 km',
      badge: 'Local',
      category: 'Food',
      condition: 'New',
      description: 'A sealed pack of coffee beans listed by a nearby cafe.',
      location: 'Indiranagar',
      distance: '1.6 km',
      sellerName: 'Urban Pantry',
      sellerKarma: 44,
      image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80',
      status: 'Available',
      deliveryMode: 'pickup',
      allowInPersonCollection: true,
      requiresDelivery: false,
    },
    {
      id: 'business-3',
      brand: 'Metro Foods',
      title: 'Frozen snack box',
      subtitle: 'Store · 3.1 km',
      badge: 'Local',
      category: 'Food',
      condition: 'Good',
      description: 'One frozen snack box available from a local store.',
      location: 'Jayanagar',
      distance: '3.1 km',
      sellerName: 'Metro Foods',
      sellerKarma: 25,
      image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',
      status: 'Available',
      deliveryMode: 'delivery',
      allowInPersonCollection: false,
      requiresDelivery: true,
    },
  ],
  food: [
    { brand: 'Nourish', title: 'Bakery surplus trays', subtitle: 'Surplus · 1.1 km', badge: 'Fresh today' },
    { brand: 'Green Plate', title: 'Salad boxes', subtitle: 'Kitchen · 0.8 km', badge: 'Limited' },
    { brand: 'Bites Co.', title: 'Savoury snack bundles', subtitle: 'Store · 2.0 km', badge: 'Good to go' },
  ],
};

const sectionContent = {
  b2b: {
    title: 'Stores and People Sharing Near You',
    description: 'Store products appear first, followed by useful items shared by people nearby.',
    badge: 'Nearby ₹0 listings',
  },
  food: {
    title: 'Food waste rescue',
    description: 'Restaurants and kitchens can list edible surplus before it goes to waste.',
    badge: 'Fresh surplus today',
  },
  explore: {
    title: 'Nearby free marketplace',
    description: 'Browse free household items, books, and community listings from your area.',
    badge: 'Community listings',
  },
};

const getCollectionCta = (item) => (
  item?.isBusinessProduct || item?.listingType === 'business' || item?.sellerType === 'business'
    ? 'Reserve & Collect'
    : 'Request to Collect'
);

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
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-600">{eyebrow}</p>
          <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">{title}</h2>
        </div>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map((item) => {
          const stock = normalizeProductStock(item);
          const requestState = item.requestState;
          return (
            <article
              key={`${title}-${item.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectItem?.(stock)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
              }}
              className="group min-w-[245px] max-w-[245px] snap-start cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
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
                  className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow backdrop-blur ${favorites.some((entry) => entry.id === item.id) ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-500'}`}
                  aria-label="Save item"
                >
                  <Heart size={16} fill={favorites.some((entry) => entry.id === item.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 min-w-0 font-extrabold text-slate-900">{item.title}</h3>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">
                    {Number(item.price ?? item.sellingPrice ?? 0) === 0 ? '₹0' : `₹${item.price ?? item.sellingPrice}`}
                  </span>
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
                      ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-700'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                >
                  {requestState && !requestState.canRequest
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
  user, businessSession, items, businessItems = [], homeSection, onSelectItem, onBuyItem,
  onLogin, onSelectSection, onOpenSectionView, locationLabel, onToggleFavorite, favorites,
  onEditItem, hasMoreItems = false, onLoadMore, loadMoreLabel = '',
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

  const sectionListings = homeSection === 'b2b'
    ? businessItems.map((item) => ({
        ...item,
        brand: item.sellerName,
        subtitle: `Local business · ${item.distance}`,
        badge: item.nearExpiryDeal ? 'Near Expiry' : 'Verified',
      }))
    : sectionProducts[homeSection];
  return (
    <div className="space-y-4">
      <section className={`relative overflow-hidden rounded-[1.5rem] p-4 shadow-[0_16px_55px_rgba(15,23,42,0.08)] sm:p-5 ${homeSection === 'b2b' ? 'border border-emerald-100 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_48%,#fffbeb_100%)]' : 'border border-amber-100 bg-white/85'}`}>
        {homeSection === 'b2b' && (
          <>
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-56 rounded-full bg-amber-200/25 blur-3xl" />
          </>
        )}
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={`inline-flex items-center gap-2 text-sm font-bold ${homeSection === 'b2b' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {homeSection === 'b2b' && <Store size={16} />}
              {sectionContent[homeSection].badge}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{sectionContent[homeSection].title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{sectionContent[homeSection].description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {homeSection === 'b2b' && (
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-white/85 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm md:inline-flex">
                <ShieldCheck size={14} /> Verified partners
              </span>
            )}
            <button onClick={onOpenSectionView} className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 ${homeSection === 'b2b' ? 'bg-emerald-700 shadow-emerald-700/15 hover:bg-emerald-800' : 'bg-gradient-to-r from-amber-500 to-violet-600 shadow-violet-500/15'}`}>
              Explore all <ArrowRight size={15} />
            </button>
          </div>
        </div>
        {homeSection !== 'explore' && (
          <div className="relative mt-4 flex snap-x gap-4 overflow-x-auto pb-3">
            {sectionListings.length === 0 && (
              <div className="w-full rounded-2xl border border-dashed border-emerald-200 bg-white/80 p-5 text-center">
                <p className="font-bold text-slate-800">No local business products in this radius yet</p>
                <p className="mt-1 text-sm text-slate-500">Change location or increase the distance filter to explore more listings.</p>
              </div>
            )}
            {sectionListings.map((product) => {
              const stock = normalizeProductStock({ ...product, listingType: 'business', isBusinessProduct: true });
              return (
              <article
                key={product.id || product.brand + product.title}
                role="button"
                tabIndex={0}
                onClick={() => onSelectItem?.(stock)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
                }}
                className={`group cursor-pointer snap-start overflow-hidden rounded-[1.35rem] bg-white transition duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-100 ${homeSection === 'b2b' ? 'min-w-[290px] max-w-[310px] border border-emerald-200 shadow-[0_16px_42px_rgba(5,150,105,0.13)]' : 'min-w-[260px] max-w-[280px] border border-amber-100 shadow-[0_12px_36px_rgba(15,23,42,0.08)]'}`}
              >
                {product.image && (
                  <div className="relative overflow-hidden">
                    <img src={product.image} alt={product.title} className={`${homeSection === 'b2b' ? 'h-40' : 'h-24'} w-full object-cover transition duration-500 group-hover:scale-[1.04]`} />
                    {homeSection === 'b2b' && (
                      <>
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-emerald-950/25 via-transparent to-transparent" />
                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700 shadow-sm backdrop-blur">
                            <ShieldCheck size={12} /> ZeroMart Partner
                          </span>
                          <span className="rounded-full bg-emerald-700/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur">{product.badge}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleFavorite(product);
                          }}
                          className={`absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 shadow-lg backdrop-blur transition hover:scale-105 ${favorites.some((entry) => entry.id === product.id) ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-600 hover:text-rose-500'}`}
                          aria-label={favorites.some((entry) => entry.id === product.id) ? `Remove ${product.title} from favorites` : `Save ${product.title} to favorites`}
                        >
                          <Heart size={18} fill={favorites.some((entry) => entry.id === product.id) ? 'currentColor' : 'none'} />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className={homeSection === 'b2b' ? 'p-4' : 'p-3'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {homeSection === 'b2b' && (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-sm font-extrabold text-white shadow-lg shadow-emerald-700/20">
                          {product.brand.split(' ').map((word) => word[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={`truncate font-extrabold ${homeSection === 'b2b' ? 'text-base text-emerald-800' : 'text-sm text-amber-700'}`}>{product.brand}</p>
                        {homeSection === 'b2b' && <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{product.subtitle.split('·')[0].trim()} partner</p>}
                      </div>
                    </div>
                    {homeSection !== 'b2b' && <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">{product.badge}</span>}
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-lg font-extrabold text-slate-900">{product.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{product.requestState?.stockLabel || (stock.availableQuantity === 1 ? 'Only 1 left' : `${stock.availableQuantity} available`)}</span>
                    {formatExpiry(stock) && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Expires {formatExpiry(stock)}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm text-slate-500">{product.subtitle}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-800">{Number(product.price || 0) === 0 ? '₹0' : `₹${product.price}`}</span>
                  </div>
                  <div className={`mt-4 flex items-center justify-between gap-2 ${homeSection === 'b2b' ? 'border-t border-slate-100 pt-3' : ''}`}>
                    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${homeSection === 'b2b' ? 'bg-emerald-50 text-emerald-800' : 'bg-gradient-to-r from-amber-50 to-violet-50 text-amber-700'}`}>
                      <Star size={13} fill="currentColor" />
                      <span className="truncate">{product.sellerKarma || 0} Store Karma</span>
                    </span>
                    <button
                      disabled={product.requestState && !product.requestState.canRequest}
                      onClick={(event) => { event.stopPropagation(); onBuyItem?.(stock); }}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                        product.requestState && !product.requestState.canRequest
                          ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-700 shadow-none'
                          : homeSection === 'b2b'
                            ? 'bg-emerald-700 text-white shadow-lg shadow-emerald-700/15 hover:-translate-y-0.5 hover:bg-emerald-800'
                            : 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/15 hover:-translate-y-0.5'
                      }`}
                    >
                      {product.requestState && !product.requestState.canRequest
                        ? product.requestState.buttonLabel
                        : getCollectionCta(product)}
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="-mt-1 rounded-[1.5rem] border border-amber-100/80 bg-white/70 p-4 shadow-[0_16px_55px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/15">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-700">Shared by people nearby</p>
            <h2 className="mt-0.5 text-xl font-extrabold text-slate-900">Shared by People Nearby</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Nearest community items first, expanding outward from {locationLabel} as you scroll.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500 sm:col-span-2">
              No matching products found. Try a different keyword, product, or condition filter.
            </div>
          ) : items.map((item) => {
          const isOwnListing = Boolean(user && (
            item.isOwn
            || item.ownerMobile === user.mobile
            || item.sellerName === user.name
            || item.sellerName === 'You'
          ));
          const stock = normalizeProductStock(item);
          return (
          <article
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectItem?.(stock)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
            }}
            className="group cursor-pointer overflow-hidden rounded-[1.5rem] border border-amber-100/80 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <img src={item.image} alt={item.title} className="h-40 w-full object-cover" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {item.isBusinessProduct && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                        <ShieldCheck size={12} /> Business Verified
                      </span>
                      {item.nearExpiryDeal && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">Near Expiry Deal</span>}
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.condition} · {item.distance}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">{item.requestState?.stockLabel || (stock.availableQuantity === 1 ? 'Only 1 left' : `Available: ${stock.availableQuantity} left`)}</p>
                  {formatExpiry(stock) && <p className="mt-1 text-xs font-semibold text-amber-700">Expires {formatExpiry(stock)}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={(event) => { event.stopPropagation(); onToggleFavorite(item); }} className={`rounded-full border p-2 transition ${favorites.some((entry) => entry.id === item.id) ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-200 bg-white text-slate-500 hover:text-rose-500'}`} aria-label="Save item">
                    <Heart size={15} fill={favorites.some((entry) => entry.id === item.id) ? 'currentColor' : 'none'} />
                  </button>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{Number(item.price || 0) === 0 ? '₹0' : `₹${item.price}`}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-[1rem] border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{item.sellerName}</p>
                  <div className="flex items-center gap-1 text-sm text-amber-500">
                    <Star size={14} fill="currentColor" />
                    <span>{item.sellerKarma} karma</span>
                  </div>
                </div>
                <button
                  disabled={!isOwnListing && item.requestState && !item.requestState.canRequest}
                  onClick={(event) => { event.stopPropagation(); isOwnListing ? onEditItem?.(item) : onBuyItem?.(item); }}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                    !isOwnListing && item.requestState && !item.requestState.canRequest
                      ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-700 shadow-none'
                      : 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/15 hover:brightness-105'
                  }`}
                >
                  {isOwnListing
                    ? 'Edit listing'
                    : item.requestState && !item.requestState.canRequest
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

      <footer className="rounded-[1.35rem] border border-amber-100 bg-white/90 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Sparkles size={16} />
              ZeroMart
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
              A local ₹0 marketplace for nearby free items, reuse, good karma, and community giving around {locationLabel}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            {['Terms and conditions', 'FAQ', 'Blogs', 'Help and support', 'Safety guide', 'Instagram', 'LinkedIn', 'X / Twitter'].map((label) => (
              <a
                key={label}
                href={label === 'Help and support' ? 'mailto:support@zeromart.local' : '#'}
                onClick={(event) => {
                  if (label !== 'Help and support') event.preventDefault();
                }}
                className="rounded-full border border-amber-100 bg-amber-50/50 px-3 py-1.5 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-3 border-t border-amber-100 pt-3 text-[11px] leading-4 text-slate-400">
          © 2026 ZeroMart. Give what you do not need and keep useful items moving locally.
        </div>
      </footer>
    </div>
  );
}
