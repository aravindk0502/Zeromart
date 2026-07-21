import { useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

const STEPS = [
  {
    icon: '✨',
    title: 'Welcome to Drizn',
    subtitle: 'A calmer way to give and receive nearby.',
    body: 'Browse free listings, discover useful items in your area, and help your community reuse what is still loved.',
    accent: 'from-amber-500 to-violet-600',
  },
  {
    icon: '🧭',
    title: 'Start from the home feed',
    subtitle: 'Find what you need without friction.',
    body: 'The home page keeps the experience simple, so you can browse listings, tap into details, and move to action in seconds.',
    accent: 'from-teal-500 to-amber-500',
  },
  {
    icon: '💬',
    title: 'Request and connect',
    subtitle: 'Move from interest to exchange smoothly.',
    body: 'Request a listing. After the seller accepts, use the shared phone and pickup details to coordinate directly.',
    accent: 'from-violet-600 to-amber-500',
  },
  {
    icon: '⭐',
    title: 'Complete with Good Karma',
    subtitle: 'Close each exchange with trust and appreciation.',
    body: 'After handover, send Good Karma to the community giver or store partner. This keeps top local helpers visible and trusted.',
    accent: 'from-emerald-600 to-violet-600',
  },
  {
    icon: '🏷️',
    title: 'List what you no longer need',
    subtitle: 'Make giving feel effortless.',
    body: 'If you are logged in, you can list an item in a few taps and share it with the people around you.',
    accent: 'from-violet-600 to-slate-700',
  },
];

export default function OnboardingTour({ open, onFinish }) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    onFinish();
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((value) => value - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 px-3 py-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <div className={`bg-gradient-to-br ${currentStep.accent} px-5 py-6 text-white sm:px-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">Platform tour</p>
              <h2 className="mt-2 text-2xl font-semibold">{currentStep.title}</h2>
            </div>
            <button
              onClick={onFinish}
              className="rounded-full border border-white/20 bg-white/10 p-2 transition hover:bg-white/20"
              aria-label="Close tour"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-white/20 bg-white/10 p-3 backdrop-blur">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">
              {currentStep.icon}
            </div>
            <p className="text-sm text-white/90">{currentStep.subtitle}</p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm leading-6 text-slate-600">{currentStep.body}</p>

          <div className="mt-5 flex items-center gap-2">
            {STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setStep(index)}
                className={`h-2 rounded-full transition-all ${index === step ? 'w-6 bg-amber-500' : 'w-2 bg-slate-200'}`}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            {step > 0 ? (
              <button
                onClick={handleBack}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
              >
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <button
                onClick={onFinish}
                className="flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex flex-[1.3] items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white"
            >
              {isLast ? 'Start exploring' : <>Next <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
