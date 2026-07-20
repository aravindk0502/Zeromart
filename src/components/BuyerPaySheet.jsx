import React, { useState } from 'react';
import { X, ShoppingBag, CheckCircle, Zap, Star } from 'lucide-react';
import { createBuyerAccessOrder, verifyBuyerAccessPayment } from '../lib/api';

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const CREATE_ORDER_TIMEOUT_MS = 15000;
const SCRIPT_LOAD_TIMEOUT_MS = 10000;
const CHECKOUT_INIT_TIMEOUT_MS = 5000;
const FALLBACK_ERROR_MESSAGE = 'Unable to open secure payment. Please try again.';

let razorpayScriptPromise = null;

function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payments are only available in the browser.'));
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      razorpayScriptPromise = null;
      reject(new Error('Razorpay script load timed out.'));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };

    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.Razorpay) {
        finish(() => resolve(true));
        return;
      }
      existing.addEventListener('load', () => finish(() => resolve(true)), { once: true });
      existing.addEventListener('error', () => finish(() => {
        razorpayScriptPromise = null;
        reject(new Error('Could not load Razorpay checkout.'));
      }), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => finish(() => resolve(true));
    script.onerror = () => finish(() => {
      razorpayScriptPromise = null;
      reject(new Error('Could not load Razorpay checkout.'));
    });
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function toVisibleErrorMessage(error) {
  const message = String(error?.message || '').trim();
  if (!message) return FALLBACK_ERROR_MESSAGE;
  if (/payment was cancelled\.?/i.test(message)) return 'Payment was cancelled.';
  return `${FALLBACK_ERROR_MESSAGE}${message ? ` (${message})` : ''}`;
}

export default function BuyerPaySheet({ open, onClose, onComplete }) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const normalizeOrderResponse = (order) => ({
    orderId: order?.orderId || order?.order_id || order?.id || '',
    amount: Number(order?.amount ?? 0),
    currency: String(order?.currency || 'INR'),
    keyId: order?.keyId || order?.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID || '',
  });

  const loadCheckoutScript = async () => {
    console.log('[BuyerAccess] Razorpay script start');
    const script = await withTimeout(loadRazorpayScript(), SCRIPT_LOAD_TIMEOUT_MS, 'Razorpay script load timed out.');
    console.log('[BuyerAccess] Razorpay script ready', { loaded: Boolean(script), hasRazorpay: Boolean(window?.Razorpay) });
    return script;
  };

  async function handlePay(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log('[BuyerAccess] click');
    setError('');
    setPreparing(true);
    try {
      console.log('[BuyerAccess] create-order start', {
        path: '/api/payments/create-order',
        planCode: 'buyer_access_annual_29',
        timeoutMs: CREATE_ORDER_TIMEOUT_MS,
      });
      const orderResponse = await withTimeout(
        createBuyerAccessOrder(2900),
        CREATE_ORDER_TIMEOUT_MS,
        'Create-order request timed out.'
      );
      console.log('[BuyerAccess] create-order response', orderResponse);

      const order = normalizeOrderResponse(orderResponse);
      if (!order.orderId) {
        throw new Error('Missing orderId in create-order response');
      }
      if (!order.keyId) {
        throw new Error('Missing keyId in create-order response');
      }
      if (order.amount !== 2900) {
        throw new Error(`Invalid amount in create-order response: ${order.amount || 'missing'}`);
      }
      if (order.currency !== 'INR') {
        throw new Error(`Invalid currency in create-order response: ${order.currency || 'missing'}`);
      }
      if (String(order.keyId).toLowerCase() === 'demo') {
        throw new Error('Secure payment is not configured yet. Please try again shortly.');
      }

      await loadCheckoutScript();

      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Razorpay Checkout failed to load.');
      }

      console.log('[BuyerAccess] checkout init start', {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        hasRazorpay: Boolean(window.Razorpay),
      });

      const payment = await withTimeout(new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          callback();
        };

        let checkout;
        try {
          const options = {
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
                const verification = await verifyBuyerAccessPayment({
                  planCode: 'buyer_access_annual_29',
                  amount: order.amount,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                finish(() => resolve({ response: { orderId: response?.razorpay_order_id, paymentId: response?.razorpay_payment_id }, verification }));
              } catch (verificationError) {
                finish(() => reject(verificationError));
              }
            },
            modal: {
              ondismiss: () => {
                setPreparing(false);
                setError('Payment was cancelled.');
                finish(() => reject(new Error('Payment was cancelled.')));
              },
            },
            theme: {
              color: '#f59e0b',
            },
          };

          checkout = new window.Razorpay(options);
        } catch (initializationError) {
          finish(() => reject(initializationError));
          return;
        }

        checkout.on('payment.failed', (response) => {
          const failureMessage = response?.error?.description || response?.error?.reason || 'Payment failed.';
          finish(() => reject(new Error(failureMessage)));
        });

        console.log('[BuyerAccess] opening checkout');
        checkout.open();
        console.log('[BuyerAccess] checkout.open called');
        console.log('[BuyerAccess] checkout opened');
      }), CHECKOUT_INIT_TIMEOUT_MS, 'Checkout initialization timed out.');

      await Promise.resolve(onComplete?.(payment));
      onClose?.();
    } catch (err) {
      console.error('[BuyerAccess] error', {
        step: String(err?.message || err),
        message: String(err?.message || err),
        hasRazorpay: typeof window !== 'undefined' ? Boolean(window.Razorpay) : false,
      });
      setError(toVisibleErrorMessage(err));
    } finally {
      setPreparing(false);
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
          type="button"
          className="btn btn-primary btn-full"
          style={{ fontSize: 16, padding: '15px' }}
          onClick={handlePay}
          disabled={preparing}
        >
          {preparing ? 'Preparing secure payment…' : 'Pay ₹29 for yearly access'}
        </button>

        <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
