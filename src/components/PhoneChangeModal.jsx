import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { confirmPhoneChange, initiatePhoneChange, setToken } from '../lib/api';

const DIGITS_ONLY = /\D/g;

const normalizeTenDigits = (value = '') => String(value || '').replace(DIGITS_ONLY, '').slice(-10);

export default function PhoneChangeModal({
  open = false,
  currentPhone = '',
  title = 'Change phone number',
  subtitle = 'Secure OTP verification',
  onClose,
  onSuccess,
}) {
  const currentMasked = useMemo(() => `+91 ******${String(currentPhone || '').replace(DIGITS_ONLY, '').slice(-4)}`, [currentPhone]);
  const [step, setStep] = useState('phone');
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleStart = async () => {
    const phoneDigits = normalizeTenDigits(newPhone);
    if (!/^\d{10}$/.test(phoneDigits)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (normalizeTenDigits(currentPhone) === phoneDigits) {
      setError('New phone number must be different from current number.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    setOtp('');
    try {
      const result = await initiatePhoneChange(phoneDigits);
      setNewPhone(phoneDigits);
      setStep('otp');
      if (result?.expiresAt) {
        setNotice('OTP sent. It expires in about 10 minutes.');
      } else {
        setNotice('OTP sent to your new mobile number.');
      }
    } catch (nextError) {
      setError(nextError?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    const phoneDigits = normalizeTenDigits(newPhone);
    const otpValue = String(otp || '').trim();
    if (!/^\d{10}$/.test(phoneDigits)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!/^\d{4}$/.test(otpValue)) {
      setError('Enter a valid 4-digit OTP.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const result = await confirmPhoneChange(phoneDigits, otpValue);
      if (result?.token) setToken(result.token);
      onSuccess?.(result);
      setStep('phone');
      setNewPhone('');
      setOtp('');
      setNotice('');
    } catch (nextError) {
      setError(nextError?.message || 'OTP verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-700">{subtitle}</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm text-slate-500">Current number: {currentMasked}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        {step === 'phone' ? (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              New mobile number
              <input
                type="tel"
                inputMode="numeric"
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value.replace(DIGITS_ONLY, '').slice(0, 10))}
                placeholder="Enter 10-digit mobile"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              We will send an OTP to this number and update your account only after verification.
            </div>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            {notice && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
            <button
              type="button"
              onClick={handleStart}
              disabled={submitting}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError('');
                setNotice('');
              }}
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"
            >
              <ArrowLeft size={16} /> Change number
            </button>
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              OTP sent to +91 {newPhone}
            </p>
            <label className="block text-sm font-semibold text-slate-700">
              4-digit OTP
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(DIGITS_ONLY, '').slice(0, 4))}
                placeholder="Enter OTP"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-emerald-500"
              />
            </label>
            {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            {notice && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              <CheckCircle2 size={18} /> {submitting ? 'Verifying...' : 'Verify and update'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
