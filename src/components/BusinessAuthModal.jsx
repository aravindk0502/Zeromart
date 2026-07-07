import { useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, X } from 'lucide-react';
import { getBusinessAccounts, saveBusinessAccounts, saveBusinessSession } from '../lib/businessStore';
import LocationPicker from './LocationPicker';
import { useLocationEngine } from '../hooks/useLocationEngine';
import { locationLabel } from '../services/locationService';

const TYPES = ['Supermarket', 'Restaurant', 'Bakery', 'Dairy Store', 'Cosmetics Store', 'Pharmacy', 'Cloud Kitchen', 'Grocery Store'];
const EMPTY = { ownerName: '', mobile: '', businessName: '', businessType: 'Supermarket', storeLocation: '', address: '', registration: '', locationData: null };

export default function BusinessAuthModal({ open = true, onClose, onSuccess, embedded = false }) {
  const locationEngine = useLocationEngine();
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('details');
  const [form, setForm] = useState(EMPTY);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  if (!open) return null;

  const handleBack = () => {
    if (step === 'otp') {
      setStep('details');
      setError('');
      return;
    }
    onClose?.();
  };

  const requestOtp = (event) => {
    event.preventDefault();
    const accounts = getBusinessAccounts();
    if (!/^\d{10}$/.test(form.mobile)) return setError('Enter a valid 10-digit mobile number.');
    if (mode === 'login' && !accounts.some((account) => account.mobile === form.mobile)) return setError('No business account found. Choose Sign up to create one.');
    if (mode === 'signup' && (!form.ownerName || !form.businessName || !form.storeLocation || !form.address)) return setError('Complete all required business details.');
    setError('');
    setStep('otp');
  };

  const verifyOtp = (event) => {
    event.preventDefault();
    if (otp !== '123456') return setError('Incorrect OTP. Use 123456.');
    const accounts = getBusinessAccounts();
    let account = accounts.find((entry) => entry.mobile === form.mobile);
    if (mode === 'signup') {
      account = { id: account?.id || `business-${Date.now()}`, ...form, karma: account?.karma || 0, verified: true, createdAt: account?.createdAt || new Date().toISOString() };
      saveBusinessAccounts([account, ...accounts.filter((entry) => entry.mobile !== form.mobile)]);
    }
    saveBusinessSession(account);
    onSuccess?.(account);
  };

  const content = (
    <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[1.75rem] border border-emerald-100 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
      <div className="sticky top-0 z-20 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={handleBack} className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-emerald-50">
            <ArrowLeft size={16} /> Back
          </button>
          {onClose && <button onClick={onClose} className="rounded-full bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200" aria-label="Close"><X size={18} /></button>}
        </div>
        <div className="mt-4 flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Building2 size={21} /></div>
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Drizn Business</p><h2 className="mt-1 text-xl font-bold text-slate-900">{step === 'otp' ? 'Verify mobile number' : mode === 'login' ? 'Business Login' : 'Create business account'}</h2></div>
        </div>
      </div>
      <div className="p-5">
        {step === 'details' ? (
          <>
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {['login', 'signup'].map((entry) => <button key={entry} onClick={() => { setMode(entry); setError(''); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === entry ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>{entry === 'login' ? 'Login' : 'Sign up'}</button>)}
            </div>
            <form onSubmit={requestOtp} className="grid gap-3 sm:grid-cols-2">
              {mode === 'signup' && <><Field label="Owner name" value={form.ownerName} onChange={(value) => setForm({ ...form, ownerName: value })} /><Field label="Business name" value={form.businessName} onChange={(value) => setForm({ ...form, businessName: value })} /></>}
              <Field label="Mobile number" value={form.mobile} onChange={(value) => setForm({ ...form, mobile: value.replace(/\D/g, '').slice(0, 10) })} inputMode="tel" />
              {mode === 'signup' && <>
                <label className="text-sm font-semibold text-slate-700">Business type<select value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-emerald-500">{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:col-span-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">Store location</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-800">{form.locationData ? locationLabel(form.locationData) : 'No location selected'}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{form.locationData?.fullAddress || 'Use GPS or search for the exact store address.'}</p>
                    </div>
                    <button type="button" onClick={() => setShowLocationPicker(true)} className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">Choose</button>
                  </div>
                </div>
                <Field label="GST / FSSAI number (optional)" value={form.registration} onChange={(value) => setForm({ ...form, registration: value })} className="sm:col-span-2" />
              </>}
              {error && <p className="text-sm font-semibold text-rose-600 sm:col-span-2">{error}</p>}
              <button className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-lg shadow-emerald-600/15 hover:bg-emerald-700 sm:col-span-2">Send OTP</button>
            </form>
          </>
        ) : (
          <form onSubmit={verifyOtp}>
            <button type="button" onClick={() => { setStep('details'); setError(''); }} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16} /> Change details</button>
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">OTP sent to +91 {form.mobile}. Use OTP: <strong>123456</strong></div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">6-digit OTP<input autoFocus value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-emerald-500" /></label>
            {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"><CheckCircle2 size={18} /> Verify and continue</button>
          </form>
        )}
      </div>
    </div>
  );
  const picker = (
    <LocationPicker
      open={showLocationPicker}
      onClose={() => setShowLocationPicker(false)}
      onSelect={(location) => {
        locationEngine.setLocation(location);
        setForm((current) => ({ ...current, locationData: location, storeLocation: locationLabel(location), address: location.fullAddress }));
        setError('');
        setShowLocationPicker(false);
      }}
      title="Choose Store Location"
      requireAddressDetails={false}
      requiredDetails={[]}
      addressTypeDefault="Store"
    />
  );
  if (embedded) return <><div className="flex min-h-screen items-start justify-center overflow-y-auto bg-slate-50 p-3 sm:items-center sm:p-4">{content}</div>{picker}</>;
  return <><div className="fixed inset-0 z-[150] overflow-y-auto bg-slate-950/50 backdrop-blur-sm"><div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-4">{content}</div></div>{picker}</>;
}

function Field({ label, value, onChange, inputMode, className = '' }) {
  return <label className={`text-sm font-semibold text-slate-700 ${className}`}>{label}<input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50" /></label>;
}
