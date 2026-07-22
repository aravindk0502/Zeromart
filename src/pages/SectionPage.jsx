import { ArrowLeft, Heart, MapPin, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { getExpiryBadgeState, normalizeProductStock } from '../services/transactionService';
import { isListingOwnedByUser } from '../utils/listingOwnership';
import ShareButton from '../components/ShareButton';
import { getListingAvailability, getOptimizedProductImageUrl } from '../utils/listingPresentation';

const getSellerName = (item) => (
  item?.sellerProfile?.name
  || item?.sellerName
  || item?.storeName
  || item?.brand
  || item?.sellerInitials
  || 'Drizn User'
);

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
  .toUpperCase() || 'DU';

const getFallbackAvatarImage = (name = 'Drizn User') => {
  const initials = getInitials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const areaCoordinates = {
  Koramangala: { latitude: 12.9352, longitude: 77.6245 },
  Indiranagar: { latitude: 12.9784, longitude: 77.6408 },
  Jayanagar: { latitude: 12.9250, longitude: 77.5938 },
  'HSR Layout': { latitude: 12.9116, longitude: 77.6474 },
  Whitefield: { latitude: 12.9698, longitude: 77.7500 },
};

const getDistanceKm = (from, to) => {
  if (!from || !to) return null;
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const sectionData = {
  b2b: {
    title: 'Local business products',
    description: 'Explore single products listed by nearby restaurants, cafes, and stores.',
    items: [
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
        image: 'https://images.unsplash.com/photo-1562967916-eb82221dfb36?auto=format&fit=crop&w=900&q=80',
        status: 'Available',
        deliveryMode: 'delivery',
        allowInPersonCollection: false,
        requiresDelivery: true,
      },
    ],
  },
  food: {
    title: 'Food waste rescue',
    description: 'Find edible surplus and rescue-worthy food from nearby kitchens and stores.',
    items: [
      { brand: 'Nourish', title: 'Bakery surplus trays', subtitle: 'Surplus · 1.1 km', badge: 'Fresh today' },
      { brand: 'Green Plate', title: 'Salad boxes', subtitle: 'Kitchen · 0.8 km', badge: 'Limited' },
      { brand: 'Bites Co.', title: 'Savoury snack bundles', subtitle: 'Store · 2.0 km', badge: 'Good to go' },
    ],
  },
  explore: {
    title: 'General listings',
    description: 'Browse the full community marketplace for household goods and free items.',
    items: [],
  },
};

export default function SectionPage({ section, businessItems = [], onBack, locationLabel = 'Your area', radiusKm = 'all', onSelectItem, onBuyItem, onToggleFavorite, favorites = [], actor, onEditItem, onOpenSellerProfile }) {
  const data = sectionData[section] || sectionData.explore;
  const sourceItems = section === 'b2b'
    ? businessItems.map((item) => ({
        ...item,
        brand: item.sellerName || 'Local business',
        subtitle: `${item.category || 'Local business'} · ${item.distance || 'Nearby'}`,
        badge: (item.expiryBadge || getExpiryBadgeState(item)).nearExpiry ? 'Near Expiry' : 'Verified',
      }))
    : data.items;
  const activeLocation = areaCoordinates[locationLabel];
  const selectedRadiusKm = radiusKm === 'all' ? null : Number(radiusKm);
  const visibleItems = activeLocation && selectedRadiusKm
    ? sourceItems.filter((item) => {
        const itemLocation = areaCoordinates[item.location];
        const distance = getDistanceKm(activeLocation, itemLocation);
        return distance === null || distance <= selectedRadiusKm;
      })
    : sourceItems;
  const locationSummary = selectedRadiusKm
    ? `Showing nearby offers in ${locationLabel} within ${selectedRadiusKm} km`
    : `Showing nearby offers in ${locationLabel}`;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-amber-50">
        <ArrowLeft size={16} /> Back
      </button>

      <section className="rounded-[2rem] border border-amber-100 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
          <Sparkles size={16} /> Drizn
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">{data.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{data.description}</p>
        <div className="mt-4 flex items-center gap-2 rounded-[1.1rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 px-3 py-3 shadow-inner">
          <MapPin size={16} className="text-amber-600" />
          <span className="text-sm text-slate-600">{locationSummary}</span>
        </div>
      </section>

      {visibleItems.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const isFavorite = favorites.some((entry) => entry.id === item.id);
            const isOwnListing = isListingOwnedByUser(item, actor);
            const stock = normalizeProductStock({ ...item, listingType: section === 'b2b' ? 'business' : item.listingType });
            const expiryBadge = item.expiryBadge || getExpiryBadgeState(stock);
            const availability = getListingAvailability(item);
            const sellerName = getSellerName(item);
            const sellerAvatar = getSellerAvatar(item) || (isOwnListing ? actor?.profileImage || '' : '') || getFallbackAvatarImage(sellerName);
            const sellerInitials = String(item?.sellerInitials || item?.sellerProfile?.initials || getInitials(sellerName)).slice(0, 2).toUpperCase();
            return (
              <article
                key={item.id || item.brand + item.title}
                role="button"
                tabIndex={0}
                onClick={() => onSelectItem?.(stock)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(stock);
                }}
                className="group min-w-0 cursor-pointer overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-white ring-1 ring-emerald-100/90 shadow-[0_14px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-4 focus:ring-emerald-100 xl:flex xl:h-full xl:flex-col"
              >
                {item.image && <div className="relative"><img src={getOptimizedProductImageUrl(item.image)} alt={item.title} loading="lazy" decoding="async" className="h-44 w-full object-cover sm:h-48 xl:h-36" /><span className="absolute bottom-2 left-2 rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-extrabold text-white shadow">FREE</span></div>}
                <div className="p-3.5 xl:flex xl:flex-1 xl:flex-col xl:p-3">
                  {item.isBusinessProduct && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-1.5 xl:mb-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <ShieldCheck size={13} /> Business Verified
                      </span>
                      {expiryBadge.nearExpiry && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${expiryBadge.statusClassName}`}>{expiryBadge.statusLabel || 'Near Expiry'}</span>}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-emerald-700">{item.brand}</p>
                      <h3 className="mt-1 line-clamp-2 text-lg font-semibold text-slate-900">{item.title}</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ShareButton item={item} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-violet-600" />
                      {onToggleFavorite && (
                        <button onClick={(event) => { event.stopPropagation(); onToggleFavorite(item); }} className={`rounded-full border p-2 transition ${isFavorite ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-200 bg-white text-slate-500 hover:text-rose-500'}`} aria-label="Save item">
                          <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <span className="max-w-24 truncate rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{item.badge}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 xl:mt-2">
                    <p className="min-w-0 truncate text-sm text-slate-500">{item.subtitle}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">₹0</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold xl:mt-1.5">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{item.requestState?.stockLabel || (stock.availableQuantity === 1 ? 'Only 1 left' : `${stock.availableQuantity} available`)}</span>
                    {expiryBadge.statusLabel && !expiryBadge.nearExpiry && <span className={`rounded-full px-2.5 py-1 ${expiryBadge.statusClassName}`}>{expiryBadge.statusLabel}</span>}
                  </div>
                  {availability.timingLabel && <p className="mt-2 truncate text-[11px] font-semibold text-slate-500 xl:mt-1.5">{availability.timingLabel}</p>}
                  {availability.statusLabel && <p className="mt-2 text-[11px] font-bold text-rose-600 xl:mt-1.5">{availability.statusLabel}</p>}
                  <div className="mt-3.5 flex items-center justify-between gap-3 rounded-[1rem] bg-slate-50 px-3 py-3 xl:mt-auto xl:pt-2 xl:pb-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenSellerProfile?.(item);
                        }}
                        className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800 hover:text-violet-700"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[10px] font-extrabold text-violet-700">
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
                      <div className="flex items-center gap-1 text-xs text-amber-500">
                        <Star size={13} fill="currentColor" />
                        <span>{item.sellerKarma || 0} karma</span>
                      </div>
                    </div>
                    <button
                      disabled={!isOwnListing && item.requestState && !item.requestState.canRequest}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isOwnListing) {
                          onEditItem?.(stock);
                          return;
                        }
                        onBuyItem?.(stock);
                      }}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                        !isOwnListing && item.requestState && !item.requestState.canRequest
                          ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-700 shadow-none'
                          : 'bg-gradient-to-r from-amber-500 to-violet-600 text-white shadow-lg shadow-violet-500/15'
                      }`}
                    >
                      {isOwnListing
                        ? 'Edit listing'
                        : item.requestState && !item.requestState.canRequest
                          ? item.requestState.buttonLabel
                          : item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business'
                            ? 'Reserve & Collect'
                            : 'Request to Collect'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-amber-200 bg-white/70 p-6 text-center text-sm text-slate-500">
          No local business products found near {locationLabel}. Try another location or radius.
        </section>
      )}
    </div>
  );
}
