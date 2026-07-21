import { useEffect } from 'react';

const ensureTag = (selector, create) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  return element;
};

export default function SeoHead({ title, description, canonicalUrl, structuredData = [] }) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }

    if (description) {
      const descriptionTag = ensureTag('meta[name="description"]', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        return meta;
      });
      descriptionTag.setAttribute('content', description);
    }

    if (canonicalUrl) {
      const canonicalTag = ensureTag('link[rel="canonical"]', () => {
        const link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        return link;
      });
      canonicalTag.setAttribute('href', canonicalUrl);
    }

    document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((tag) => tag.remove());

    const payloads = Array.isArray(structuredData) ? structuredData : [structuredData];
    payloads.filter(Boolean).forEach((payload) => {
      const script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-seo-jsonld', 'true');
      script.textContent = JSON.stringify(payload);
      document.head.appendChild(script);
    });
  }, [title, description, canonicalUrl, structuredData]);

  return null;
}
