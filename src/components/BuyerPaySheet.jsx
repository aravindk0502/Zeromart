import React, { useState } from 'react';
import { X, ShoppingBag, CheckCircle, Zap, Star } from 'lucide-react';
import { createBuyerAccessOrder, verifyBuyerAccessPayment } from '../lib/api';

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayScriptPromise = null;

function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payments are only available in the browser.'));
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay checkout.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export default function BuyerPaySheet({ open, onClose, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const normalizeOrderResponse = (order) => ({
    orderId: order?.orderId || order?.order_id || order?.id || '',
    amount: Number(order?.amount ?? 0),
    currency: String(order?.currency || 'INR'),
    keyId: order?.keyId || order?.key_id || '',
  });

  const loadCheckoutScript = async () => {
    const script = await loadRazorpayScript();
    console.log('[buyer-access] Razorpay script loaded', { loaded: Boolean(script) });
    return script;
  };

  async function handlePay() {
    console.log('[buyer-access] button clicked');
    setError('');
    setLoading(true);
    try {
      console.log('[buyer-access] create-order request started', { amount: 2900, planCode: 'buyer_access_annual_29' });
      const orderResponse = await createBuyerAccessOrder(2900);
      console.log('[buyer-access] create-order response received', orderResponse);

      const order = normalizeOrderResponse(orderResponse);
      if (!order.orderId) {
        throw new Error('Missing orderId in create-order response');
      }
      if (!order.keyId) {
        throw new Error('Missing keyId in create-order response');
      }
      if (!order.amount) {
        throw new Error('Missing amount in create-order response');
      }
      if (!order.currency) {
        throw new Error('Missing currency in create-order response');
      }
      if (String(order.keyId).toLowerCase() === 'demo') {
        throw new Error('Secure payment is not configured yet. Please try again shortly.');
      }

      await loadCheckoutScript();

      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Razorpay Checkout failed to load.');
      }

      console.log('[buyer-access] checkout initializing', order);

      const payment = await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'Drizn',
          description: 'Buyer access for ₹0 requests',
          order_id: order.orderId,
          prefill: order.prefill || undefined,
          notes: {
            plan: 'buyer_access_annual_29',
          },
          handler: async (response) => {
            try {
              console.log('[buyer-access] payment success', response);
              const verification = await verifyBuyerAccessPayment({
                planCode: 'buyer_access_annual_29',
                amount: order.amount,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              resolve({ response, verification });
            } catch (verificationError) {
              console.error('[buyer-access] verification failed', verificationError);
              reject(verificationError);
            }
          },
          modal: {
            ondismiss: () => {
              console.log('[buyer-access] checkout dismissed');
              reject(new Error('Payment cancelled.'));
            },
          },
          theme: {
            color: '#f59e0b',
          },
        });

        console.log('[buyer-access] checkout initialized');

        checkout.on('payment.failed', (response) => {
          const failureMessage = response?.error?.description || response?.error?.reason || 'Payment failed.';
          console.error('[buyer-access] payment failure', response);
          reject(new Error(failureMessage));
        });

        console.log('[buyer-access] opening checkout');
        checkout.open();
        console.log('[buyer-access] checkout opened');
      });

      await Promise.resolve(onComplete?.(payment));
      onClose?.();
    } catch (err) {
      console.error('[buyer-access] payment flow failed', err);
      setError(err.message || 'Payment failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overlay">
      <div className="sheet">
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--zm-border)', margin: '0 auto 20px' }} />

        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ShoppingBag size={28} color="var(--zm-accent)" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>Platform fee for buyer access</div>
          <div style={{ fontSize: 13, color: 'var(--zm-text-muted)', lineHeight: 1.6 }}>
            Pay ₹29 once per year for buyer access.<br />Then request any ₹0 item on Drizn.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {[
            { icon: <ShoppingBag size={14} />, text: 'Request any listed item' },
            { icon: <Zap size={14} />,         text: 'In-person collect for nearby items' },
            { icon: <Star size={14} />,        text: 'Give karma to sellers' },
            { icon: <CheckCircle size={14} />, text: 'Save favourite sellers and items' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--zm-surface2)', borderRadius: 10 }}>
              <span style={{ color: 'var(--zm-accent)' }}>{item.icon}</span>
              <span style={{ fontSize: 14 }}>{item.text}</span>
              <CheckCircle size={14} color="var(--zm-green)" style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'Sora, sans-serif', color: 'var(--zm-accent)' }}>₹29</div>
          <div style={{ fontSize: 12, color: 'var(--zm-text-dim)' }}>Once per year • Full buyer access • No auto-renew</div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--zm-red)', textAlign: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--zm-red-soft)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          style={{ fontSize: 16, padding: '15px' }}
          onClick={handlePay}
          disabled={loading}
        >
          {loading ? 'Preparing secure payment…' : 'Pay ₹29 for yearly access'}
        </button>

        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
