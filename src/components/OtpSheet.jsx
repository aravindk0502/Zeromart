import React, { useState, useRef, useEffect } from 'react';
import { Phone, ShieldCheck, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { sendOtp, verifyOtp } from '../lib/api';
// verifyOtp returns { success, token, user } — token is stored by completeAuth

export default function OtpSheet() {
  const { authGate: gate, completeAuth } = useApp();

  const [step, setStep]       = useState('phone');
  const [phone, setPhone]     = useState('');
  const [otp, setOtp]         = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneErr, setPhoneErr]   = useState('');
  const [otpErr, setOtpErr]       = useState('');
  const [isDemo, setIsDemo]       = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (gate) {
      setStep('phone'); setPhone('');
      setOtp(['', '', '', '', '', '']);
      setPhoneErr(''); setOtpErr('');
    }
  }, [gate]);

  if (!gate) return null;

  async function handleSendOtp() {
    if (!/^\d{10}$/.test(phone)) {
      setPhoneErr('Enter a valid 10-digit mobile number');
      return;
    }
    setPhoneErr('');
    setSending(true);
    try {
      const res = await sendOtp(phone);
      setIsDemo(!!res.demo);
      setStep('otp');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setPhoneErr(err.message || 'Could not send OTP. Try again.');
    } finally {
      setSending(false);
    }
  }

  function handleOtpKey(i, e) {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) {
      const next = [...otp]; next[i] = ''; setOtp(next);
      if (i > 0) inputRefs.current[i - 1]?.focus();
      return;
    }
    const next = [...otp]; next[i] = val[val.length - 1]; setOtp(next);
    if (i < 5) inputRefs.current[i + 1]?.focus();
    else verifyCode([...otp.slice(0, i), val[val.length - 1]].join(''));
  }

  async function verifyCode(code) {
    if (!code || code.length < 6) return;
    setOtpErr('');
    setVerifying(true);
    try {
      const res = await verifyOtp(phone, code);
      setStep('done');
      // Pass Supabase tokens to completeAuth if available
      setTimeout(() => completeAuth(phone, res), 1000);
    } catch (err) {
      setOtpErr(err.message || 'Incorrect OTP. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handleVerify() {
    const code = otp.join('');
    if (code.length < 6) { setOtpErr('Enter the 6-digit OTP'); return; }
    verifyCode(code);
  }

  return (
    <div className="overlay">
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 20px' }} />

        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--zm-green-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <ShieldCheck size={36} color="var(--zm-green)" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>You're in!</div>
            <div style={{ fontSize: 14, color: 'var(--zm-text-muted)' }}>Continuing where you left off…</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Phone size={22} color="var(--zm-accent)" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 4 }}>
                {step === 'phone' ? 'Enter your mobile number' : `OTP sent to +91 ${phone}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.5 }}>
                {step === 'phone'
                  ? 'We use your number only to verify your identity. No spam.'
                  : isDemo
                    ? 'Demo mode — enter any 6 digits to continue.'
                    : 'Enter the 6-digit code sent via SMS.'}
              </div>
            </div>

            {step === 'phone' ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', background: 'var(--zm-surface2)', border: '1px solid var(--zm-border)', borderRadius: 'var(--zm-radius)', fontSize: 14, color: 'var(--zm-text-muted)', flexShrink: 0 }}>
                    🇮🇳 +91
                  </div>
                  <input
                    className="input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setPhoneErr(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                    autoFocus
                    style={{ flex: 1, letterSpacing: 2, fontSize: 18, fontWeight: 600 }}
                  />
                </div>
                {phoneErr && <div style={{ fontSize: 12, color: 'var(--zm-red)', marginBottom: 10 }}>{phoneErr}</div>}
                <button
                  className="btn btn-primary btn-full"
                  style={{ fontSize: 15, padding: '14px', marginTop: 8 }}
                  onClick={handleSendOtp}
                  disabled={sending}
                >
                  {sending ? 'Sending OTP…' : <><ArrowRight size={16} /> Send OTP</>}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => inputRefs.current[i] = el}
                      type="tel"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpKey(i, e)}
                      onKeyDown={e => { if (e.key === 'Backspace' && !digit && i > 0) inputRefs.current[i - 1]?.focus(); }}
                      style={{
                        width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
                        background: 'var(--zm-surface2)', border: `1.5px solid ${digit ? 'var(--zm-accent)' : 'var(--zm-border)'}`,
                        borderRadius: 10, color: 'var(--zm-text)', outline: 'none', fontFamily: 'Inter, sans-serif',
                      }}
                    />
                  ))}
                </div>
                {otpErr && <div style={{ fontSize: 12, color: 'var(--zm-red)', textAlign: 'center', marginBottom: 8 }}>{otpErr}</div>}
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <button onClick={() => setStep('phone')} style={{ background: 'none', border: 'none', color: 'var(--zm-accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    ← Change number
                  </button>
                </div>
                <button
                  className="btn btn-primary btn-full"
                  style={{ fontSize: 15, padding: '14px' }}
                  onClick={handleVerify}
                  disabled={verifying}
                >
                  {verifying ? 'Verifying…' : <><ShieldCheck size={16} /> Verify & Continue</>}
                </button>
              </>
            )}

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--zm-text-dim)' }}>
              By continuing you agree to ZeroMart's Terms &amp; Privacy Policy
            </div>
          </>
        )}
      </div>
    </div>
  );
}
