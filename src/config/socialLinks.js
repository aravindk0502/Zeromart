const normalizeUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

export const SOCIAL_LINKS = {
  instagram: normalizeUrl(import.meta.env.VITE_SOCIAL_INSTAGRAM_URL),
  linkedin: normalizeUrl(import.meta.env.VITE_SOCIAL_LINKEDIN_URL),
  whatsapp: normalizeUrl(import.meta.env.VITE_SOCIAL_WHATSAPP_URL),
};
