import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookmarkPlus, Check, LocateFixed, Loader2, MapPin, X } from 'lucide-react';
import { useLocationEngine } from '../hooks/useLocationEngine';
import {
  formatFullAddress, formatShortAddress, getKnownLocationSuggestions, INDIA_ONLY_ERROR,
  isIndiaLocation, withAddressDetails,
} from '../services/locationService';
import GooglePlacesAutocompleteInput from './GooglePlacesAutocompleteInput';
import LocationMap from './LocationMap';
import { validateCompletedAddress } from '../services/location/addressValidation';

const ADDRESS_TYPES = ['Home', 'Office', 'Store', 'Other'];

export default function LocationPicker({
  open,
  onClose,
  onSelect,
  title = 'Set your location',
  requireAddressDetails = false,
  requiredDetails = [],
  addressTypeDefault = 'Home',
  zIndex = 180,
}) {
  const engine = useLocationEngine();
  const [selectedLocation, setSelectedLocation] = useState(engine.location);
  const [searchError, setSearchError] = useState('');
  const [resolvingPin, setResolvingPin] = useState(false);
  const [gpsPending, setGpsPending] = useState(false);
  const [addressDetails, setAddressDetails] = useState({
    doorNo: '',
    buildingName: '',
    floor: '',
    landmark: '',
    addressType: addressTypeDefault,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedLocation(engine.location);
    setAddressDetails({
      doorNo: engine.location?.doorNo || '',
      buildingName: engine.location?.buildingName || '',
      floor: engine.location?.floor || '',
      landmark: engine.location?.landmark || '',
      addressType: engine.location?.addressType || addressTypeDefault,
    });
    setSearchError('');
    setGpsPending(false);
  }, [engine.location, open, addressTypeDefault]);

  const recentLocations = useMemo(() => {
    if (engine.recentLocations.length) return engine.recentLocations;
    return getKnownLocationSuggestions().slice(0, 5);
  }, [engine.recentLocations, open]);

  if (!open) return null;

  const detectGps = async () => {
    if (gpsPending) return;
    setGpsPending(true);
    setSearchError('');
    try {
      const location = await engine.detectCurrentLocation();
      if (!location) throw new Error('Current location was not available. Search for an address manually.');
      const nextDetails = {
        doorNo: location?.doorNo || '',
        buildingName: location?.buildingName || '',
        floor: location?.floor || '',
        landmark: location?.landmark || '',
        addressType: location?.addressType || addressTypeDefault,
      };
      setSelectedLocation(location);
      setAddressDetails(nextDetails);
      setSearchError('');
      if (!requireAddressDetails && requiredDetails.length === 0) {
        const finalLocation = await validateCompletedAddress(withAddressDetails(location, nextDetails));
        if (onSelect) onSelect(finalLocation);
        else engine.setLocation(finalLocation);
        onClose?.();
      }
    } catch (error) {
      const message = Number(error?.code) === 1
        ? 'Location access is blocked. Enable it in browser settings or search manually.'
        : Number(error?.code) === 2 || Number(error?.code) === 3
          ? 'Current location is unavailable after two attempts. Search for an address manually.'
          : error?.message || 'Current location could not be detected. Search for an address manually.';
      setSearchError(message);
    } finally {
      setGpsPending(false);
    }
  };

  const buildFinalLocation = () => {
    if (!selectedLocation) throw new Error('Choose a location first.');
    if (!isIndiaLocation(selectedLocation)) throw new Error(INDIA_ONLY_ERROR);
    const missing = requiredDetails.filter((field) => !String(addressDetails[field] || '').trim());
    if (missing.length) {
      const labels = { doorNo: 'Door / Flat No.', buildingName: 'Building / Apartment Name', landmark: 'Landmark' };
      throw new Error(`Enter ${missing.map((field) => labels[field] || field).join(', ')} to continue.`);
    }
    return withAddressDetails(selectedLocation, addressDetails);
  };

  const confirm = async () => {
    try {
      const finalLocation = await validateCompletedAddress(buildFinalLocation());
      if (onSelect) onSelect(finalLocation);
      else engine.setLocation(finalLocation);
      onClose?.();
    } catch (error) {
      setSearchError(error?.message || 'Check the address and try again.');
    }
  };

  const saveAddress = async () => {
    try {
      const finalLocation = await validateCompletedAddress(buildFinalLocation());
      engine.saveLocation(finalLocation);
      setSelectedLocation(finalLocation);
      setSearchError('');
    } catch (error) {
      setSearchError(error?.message || 'This address could not be saved.');
    }
  };

  const shortAddress = selectedLocation ? formatShortAddress(selectedLocation) : '';
  const fullAddress = selectedLocation ? formatFullAddress(selectedLocation) : '';
  const visibleLocationError = searchError || engine.locationError;

  return (
    <div style={{ zIndex }} className="fixed inset-0 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="max-h-[calc(100dvh-8px)] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[1.75rem]">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-emerald-100 bg-white/95 p-4 backdrop-blur">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"><ArrowLeft size={16} /> Back</button>
          <h2 className="px-2 text-center text-lg font-extrabold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2.5 text-slate-500" aria-label="Close location picker"><X size={17} /></button>
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          {engine.permissionStatus !== 'denied' && (
            <button onClick={detectGps} disabled={gpsPending} className="flex w-full items-center gap-3 rounded-2xl bg-emerald-700 p-4 text-left text-white shadow-lg shadow-emerald-700/15 disabled:cursor-wait disabled:opacity-60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><LocateFixed size={21} /></span>
              <span className="min-w-0 flex-1">
                <strong className="block">Use current location</strong>
                <span className="mt-1 block text-xs text-emerald-100">Detect precise GPS location and street address</span>
              </span>
              {gpsPending && <Loader2 size={18} className="shrink-0 animate-spin" />}
            </button>
          )}

          {engine.notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{engine.notice}</p>}
          {visibleLocationError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{visibleLocationError}</p>}

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Search an Indian location</p>
            <GooglePlacesAutocompleteInput
              onSelect={(location) => {
                if (!isIndiaLocation(location)) {
                  setSearchError(INDIA_ONLY_ERROR);
                  return;
                }
                setSelectedLocation(location);
                setAddressDetails({
                  doorNo: location.doorNo || '',
                  buildingName: '',
                  floor: '',
                  landmark: '',
                  addressType: addressTypeDefault,
                });
                setSearchError('');
              }}
            />
          </div>

          {recentLocations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Recent locations</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {recentLocations.map((location) => (
                  <button key={`${location.latitude}:${location.longitude}`} onClick={() => {
                    setSelectedLocation(location);
                    setAddressDetails({
                      doorNo: location.doorNo || '',
                      buildingName: location.buildingName || '',
                      floor: location.floor || '',
                      landmark: location.landmark || '',
                      addressType: location.addressType || addressTypeDefault,
                    });
                  }} className={`flex min-w-0 items-start gap-2 rounded-xl border p-3 text-left transition ${selectedLocation?.latitude === location.latitude && selectedLocation?.longitude === location.longitude ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-100 bg-slate-50 hover:border-emerald-200'}`}>
                    <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                    <span className="min-w-0">
                      <strong className="block truncate text-sm text-slate-900">{formatShortAddress(location)}</strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{location.city || location.state || 'India'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {engine.savedLocations?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Saved locations</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {engine.savedLocations.map((location) => (
                  <button key={`saved-${location.latitude}:${location.longitude}`} onClick={() => {
                    setSelectedLocation(location);
                    setAddressDetails({
                      doorNo: location.doorNo || '',
                      buildingName: location.buildingName || '',
                      floor: location.floor || '',
                      landmark: location.landmark || '',
                      addressType: location.addressType || addressTypeDefault,
                    });
                  }} className="flex min-w-0 items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left transition hover:border-violet-300">
                    <BookmarkPlus size={16} className="mt-0.5 shrink-0 text-violet-700" />
                    <span className="min-w-0">
                      <strong className="block truncate text-sm text-slate-900">{formatShortAddress(location)}</strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{location.formattedAddress}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedLocation && (
            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
              <div className="relative">
                <LocationMap
                  latitude={selectedLocation.latitude}
                  longitude={selectedLocation.longitude}
                  title={shortAddress}
                  height={220}
                  interactive
                  onLocationChange={async ({ latitude, longitude }) => {
                    setResolvingPin(true);
                    setSearchError('');
                    try {
                      const location = await engine.reverseGeocode(latitude, longitude, 'map-pin');
                      setSelectedLocation(location);
                    } catch (error) {
                      setSelectedLocation((current) => ({ ...current, latitude, longitude, lat: latitude, lng: longitude, source: 'map-pin' }));
                      setSearchError(error?.message || 'The pin moved, but its street address could not be loaded.');
                    } finally {
                      setResolvingPin(false);
                    }
                  }}
                />
                {resolvingPin && <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow"><Loader2 size={14} className="animate-spin" /> Updating address</span>}
              </div>
              <div className="px-1">
                <p className="font-extrabold text-slate-900">{shortAddress}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{fullAddress}</p>
                {selectedLocation.postalCode && <p className="mt-1 text-xs font-bold text-emerald-700">Pincode {selectedLocation.postalCode}</p>}
                <p className="mt-2 text-xs font-semibold text-emerald-700">Drag the map pin to refine the exact location.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3 text-xs sm:grid-cols-3">
                <MappedField label="Street" value={selectedLocation.street} />
                <MappedField label="Area" value={selectedLocation.subLocality || selectedLocation.area || selectedLocation.locality} />
                <MappedField label="City" value={selectedLocation.city} />
                <MappedField label="District" value={selectedLocation.district} />
                <MappedField label="State" value={selectedLocation.state} />
                <MappedField label="Pincode" value={selectedLocation.postalCode} />
              </div>
            </div>
          )}

          {selectedLocation && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-slate-900">Pickup details (optional)</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Your selected map location is enough. Add these details only when they are useful.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Optional</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AddressField
                  label="Door / Flat No. (optional)"
                  value={addressDetails.doorNo}
                  required={requiredDetails.includes('doorNo')}
                  onChange={(value) => setAddressDetails((current) => ({ ...current, doorNo: value }))}
                />
                <AddressField
                  label="Building / Apartment Name (optional)"
                  value={addressDetails.buildingName}
                  required={requiredDetails.includes('buildingName')}
                  onChange={(value) => setAddressDetails((current) => ({ ...current, buildingName: value }))}
                />
                <AddressField
                  label="Floor (optional)"
                  value={addressDetails.floor}
                  onChange={(value) => setAddressDetails((current) => ({ ...current, floor: value }))}
                />
                <AddressField
                  label="Landmark (optional)"
                  value={addressDetails.landmark}
                  required={requiredDetails.includes('landmark')}
                  onChange={(value) => setAddressDetails((current) => ({ ...current, landmark: value }))}
                />
              </div>
              <p className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">Address type</p>
              <div className="grid grid-cols-4 gap-2">
                {ADDRESS_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAddressDetails((current) => ({ ...current, addressType: type }))}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition ${addressDetails.addressType === type ? 'border-emerald-600 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button onClick={confirm} disabled={!selectedLocation || resolvingPin} className="w-full rounded-2xl bg-emerald-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-emerald-700/15 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
            Confirm this location
            </button>
            <button type="button" disabled={!selectedLocation} onClick={saveAddress} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5 font-bold text-violet-700 disabled:opacity-40">
              <BookmarkPlus size={17} /> Save
            </button>
          </div>
          {selectedLocation && <p className="-mt-2 text-center text-xs text-slate-400">{shortAddress}</p>}
        </div>
      </section>
    </div>
  );
}

function AddressField({ label, value, onChange, required, className = '' }) {
  return (
    <label className={`text-xs font-bold text-slate-700 ${className}`}>
      {label}{required && <span className="text-rose-600"> *</span>}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50"
      />
    </label>
  );
}

function MappedField({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-2.5">
      <p className="font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate font-bold text-slate-700">{value}</p>
    </div>
  );
}
