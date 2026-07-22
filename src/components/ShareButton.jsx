import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Mail, MessageCircle, Send, Share2, X } from 'lucide-react';
import { getListingAvailability, getPublicProductUrl } from '../utils/listingPresentation';

const buildShareData = (item) => {
  const availability = getListingAvailability(item);
  const seller = item.sellerName || item.storeName || item.sellerProfile?.name || 'Drizn';
  const text = `${item.title} - FREE from ${seller}${availability.timingLabel ? ` · ${availability.timingLabel}` : ''}. Good Things. Nearby.`;
  return { title: `${item.title} | Drizn`, text, url: getPublicProductUrl(item) };
};

export default function ShareButton({ item, className = '', label = 'Share item' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareData = buildShareData(item);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareData.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async (event) => {
    event?.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    setOpen(true);
  };

  const encodedUrl = encodeURIComponent(shareData.url);
  const encodedText = encodeURIComponent(`${shareData.text} ${shareData.url}`);
  const services = [
    ['WhatsApp', `https://wa.me/?text=${encodedText}`, MessageCircle],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, Share2],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, Share2],
    ['X', `https://twitter.com/intent/tweet?text=${encodedText}`, Share2],
    ['Telegram', `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shareData.text)}`, Send],
    ['Messages', `sms:?&body=${encodedText}`, MessageCircle],
    ['Email', `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodedText}`, Mail],
    ['Instagram', 'https://www.instagram.com/', Share2],
  ];

  return (
    <>
      <button type="button" onClick={share} className={className} aria-label={label}>
        <Share2 size={16} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[190] flex items-end bg-slate-950/45 p-3 sm:items-center sm:justify-center" onClick={(event) => event.stopPropagation()}>
          <div className="w-full max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white p-4 shadow-2xl sm:max-w-sm">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-extrabold text-slate-900">Share this item</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.title}</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600" aria-label="Close share options"><X size={16} /></button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {services.map(([name, href, Icon]) => <a key={name} href={href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col items-center gap-1 rounded-xl p-2 text-center text-[10px] font-bold text-slate-600 hover:bg-slate-50"><Icon size={18} /><span className="max-w-full truncate">{name}</span></a>)}
            </div>
            <button type="button" onClick={copyLink} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}