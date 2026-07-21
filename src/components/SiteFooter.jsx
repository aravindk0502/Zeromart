import { Sparkles } from 'lucide-react';
import { SOCIAL_LINKS } from '../config/socialLinks';

const INTERNAL_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Help', href: '/help' },
  { label: 'Terms', href: '/terms' },
  { label: 'Contact', href: '/contact' },
  { label: 'Blog', href: '/blog' },
];

const EXTERNAL_LINKS = [
  { label: 'Instagram', href: SOCIAL_LINKS.instagram, missingMessage: 'TODO: set VITE_SOCIAL_INSTAGRAM_URL' },
  { label: 'LinkedIn', href: SOCIAL_LINKS.linkedin, missingMessage: 'TODO: set VITE_SOCIAL_LINKEDIN_URL' },
  { label: 'WhatsApp', href: SOCIAL_LINKS.whatsapp, missingMessage: 'TODO: set VITE_SOCIAL_WHATSAPP_URL' },
];

export default function SiteFooter({ currentPath = '' }) {
  const activePath = String(currentPath || '').toLowerCase();

  return (
    <footer className="rounded-[1.1rem] border border-amber-100 bg-white/90 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-700">
            <Sparkles size={15} /> Drizn
          </span>
          <span className="font-semibold text-slate-500">Good Things. Nearby.</span>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
          {INTERNAL_LINKS.map((link) => {
            const isActive = activePath === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                className={`rounded-sm outline-none transition hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-300 ${isActive ? 'text-violet-700' : ''}`}
              >
                {link.label}
              </a>
            );
          })}

          {EXTERNAL_LINKS.map((link) => {
            if (!link.href) {
              return (
                <span
                  key={link.label}
                  aria-disabled="true"
                  title={link.missingMessage}
                  className="cursor-not-allowed rounded-sm opacity-60"
                >
                  {link.label}
                </span>
              );
            }

            return (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm outline-none transition hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-400">
        © Drizn · Good Things. Nearby.
      </div>
    </footer>
  );
}
