import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { useLocationEngine } from '../hooks/useLocationEngine';

export default function LocationPermissionScreen() {
  const engine = useLocationEngine();
  if (!engine.showPermission) return null;
  const detectAndCompleteAddress = async () => {
    try {
      await engine.useCurrentLocation();
      engine.openPicker({
        title: 'Confirm your location',
        requireAddressDetails: false,
        requiredDetails: [],
        addressTypeDefault: 'Home',
      });
    } catch {
      // The location engine displays the permission or Google Maps error.
    }
  };
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-[linear-gradient(145deg,#ecfdf5_0%,#ffffff_48%,#fff7ed_100%)] p-4">
      <section className="w-full max-w-md rounded-[2rem] border border-emerald-100 bg-white p-6 text-center shadow-[0_30px_100px_rgba(5,150,105,0.18)] sm:p-8">
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] bg-emerald-700 text-white shadow-xl shadow-emerald-700/25">
          <MapPin size={42} />
          <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-emerald-950 ring-4 ring-white"><Navigation size={16} /></span>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">Enable Location</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">We use your location to show nearby products, local businesses and accurate pickup distances.</p>
        {engine.permissionStatus === 'denied' && (
          <p className="mx-auto mt-3 max-w-sm rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Enable location from browser settings, or choose address manually.
          </p>
        )}
        {engine.error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{engine.error}</p>}
        <button onClick={detectAndCompleteAddress} disabled={engine.status === 'locating'} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-emerald-700/20 disabled:opacity-60"><LocateFixed size={19} />{engine.status === 'locating' ? 'Detecting location...' : 'Allow Location'}</button>
        <button onClick={engine.chooseManually} className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3.5 font-bold text-emerald-800">Open manual search</button>
        <p className="mt-4 text-xs leading-5 text-slate-400">Coordinates power distance and collection eligibility. Your precise address is only used for location features.</p>
      </section>
    </div>
  );
}
