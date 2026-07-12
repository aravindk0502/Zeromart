import { useState } from 'react';
import { ArrowLeft, MapPin, Pencil, ShieldCheck, Sparkles, Trash2, User, X } from 'lucide-react';
import { formatExpiry, normalizeProductStock } from '../services/transactionService';
import { isListingOwnedByUser } from '../utils/listingOwnership';

export default function ItemDetailsModal({ item, onClose, onRequest, onRequireLogin, onEdit, onDelete, user }) {
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  if (!item) return null;
  const product = normalizeProductStock(item);

  const parsedDistance = Number.parseFloat(String(item.distance || '').replace(/[^\d.]/g, ''));
  const distanceKm = Number.isFinite(item.distanceKm)
    ? item.distanceKm
    : String(item.distance || '').includes(' m')
      ? parsedDistance / 1000
      : parsedDistance;
  const canCollectInPerson = Number.isFinite(distanceKm) && distanceKm <= 1;
  const generalLocation = item.locationData?.area
    || item.locationData?.locality
    || item.locationData?.city
    || item.location
    || 'General area';
  const distanceRadius = !Number.isFinite(distanceKm)
    ? 'Distance unavailable'
    : distanceKm <= 1
      ? 'Within 1 km'
      : distanceKm <= 3
        ? 'Within 3 km'
        : distanceKm <= 5
          ? 'Within 5 km'
          : distanceKm <= 10
            ? 'Within 10 km'
            : distanceKm <= 25
              ? 'Within 25 km'
              : distanceKm <= 50
                ? 'Within 50 km'
                : 'More than 50 km away';
  const isOwnListing = isListingOwnedByUser(item, user);

  const handlePrimary = () => {
    if (!user) {
      onRequireLogin();
      return;
    }
    onRequest(item.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-3">
      <div className="max-h-[calc(100dvh-16px)] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-[2rem] sm:p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <ArrowLeft size={16} />
            Back
          </button>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="Close item details">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6">
          <div>
            <div>
              {item.isBusinessProduct && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck size={13} /> Business Verified</span>
                  {item.nearExpiryDeal && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Near Expiry Deal</span>}
                </div>
              )}
              <p className="text-sm font-semibold text-violet-600">{item.category}</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">{item.title}</h2>
            </div>
          </div>

          <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="mt-4 h-56 w-full rounded-[1.5rem] object-cover" />

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-violet-700">{item.condition}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{Number(item.price || 0) === 0 ? 'Free' : `₹${item.price}`}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{item.status}</span>
            {item.validTill && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Valid till {item.validTill}</span>}
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              {item.requestState?.stockLabel || (product.availableQuantity === 1 ? 'Only 1 left' : `Available: ${product.availableQuantity} left`)}
            </span>
            {formatExpiry(product) && <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-800">Expires: {formatExpiry(product)}</span>}
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">{item.description || 'No description added by seller.'}</p>

          <div className="mt-4 rounded-[1.3rem] border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin size={16} className="text-amber-500" />
              <span>{generalLocation}</span>
              <span className="ml-auto">{distanceRadius}</span>
            </div>
            <div className="mt-3 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
              {isOwnListing
                ? 'This is your listing. Exact pickup details remain private until you accept a buyer request.'
                : item.isBusinessProduct
                  ? 'Reserve and collect from this store. Your collection ID, QR code, pickup location, and directions appear immediately after reservation.'
                  : canCollectInPerson
                    ? 'This item is within the 1 km collection radius. The seller shares contact and pickup details only after accepting your request.'
                    : 'Send a request first. If accepted, use the shared phone number to coordinate collection or your preferred courier.'}
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-[1.1rem] bg-white p-3 shadow-sm">
              <button
                type="button"
                disabled={!item.sellerProfileImage}
                onClick={() => item.sellerProfileImage && setPreviewProfileImage(item.sellerProfileImage)}
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-violet-700 disabled:cursor-default"
                aria-label={item.sellerProfileImage ? `View ${item.sellerName} profile photo` : `${item.sellerName} profile`}
              >
                {item.sellerProfileImage ? <img src={item.sellerProfileImage} alt={item.sellerName} className="h-full w-full object-cover" /> : <User size={18} />}
              </button>
              <div>
                <p className="font-semibold text-slate-900">{item.sellerName}</p>
                <p className="text-sm text-slate-500">✨ {item.sellerKarma} Good Karma</p>
              </div>
            </div>
          </div>

          {isOwnListing ? (
            <div className="mt-6">
              <div className="rounded-[1.1rem] border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                Your listing is live. You cannot purchase your own item.
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button onClick={() => onEdit(item)} className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] bg-gradient-to-r from-amber-500 to-violet-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-500/15">
                  <Pencil size={17} />
                  Edit listing
                </button>
                <button onClick={() => onDelete(item)} className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-700 transition hover:bg-rose-100">
                  <Trash2 size={17} />
                  Delete listing
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <button
                onClick={handlePrimary}
                disabled={item.requestState && !item.requestState.canRequest}
                className={`w-full rounded-[1.1rem] px-4 py-3 font-semibold transition-all duration-200 ${
                  item.requestState && !item.requestState.canRequest
                    ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-700'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                }`}
              >
                {item.requestState && !item.requestState.canRequest
                  ? item.requestState.buttonLabel
                  : item.isBusinessProduct || item.listingType === 'business' || item.sellerType === 'business'
                    ? 'Reserve & Collect'
                    : 'Request to Collect'}
              </button>
            </div>
          )}
          {!isOwnListing && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Sparkles size={16} className="text-amber-500" />
              <span>{item.isBusinessProduct
                ? 'Store pickup details and directions are provided immediately with your reservation QR.'
                : 'Seller phone, pickup address, time, and instructions appear only after request acceptance.'}</span>
            </div>
          )}
        </div>
      </div>
      {previewProfileImage && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <button type="button" onClick={() => setPreviewProfileImage('')} className="absolute right-4 top-4 rounded-full bg-white p-3 text-slate-700 shadow-lg" aria-label="Close profile photo"><X size={20} /></button>
          <img src={previewProfileImage} alt={`${item.sellerName} profile`} className="max-h-[82vh] max-w-full rounded-[2rem] object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
