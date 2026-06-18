import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const STEPS = [
  {
    emoji: '🌱',
    title: 'Welcome to ZeroMart',
    subtitle: 'Give freely. Receive abundantly.',
    body: 'ZeroMart is built on one simple truth — the more you give, the more flows back to you. Everything here is listed at ₹0, because generosity is the real currency.',
    bg: 'linear-gradient(135deg, rgba(124,92,252,0.15) 0%, rgba(45,212,160,0.06) 100%)',
    accent: 'var(--zm-accent)',
  },
  {
    emoji: '🏷️',
    title: 'Be a Giver',
    subtitle: 'Your clutter is someone\'s treasure.',
    body: 'Switch to Seller mode and list anything you no longer need — books, clothes, gadgets, furniture. Photo + description, and it\'s live in seconds. Always free.',
    bg: 'linear-gradient(135deg, rgba(124,92,252,0.12) 0%, transparent 100%)',
    accent: 'var(--zm-accent)',
    highlight: 'seller',
  },
  {
    emoji: '🛍️',
    title: 'Be a Receiver',
    subtitle: 'One-time ₹29. Yours forever.',
    body: 'Switch to Buyer mode with a single ₹29 payment — no subscription, no renewals. Browse anything nearby, request delivery, or meet the seller in person.',
    bg: 'linear-gradient(135deg, rgba(45,212,160,0.12) 0%, transparent 100%)',
    accent: 'var(--zm-green)',
    highlight: 'buyer',
  },
  {
    emoji: '✨',
    title: 'Do Good. Get Good.',
    subtitle: 'Karma is real here.',
    body: 'Every item you give away earns you a karma point — a piece of good energy the universe sends right back. High karma = delivery credits, brand vouchers, and more people trusting you.',
    bg: 'linear-gradient(135deg, rgba(245,166,35,0.14) 0%, rgba(124,92,252,0.06) 100%)',
    accent: 'var(--zm-amber)',
    karmaDemo: true,
  },
  {
    emoji: '🔄',
    title: 'The Giving Circle',
    subtitle: 'What goes around, comes around.',
    body: 'When you give a book, karma comes back. Use that karma to unlock Swiggy vouchers, delivery credits, and brand rewards. The more you give, the more you get — that\'s the ZeroMart cycle.',
    bg: 'linear-gradient(135deg, rgba(245,166,35,0.10) 0%, rgba(45,212,160,0.08) 100%)',
    accent: 'var(--zm-green)',
  },
  {
    emoji: '📍',
    title: 'Meet your neighbour',
    subtitle: 'Give in person. Build community.',
    body: 'Items within 1 km? Skip the courier. Request an in-person handoff, a temporary chat opens to coordinate, and disappears once the exchange is done. Zero waste, real connection.',
    bg: 'linear-gradient(135deg, rgba(45,212,160,0.10) 0%, transparent 100%)',
    accent: 'var(--zm-green)',
  },
  {
    emoji: '🤖',
    title: 'ZeroBot finds it for you',
    subtitle: 'Just ask. It searches.',
    body: 'Type "find books near me" or "any electronics?" — ZeroBot searches all nearby listings and shows you results right inside the chat. Ask it anything about the platform too.',
    bg: 'linear-gradient(135deg, rgba(124,92,252,0.12) 0%, transparent 100%)',
    accent: 'var(--zm-accent)',
  },
];

export default function OnboardingTour() {
  const { user, setUser } = useApp();
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  if (user.hasSeenTour) return null;

  function finish() {
    setExiting(true);
    setTimeout(() => setUser(prev => ({ ...prev, hasSeenTour: true })), 300);
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  }

  function prev() {
    if (step > 0) setStep(s => s - 1);
  }

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(10,10,20,0.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
      opacity: exiting ? 0 : 1, transition: 'opacity 0.3s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--zm-surface)',
        borderRadius: '28px 28px 0 0',
        padding: '28px 24px 40px',
        position: 'relative',
        minHeight: '68vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Skip */}
        <button
          onClick={finish}
          style={{ position: 'absolute', top: 20, right: 20, background: 'var(--zm-surface2)', border: 'none', borderRadius: 999, padding: '5px 12px', color: 'var(--zm-text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <X size={11} /> Skip
        </button>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 32 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 999, cursor: 'pointer',
                background: i === step ? s.accent : 'var(--zm-border)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Illustration area */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: s.bg, borderRadius: 20, padding: '32px 24px', marginBottom: 28,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative ring */}
          <div style={{ width: 120, height: 120, borderRadius: '50%', border: `2px solid ${s.accent}`, opacity: 0.15, position: 'absolute' }} />
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: `2px solid ${s.accent}`, opacity: 0.1, position: 'absolute' }} />

          <div style={{ fontSize: 72, marginBottom: 16, lineHeight: 1, position: 'relative' }}>{s.emoji}</div>

          {/* Mode switcher demo */}
          {(s.highlight === 'seller' || s.highlight === 'buyer') && (
            <div style={{ display: 'flex', background: 'var(--zm-surface)', borderRadius: 999, padding: 4, marginTop: 8 }}>
              <div style={{ padding: '7px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: s.highlight === 'seller' ? 'var(--zm-accent)' : 'transparent', color: s.highlight === 'seller' ? 'white' : 'var(--zm-text-dim)' }}>🏷️ Seller</div>
              <div style={{ padding: '7px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: s.highlight === 'buyer' ? 'var(--zm-green)' : 'transparent', color: s.highlight === 'buyer' ? 'white' : 'var(--zm-text-dim)' }}>🛍️ Buyer</div>
            </div>
          )}

          {/* Karma flow demo */}
          {s.karmaDemo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              {[{ icon: '📦', label: 'You give' }, { icon: '✨', label: 'Karma' }, { icon: '🎁', label: 'You get' }].map((item, i) => (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--zm-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{item.icon}</div>
                    <span style={{ fontSize: 10, color: 'var(--zm-text-muted)', fontWeight: 500 }}>{item.label}</span>
                  </div>
                  {i < 2 && <div style={{ color: 'var(--zm-amber)', fontSize: 18, marginBottom: 14 }}>→</div>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Text */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6, lineHeight: 1.25 }}>
            {s.title}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: s.accent, marginBottom: 10, whiteSpace: 'pre-line' }}>
            {s.subtitle}
          </div>
          <div style={{ fontSize: 14, color: 'var(--zm-text-muted)', lineHeight: 1.65 }}>
            {s.body}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button
              onClick={prev}
              style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid var(--zm-border)', background: 'transparent', color: 'var(--zm-text-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            style={{
              flex: 2, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: s.accent, color: 'white', fontSize: 15, fontWeight: 600,
              fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isLast ? '🚀 Get started' : <>Next <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
