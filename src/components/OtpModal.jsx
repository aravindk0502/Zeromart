import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useLocationEngine } from '../hooks/useLocationEngine';
import { resendOtp, sendOtp, setToken, verifyOtp } from '../lib/api';

export default function OtpModal({ onClose, onVerify }) {
  const locationEngine = useLocationEngine();
  const [step, setStep] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const handleSendOtp = async () => {
    const normalizedMobile = String(mobile || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedMobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await sendOtp(normalizedMobile);
      setMobile(normalizedMobile);
      setStep('otp');
      setResent(false);
    } catch (nextError) {
      setError(nextError?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    const normalizedMobile = String(mobile || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedMobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await resendOtp(normalizedMobile, 'text');
      setResent(true);
    } catch (nextError) {
      setError(nextError?.message || 'Could not resend OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!/^\d{4}$/.test(String(otp || ''))) {
      setError('Enter a valid 4-digit OTP.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const data = await verifyOtp(mobile, otp);
      if (!data?.token) {
        throw new Error('Login did not return a session token.');
      }
      setToken(data.token);
      onVerify({ mobile, token: data.token, user: data.user || null });
    } catch (nextError) {
      setError(nextError?.message || 'Could not verify OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">Mobile login</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">Verify your number</h3>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600">Close</button>
        </div>

        {step === 'phone' ? (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Mobile number
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Enter your number"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-amber-500"
              />
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              One account lets you list for ₹0 and request ₹0 items after the ₹29 yearly buyer access fee.
            </div>
            <button type="button" onClick={() => locationEngine.openPicker({
              title: 'Set your home location',
              requireAddressDetails: false,
              requiredDetails: [],
              addressTypeDefault: 'Home',
            })} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-left">
              <span className="rounded-xl bg-white p-2 text-emerald-700 shadow-sm"><MapPin size={18} /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-slate-800">Your location</strong>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{locationEngine.location ? locationEngine.label : 'Use GPS or choose manually'}</span>
              </span>
              <span className="text-xs font-bold text-emerald-700">Change</span>
            </button>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            <button type="button" onClick={handleSendOtp} disabled={submitting} className="w-full rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {submitting ? 'Sending OTP…' : 'Send OTP'}
            </button>
            <p className="text-center text-sm text-slate-500">You will receive an OTP SMS on this number.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              OTP
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter 4-digit OTP"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-amber-500"
              />
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-700">Drizn account</p>
              <p className="mt-1 text-sm font-semibold text-violet-700">Buy for ₹0. Sell for ₹0. Earn good karma.</p>
            </div>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            {resent && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">OTP resent successfully.</p>}
            <button type="button" onClick={handleVerify} disabled={submitting} className="w-full rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={handleResendOtp} disabled={submitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 disabled:opacity-60">
              {submitting ? 'Please wait…' : 'Resend OTP'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
