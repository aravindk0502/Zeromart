import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Check, MapPin, Calendar, ImagePlus } from 'lucide-react';
import LocationPicker from './LocationPicker';
import LocationMap from './LocationMap';
import { useLocationEngine } from '../hooks/useLocationEngine';
import { locationLabel } from '../services/locationService';

const CATEGORIES = ['Food', 'Electronics', 'Books', 'Cosmetics', 'Movie Tickets', 'Others'];

const CONDITIONS = ['Like New', 'Very Good', 'Good', 'Fair'];

const CATEGORY_EMOJIS = {
  Food: '🍱',
  Electronics: '📱',
  Books: '📚',
  Cosmetics: '🧴',
  'Movie Tickets': '🎟️',
  Others: '✨',
};

export default function ListingSheet({ open, onClose, onSubmit, initialItem = null }) {
  const locationEngine = useLocationEngine();
  const [photo, setPhoto]       = useState(null);
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [condition, setCondition] = useState('Good');
  const [expiry, setExpiry] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  // Keep quantity as string to allow empty editing on mobile, coerce to number on submit
  const [totalQuantity, setTotalQuantity] = useState('1');
  const [area, setArea]           = useState('');
  const [coordinates, setCoordinates] = useState(null);
  const [pickupLocation, setPickupLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [posted, setPosted]       = useState(false);
  const fileRef    = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (initialItem) {
      const isKnownCategory = CATEGORIES.includes(initialItem.category);
      setPhoto(initialItem.image || null);
      setTitle(initialItem.title || '');
      setDesc(initialItem.description || '');
      setCategory(isKnownCategory ? initialItem.category : 'Others');
      setCustomCategory(isKnownCategory ? '' : initialItem.category || '');
      setCondition(initialItem.condition || 'Good');
      setExpiry(initialItem.validTill || '');
      setExpiryTime(initialItem.expiryTime || '');
      setTotalQuantity(String(Number(initialItem.totalQuantity || initialItem.quantity || 1)));
      setArea(initialItem.location || '');
      setCoordinates(initialItem.coordinates || null);
      setPickupLocation(initialItem.locationData || null);
      return;
    }
    if (locationEngine.location) {
      setPickupLocation(locationEngine.location);
      setArea(locationLabel(locationEngine.location));
      setCoordinates({ latitude: locationEngine.location.latitude, longitude: locationEngine.location.longitude });
      // Default expiry to today so mobile date input shows date by default
      setExpiry(new Date().toISOString().slice(0, 10));
    }
  }, [locationEngine.location, open, initialItem]);

  if (!open) return null;

  function reset() {
    setPhoto(null); setTitle(''); setDesc('');
    setCategory(''); setCustomCategory(''); setCondition('Good'); setExpiry(''); setExpiryTime(''); setTotalQuantity('1');
    setArea(''); setCoordinates(null); setPickupLocation(null); setPosted(false);
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (file) setPhoto(URL.createObjectURL(file));
  }

  function canPost() {
    return photo && title.trim() && category && pickupLocation
      && (category !== 'Others' || customCategory.trim());
  }

  function doPost() {
    onSubmit({
      title: title.trim(),
      category: category === 'Others' ? customCategory.trim() : category,
      condition,
      description: desc.trim(),
      pickupArea: area.trim(),
      coordinates,
      locationData: pickupLocation,
      image: photo || '',
      validTill: expiry,
      expiryDate: expiry,
      expiryTime,
      totalQuantity: Number(totalQuantity || 1),
      availableQuantity: initialItem ? Number(initialItem.availableQuantity ?? Number(totalQuantity || 1)) : Number(totalQuantity || 1),
      reservedQuantity: Number(initialItem?.reservedQuantity || 0),
      soldQuantity: Number(initialItem?.soldQuantity || 0),
      maxQuantityPerUserPer24h: 2,
      listingType: 'community',
      deliveryMode: 'pickup',
      allowInPersonCollection: true,
    });
    setPosted(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 1400);
  }

  function post() { if (!canPost()) return; doPost(); }
  function close() { reset(); onClose(); }

  const cats = CATEGORIES;

  return (
    <div className="overlay">
      <div className="sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>{initialItem ? 'Edit listing' : 'List for free'}</div>
            <div style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>{initialItem ? 'Update your product details' : 'Photo · details · live instantly'}</div>
          </div>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {posted ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-green-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={32} color="var(--zm-green)" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>Listed! 🎉</div>
            <div style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>
              Your item is now live{area ? ` in ${area}` : ''}. Nearby buyers will be notified.
            </div>
          </div>
        ) : (
          <>
            {/* Photo */}
            <div onClick={() => fileRef.current?.click()} style={{ height: 140, borderRadius: 16, border: `2px dashed ${photo ? 'var(--zm-accent)' : 'var(--zm-border)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden', background: photo ? 'transparent' : 'var(--zm-surface2)', cursor: 'pointer' }}>
              {photo ? (
                <img src={photo} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <Camera size={28} color="var(--zm-text-dim)" style={{ marginBottom: 6 }} />
                  <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Add product photo</span>
                  <span className="hidden sm:inline" style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 2 }}>Click to upload · Required</span>
                  <span className="sm:hidden" style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 2 }}>Use camera or gallery · Required</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:hidden" style={{ marginBottom: 12 }}>
              <button type="button" onClick={() => cameraRef.current?.click()} style={{ borderRadius: 12, border: '1px solid var(--zm-border)', background: 'var(--zm-card)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--zm-text-muted)' }}>
                <Camera size={16} /> Camera
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ borderRadius: 12, border: '1px solid var(--zm-border)', background: 'var(--zm-card)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--zm-text-muted)' }}>
                <ImagePlus size={16} /> Gallery
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />

            {/* Title */}
            <div style={{ marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Product name (e.g. rice bag, speaker, novel)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={60}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      border: `1px solid ${category === cat ? 'var(--zm-accent)' : 'var(--zm-border)'}`,
                      background: category === cat ? 'var(--zm-accent-soft)' : 'transparent',
                      color: category === cat ? 'var(--zm-accent)' : 'var(--zm-text-muted)',
                    }}
                  >
                    {CATEGORY_EMOJIS[cat]} {cat}
                  </button>
                ))}
              </div>
              {category === 'Others' && (
                <input
                  className="input"
                  placeholder="Enter category name"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  maxLength={32}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>

            {/* Condition */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6 }}>Condition</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {CONDITIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    style={{
                      flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      border: `1px solid ${condition === c ? 'var(--zm-green)' : 'var(--zm-border)'}`,
                      background: condition === c ? 'var(--zm-green-soft)' : 'transparent',
                      color: condition === c ? 'var(--zm-green)' : 'var(--zm-text-muted)',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 12 }}>
              <textarea
                className="input textarea"
                placeholder="Description (optional)"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                style={{ fontSize: 13, minHeight: 72 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} /> Valid till
              </div>
              <input
                className="input"
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Total quantity
                <input
                  className="input mt-1"
                  type="number"
                  min="1"
                  value={totalQuantity}
                  onChange={(event) => setTotalQuantity(event.target.value)}
                  onBlur={(event) => {
                    const n = Number(event.target.value);
                    setTotalQuantity(String(Number.isFinite(n) && !Number.isNaN(n) ? Math.max(1, n) : 1));
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Expiry time (optional)
                <input className="input mt-1" type="time" value={expiryTime} onChange={(event) => setExpiryTime(event.target.value)} />
              </label>
            </div>

            {/* Structured pickup location */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--zm-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> Pickup location
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-white p-2 text-emerald-700 shadow-sm"><MapPin size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{area || 'Choose a pickup location'}</p>
                    {pickupLocation?.fullAddress && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{pickupLocation.fullAddress}</p>}
                  </div>
                  <button type="button" onClick={() => setShowLocationPicker(true)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">Change</button>
                </div>
                {pickupLocation && (
                  <div className="mt-3">
                    <LocationMap latitude={pickupLocation.latitude} longitude={pickupLocation.longitude} title={area || 'Listing location'} height={150} />
                    <p className="mt-2 text-xs font-semibold text-emerald-800">Your listing will appear for buyers near {area}.</p>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', marginTop: 4 }}>
                {pickupLocation ? 'Coordinates and full address will be saved with this product.' : 'Choose your store or pickup point before publishing.'}
              </div>
            </div>

            {/* Price row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--zm-surface2)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: 'var(--zm-text-muted)' }}>Listing price</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--zm-green)' }}>₹0</span>
            </div>

            <button
              className="btn btn-primary btn-full"
              style={{ fontSize: 15, padding: '14px' }}
              onClick={post}
              disabled={!canPost()}
            >
              {!photo ? 'Add a photo to continue'
                : !title.trim() ? 'Add a title to continue'
                : !category ? 'Pick a category to continue'
                : !pickupLocation ? 'Choose pickup location'
                : category === 'Others' && !customCategory.trim() ? 'Enter category to continue'
                : initialItem ? 'Save changes' : "Post listing — it's free"}
            </button>
          </>
        )}
      </div>
      <LocationPicker
        open={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelect={(location) => {
          setPickupLocation(location);
          setArea(locationLabel(location));
          setCoordinates({ latitude: location.latitude, longitude: location.longitude });
        }}
        title="Choose Pickup Location"
        requireAddressDetails={false}
        requiredDetails={[]}
        addressTypeDefault="Other"
      />
    </div>
  );
}
