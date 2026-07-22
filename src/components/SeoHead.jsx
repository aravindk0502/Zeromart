import { useEffect } from 'react';

const ensureTag = (selector, create) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  return element;
};

export default function SeoHead({ title, description, canonicalUrl, image, type = 'website', structuredData = [] }) {
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

    const tags = [
      ['property', 'og:type', type],
      ['property', 'og:site_name', 'Drizn'],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:url', canonicalUrl],
      ['property', 'og:image', image],
      ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
      ['name', 'twitter:image', image],
    ];
    tags.forEach(([attribute, key, content]) => {
      if (!content) return;
      const tag = ensureTag(`meta[${attribute}="${key}"]`, () => {
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        return meta;
      });
      tag.setAttribute('content', content);
    });

    document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((tag) => tag.remove());

    const payloads = Array.isArray(structuredData) ? structuredData : [structuredData];
    payloads.filter(Boolean).forEach((payload) => {
      const script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-seo-jsonld', 'true');
      script.textContent = JSON.stringify(payload);
      document.head.appendChild(script);
    });
  }, [title, description, canonicalUrl, image, type, structuredData]);

  return null;
}
