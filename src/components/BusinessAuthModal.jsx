import { useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, X } from 'lucide-react';
import { getBusinessAccounts, saveBusinessAccounts, saveBusinessSession } from '../lib/businessStore';
import { fetchProfile, sendOtp, setToken, updateProfile, verifyOtp as verifyOtpApi } from '../lib/api';
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
  const [submitting, setSubmitting] = useState(false);
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

  const requestOtp = async (event) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(form.mobile)) return setError('Enter a valid 10-digit mobile number.');
    if (mode === 'signup' && (!form.ownerName || !form.businessName || !form.storeLocation || !form.address)) return setError('Complete all required business details.');
    setSubmitting(true);
    setError('');
    try {
      await sendOtp(form.mobile, { accountType: 'business' });
      setStep('otp');
    } catch (nextError) {
      setError(nextError?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(String(otp || ''))) return setError('Enter a valid 4-digit OTP.');

    setSubmitting(true);
    setError('');
    try {
      const authResult = await verifyOtpApi(form.mobile, otp, { accountType: 'business' });
      if (!authResult?.token) {
        throw new Error('Login failed. Token missing in verification response.');
      }
      setToken(authResult.token, 'business');

      const accounts = getBusinessAccounts();
      const existing = accounts.find((entry) => entry.mobile === form.mobile);
      const authUser = authResult?.user || {};

      if (mode === 'signup') {
        await updateProfile({
          name: form.businessName || form.ownerName || authUser?.name || 'Business Store',
          fullName: form.ownerName || '',
          businessName: form.businessName || '',
          businessType: form.businessType || '',
          registration: form.registration || '',
          mobile: form.mobile,
          storeLocation: form.storeLocation || '',
          address: form.address || '',
          locationData: form.locationData || null,
          accountType: 'business',
          mode: 'business',
        }, {
          accountType: 'business',
          phone: form.mobile,
        });
      }

      let remoteProfile = null;
      try {
        remoteProfile = await fetchProfile({ accountType: 'business', phone: form.mobile });
      } catch {
        remoteProfile = null;
      }

      const profileMetadata = (remoteProfile && typeof remoteProfile.metadata === 'object') ? remoteProfile.metadata : {};
      const accountId = String(remoteProfile?.id || authUser?.id || existing?.id || `business-${Date.now()}`);
      const profileImage = remoteProfile?.profile_image
        || remoteProfile?.profile_image_url
        || remoteProfile?.avatar_url
        || profileMetadata.profileImage
        || profileMetadata.avatarUrl
        || existing?.profileImage
        || existing?.avatarUrl
        || '';

      const account = {
        id: accountId,
        userId: String(authUser?.id || remoteProfile?.id || accountId),
        profileId: String(authUser?.id || remoteProfile?.id || accountId),
        mobile: form.mobile,
        ownerName: remoteProfile?.full_name || profileMetadata.fullName || form.ownerName || existing?.ownerName || authUser?.name || 'Owner',
        businessName: remoteProfile?.business_name || profileMetadata.businessName || form.businessName || existing?.businessName || remoteProfile?.name || authUser?.name || 'Business Store',
        businessType: remoteProfile?.business_type || profileMetadata.businessType || form.businessType || existing?.businessType || 'Supermarket',
        storeLocation: remoteProfile?.store_location || profileMetadata.storeLocation || form.storeLocation || existing?.storeLocation || locationLabel(form.locationData || existing?.locationData || null),
        address: remoteProfile?.address || profileMetadata.address || form.address || existing?.address || '',
        registration: remoteProfile?.registration || profileMetadata.registration || form.registration || existing?.registration || '',
        email: remoteProfile?.email || profileMetadata.email || existing?.email || '',
        city: remoteProfile?.city || profileMetadata.city || existing?.city || '',
        description: remoteProfile?.description || profileMetadata.description || existing?.description || '',
        openingHours: remoteProfile?.opening_hours || profileMetadata.openingHours || existing?.openingHours || '',
        coverImage: remoteProfile?.cover_image_url || profileMetadata.coverImage || existing?.coverImage || '',
        notificationPreferences: remoteProfile?.notification_preferences || profileMetadata.notificationPreferences || existing?.notificationPreferences || {},
        karmaPopupEnabled: typeof remoteProfile?.karma_popup_enabled === 'boolean'
          ? remoteProfile.karma_popup_enabled
          : (profileMetadata.karmaPopupEnabled ?? existing?.karmaPopupEnabled ?? true),
        locationData: remoteProfile?.location_data || profileMetadata.locationData || form.locationData || existing?.locationData || null,
        karma: Number(authUser?.karma ?? remoteProfile?.karma_points ?? remoteProfile?.karma ?? existing?.karma ?? 0) || 0,
        verified: true,
        createdAt: existing?.createdAt || new Date().toISOString(),
        profileImage,
        avatarUrl: profileImage,
      };

      saveBusinessAccounts([account, ...accounts.filter((entry) => entry.mobile !== form.mobile)]);
      saveBusinessSession(account);
      const persistedBusinessUser = {
        ...authUser,
        ...account,
        isBusinessAccount: true,
        businessId: account.id,
        userId: account.userId,
        profileId: account.profileId,
        name: account.businessName || account.ownerName || authUser?.name || 'Business Store',
        profileImage: account.profileImage || account.avatarUrl || '',
      };
      localStorage.setItem('zeromart-user', JSON.stringify(persistedBusinessUser));
      localStorage.setItem('zeromart-user-business', JSON.stringify(persistedBusinessUser));

      onSuccess?.(account);
    } catch (nextError) {
      setError(nextError?.message || 'OTP verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
              <button disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-lg shadow-emerald-600/15 hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2">{submitting ? 'Sending...' : 'Send OTP'}</button>
            </form>
          </>
        ) : (
          <form onSubmit={verifyOtp}>
            <button type="button" onClick={() => { setStep('details'); setError(''); }} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16} /> Change details</button>
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">OTP sent to +91 {form.mobile}. Enter the 4-digit code from SMS.</div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">4-digit OTP<input autoFocus value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="Enter 4-digit OTP" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-emerald-500" /></label>
            {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
            <button disabled={submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-60"><CheckCircle2 size={18} /> {submitting ? 'Verifying...' : 'Verify and continue'}</button>
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
