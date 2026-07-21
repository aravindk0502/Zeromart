import { useMemo, useState } from 'react';
import SeoHead from '../components/SeoHead';
import SiteFooter from '../components/SiteFooter';

const SITE_URL = 'https://www.drizn.com';

const BLOG_ARTICLES = [
  {
    slug: 'free-products-near-me',
    title: 'How To Find Free Products Near Me With Drizn',
    description: 'Learn practical ways to discover free nearby products using Drizn search, filters, and local community listings.',
    category: 'Free Products',
    summary: 'Discover how to quickly find useful free items in your area without scrolling endlessly.',
    body: [
      'Drizn helps you discover useful nearby products that people and stores are giving away for free.',
      'Use category, condition and distance filters to narrow your feed, then request or reserve items directly from the listing flow.',
      'Checking listings frequently and keeping your location active improves your chances of finding the best products first.',
    ],
  },
  {
    slug: 'how-to-reduce-household-waste',
    title: 'How To Reduce Household Waste With Local Reuse Habits',
    description: 'A practical guide to reducing home waste by sharing usable goods, planning consumption, and extending product life.',
    category: 'Sustainable Living',
    summary: 'Simple household habits can dramatically reduce waste while helping nearby people.',
    body: [
      'Start by separating reusable goods from true waste and list usable items before they become unusable.',
      'A weekly reuse routine helps you reduce clutter and keeps quality products in circulation for your local community.',
      'With Drizn, zero-rupee listings turn spare goods into value for others while reducing landfill pressure.',
    ],
  },
  {
    slug: 'how-community-sharing-helps-everyone',
    title: 'How Community Sharing Helps Everyone',
    description: 'See how community sharing builds trust, reduces waste, and improves access to useful products for everyone nearby.',
    category: 'Community Stories',
    summary: 'Community sharing creates practical value for givers, collectors, and neighborhoods.',
    body: [
      'When people share usable products locally, everyone saves money and resources.',
      'Givers clear space, collectors access useful products, and neighborhoods reduce unnecessary waste.',
      'Drizn supports this cycle through local discovery, request flows, and good karma recognition.',
    ],
  },
  {
    slug: 'near-expiry-products-explained',
    title: 'Near Expiry Products Explained',
    description: 'Understand near expiry products, why they matter, and how to collect them safely before they are wasted.',
    category: 'Near Expiry Products',
    summary: 'Near-expiry listings help rescue useful products before they are discarded.',
    body: [
      'Near-expiry products are still usable but need quick collection within a short time window.',
      'These listings reduce waste the fastest because timing matters more than price.',
      'On Drizn, rescue-focused discovery helps local users collect these items before they are lost.',
    ],
  },
  {
    slug: 'how-to-give-away-items-for-free',
    title: 'How To Give Away Items For Free Responsibly',
    description: 'Step-by-step guide to listing free items responsibly, including clear photos, honest details, and safe pickup coordination.',
    category: 'Zero Waste',
    summary: 'Clear listings and safe handover practices help your free listings reach the right people quickly.',
    body: [
      'List items with clear photos, honest condition details, and pickup-friendly timing.',
      'Respond quickly to genuine requests and confirm handover details in advance.',
      'Each successful give-away strengthens local trust and improves your good karma visibility.',
    ],
  },
  {
    slug: 'save-money-with-drizn',
    title: 'Save Money With Drizn While Living Sustainably',
    description: 'Learn how Drizn helps households and students save money by collecting nearby free products and sharing extras.',
    category: 'Drizn Updates',
    summary: 'Free local products plus thoughtful sharing can significantly reduce monthly expenses.',
    body: [
      'Drizn makes local reuse practical by connecting people to nearby free products in real time.',
      'Families, students and working professionals can reduce expenses by collecting items they would otherwise buy new.',
      'Combining collection and sharing creates a sustainable cycle that benefits your budget and your community.',
    ],
  },
];

const BLOG_CATEGORIES = [
  'Free Products',
  'Community Stories',
  'Sustainable Living',
  'Near Expiry Products',
  'Zero Waste',
  'Drizn Updates',
];

const sharedLinkClass = 'text-violet-700 underline-offset-2 transition hover:text-violet-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300';

function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href ? <a href={item.href} className={sharedLinkClass}>{item.label}</a> : <span className="font-semibold text-slate-700">{item.label}</span>}
            {index < items.length - 1 ? <span aria-hidden="true">/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StaticShell({ title, subtitle, breadcrumbs, children, seoTitle, seoDescription, canonicalUrl, structuredData }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(124,58,237,0.14),_transparent_28%),linear-gradient(135deg,_#fffaf2_0%,_#f7f4ff_48%,_#f8fafc_100%)] text-slate-800">
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        canonicalUrl={canonicalUrl}
        structuredData={structuredData}
      />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.5rem] border border-amber-100/80 bg-white/90 p-5 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
          <Breadcrumbs items={breadcrumbs} />
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p> : null}
        </section>

        <section className="mt-4 rounded-[1.5rem] border border-amber-100/70 bg-white/90 p-5 shadow-[0_14px_42px_rgba(15,23,42,0.06)]">
          {children}
        </section>

        <div className="mt-4">
          <SiteFooter currentPath={canonicalUrl.replace(SITE_URL, '') || '/'} />
        </div>
      </main>
    </div>
  );
}

function AboutPage() {
  return (
    <StaticShell
      title="About Drizn"
      subtitle="Drizn connects people and nearby stores so useful products can be collected for free."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'About Drizn' }]}
      seoTitle="About Drizn | Good Things. Nearby."
      seoDescription="Learn how Drizn connects people and nearby stores for free useful products, community sharing, reduced waste, and good karma."
      canonicalUrl={`${SITE_URL}/about`}
    >
      <div className="space-y-4 text-sm leading-7 text-slate-700">
        <p>Drizn is built to make useful products easier to discover and collect locally at zero cost.</p>
        <p>By connecting community members and nearby stores, Drizn helps products move to someone who needs them instead of going to waste.</p>
        <p>Every successful handover supports community sharing, reduces unnecessary disposal, and promotes a culture of good karma.</p>
      </div>
    </StaticShell>
  );
}

function HelpPage() {
  const topics = [
    'How to create an account',
    'How to list an item',
    'How to request an item',
    'Collection process',
    'Karma',
    'Store listings',
    'Safety guidance',
    'Contact support',
  ];

  return (
    <StaticShell
      title="Help Centre"
      subtitle="Quick guidance for listing, requesting, collecting, and using Drizn safely."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Help Centre' }]}
      seoTitle="Help Centre | Drizn"
      seoDescription="Find answers about creating an account, listing items, requesting products, collection process, karma, store listings, and safety guidance on Drizn."
      canonicalUrl={`${SITE_URL}/help`}
    >
      <ul className="space-y-3 text-sm leading-7 text-slate-700">
        {topics.map((topic) => (
          <li key={topic} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 font-medium">{topic}</li>
        ))}
      </ul>
    </StaticShell>
  );
}

function TermsPage() {
  return (
    <StaticShell
      title="Terms and Conditions"
      subtitle="This page is a placeholder legal draft and requires final legal review before publication as binding terms."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Terms and Conditions' }]}
      seoTitle="Terms and Conditions | Drizn"
      seoDescription="Read the current placeholder Terms and Conditions draft for Drizn. This content requires final legal review before publication."
      canonicalUrl={`${SITE_URL}/terms`}
    >
      <div className="space-y-4 text-sm leading-7 text-slate-700">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">Placeholder notice: this legal content is provided for structure only and requires final legal review.</p>
        <p>Scope, acceptable use, dispute handling, limitation of liability, and policy references should be validated and finalized by legal counsel.</p>
        <p>Do not treat this page as legally binding until approved and replaced with final legal text.</p>
      </div>
    </StaticShell>
  );
}

function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [submitNote, setSubmitNote] = useState('');

  const validate = () => {
    const next = {};
    const normalizedName = form.name.trim();
    const normalizedEmail = form.email.trim();
    const normalizedPhone = form.phone.replace(/\s+/g, '');
    const normalizedSubject = form.subject.trim();
    const normalizedMessage = form.message.trim();

    if (normalizedName.length < 2 || !/^[a-zA-Z][a-zA-Z\s.'-]+$/.test(normalizedName)) {
      next.name = 'Enter a valid full name.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      next.email = 'Enter a valid email address.';
    }
    if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
      next.phone = 'Enter a valid phone number with 10 to 15 digits.';
    }
    if (normalizedSubject.length < 4 || normalizedSubject.length > 120) {
      next.subject = 'Subject must be between 4 and 120 characters.';
    }
    if (normalizedMessage.length < 20 || normalizedMessage.length > 1500) {
      next.message = 'Message must be between 20 and 1500 characters.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitNote('');
    if (!validate()) return;
    setSubmitNote('Contact form submission endpoint is not configured yet. UI is ready; server-side support still needs setup.');
  };

  return (
    <StaticShell
      title="Contact Drizn"
      subtitle="Reach out for product sharing support, account help, or partnership queries."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Contact Drizn' }]}
      seoTitle="Contact Drizn | Support"
      seoDescription="Contact Drizn support for account help, listing guidance, collection flow questions, and platform support."
      canonicalUrl={`${SITE_URL}/contact`}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {[
          { key: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
          { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          { key: 'phone', label: 'Phone number', type: 'tel', autoComplete: 'tel' },
          { key: 'subject', label: 'Subject', type: 'text', autoComplete: 'off' },
        ].map((field) => (
          <div key={field.key}>
            <label htmlFor={`contact-${field.key}`} className="mb-1 block text-sm font-semibold text-slate-700">{field.label}</label>
            <input
              id={`contact-${field.key}`}
              type={field.type}
              autoComplete={field.autoComplete}
              value={form[field.key]}
              onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={errors[field.key] ? `error-${field.key}` : undefined}
              required
            />
            {errors[field.key] ? <p id={`error-${field.key}`} className="mt-1 text-xs font-semibold text-rose-600">{errors[field.key]}</p> : null}
          </div>
        ))}

        <div>
          <label htmlFor="contact-message" className="mb-1 block text-sm font-semibold text-slate-700">Message</label>
          <textarea
            id="contact-message"
            rows={6}
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'error-message' : undefined}
            required
          />
          {errors.message ? <p id="error-message" className="mt-1 text-xs font-semibold text-rose-600">{errors.message}</p> : null}
        </div>

        <button type="submit" className="rounded-xl bg-gradient-to-r from-amber-500 to-violet-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
          Send message
        </button>

        {submitNote ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{submitNote}</p> : null}
      </form>
    </StaticShell>
  );
}

function BlogPage() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOG_ARTICLES;
    return BLOG_ARTICLES.filter((article) => (
      article.title.toLowerCase().includes(q)
      || article.description.toLowerCase().includes(q)
      || article.category.toLowerCase().includes(q)
    ));
  }, [query]);

  const canonicalUrl = `${SITE_URL}/blog`;
  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Drizn Blog',
    url: canonicalUrl,
    description: 'Tips, guides and stories about free products, sustainable living, community sharing and reducing waste.',
    blogPost: BLOG_ARTICLES.map((article) => ({
      '@type': 'BlogPosting',
      headline: article.title,
      url: `${SITE_URL}/blog/${article.slug}`,
      description: article.description,
    })),
  };

  const latest = BLOG_ARTICLES.slice(0, 3);
  const popular = [...BLOG_ARTICLES].slice(3, 6);

  return (
    <StaticShell
      title="Drizn Blog"
      subtitle="Tips, guides and stories about free products, sustainable living, community sharing and reducing waste."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Drizn Blog' }]}
      seoTitle="Drizn Blog | Free Products, Sharing, Sustainability"
      seoDescription="Explore Drizn blog articles on free products, community sharing, near-expiry rescue, sustainable living, and zero-waste habits."
      canonicalUrl={canonicalUrl}
      structuredData={blogJsonLd}
    >
      <div className="space-y-6">
        <div>
          <label htmlFor="blog-search" className="mb-2 block text-sm font-semibold text-slate-700">Search Blogs</label>
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by topic, title, or category"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {BLOG_CATEGORIES.map((category) => (
              <span key={category} className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{category}</span>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Latest Articles</h2>
          <ul className="mt-3 space-y-2">
            {latest.map((article) => (
              <li key={article.slug} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <a href={`/blog/${article.slug}`} className={`${sharedLinkClass} text-base font-bold`}>{article.title}</a>
                <p className="mt-1 text-sm text-slate-600">{article.description}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Popular Articles</h2>
          <ul className="mt-3 space-y-2">
            {popular.map((article) => (
              <li key={article.slug} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <a href={`/blog/${article.slug}`} className={`${sharedLinkClass} text-base font-bold`}>{article.title}</a>
                <p className="mt-1 text-sm text-slate-600">{article.summary}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Search Results</h2>
          <ul className="mt-3 space-y-2">
            {filtered.length === 0 ? <li className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">No blog articles matched your search.</li> : null}
            {filtered.map((article) => (
              <li key={article.slug} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                <a href={`/blog/${article.slug}`} className={`${sharedLinkClass} text-base font-bold`}>{article.title}</a>
                <p className="mt-1 text-sm text-slate-600">{article.description}</p>
                <p className="mt-1 text-xs font-semibold text-violet-700">{article.category}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </StaticShell>
  );
}

function BlogArticlePage({ slug }) {
  const article = BLOG_ARTICLES.find((entry) => entry.slug === slug);
  if (!article) {
    return (
      <StaticShell
        title="Article Not Found"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'Not Found' }]}
        seoTitle="Blog Article Not Found | Drizn"
        seoDescription="The requested Drizn blog article could not be found."
        canonicalUrl={`${SITE_URL}/blog/${slug}`}
      >
        <p className="text-sm text-slate-700">This article is not available. Return to <a href="/blog" className={sharedLinkClass}>Drizn Blog</a>.</p>
      </StaticShell>
    );
  }

  const canonicalUrl = `${SITE_URL}/blog/${article.slug}`;
  const related = BLOG_ARTICLES.filter((entry) => entry.slug !== article.slug).slice(0, 3);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.description,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    publisher: {
      '@type': 'Organization',
      name: 'Drizn',
      url: SITE_URL,
    },
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: article.title, item: canonicalUrl },
    ],
  };

  return (
    <StaticShell
      title={article.title}
      subtitle={article.summary}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: article.title }]}
      seoTitle={`${article.title} | Drizn Blog`}
      seoDescription={article.description}
      canonicalUrl={canonicalUrl}
      structuredData={[articleJsonLd, breadcrumbJsonLd]}
    >
      <article className="space-y-4 text-sm leading-7 text-slate-700">
        <h1 className="text-2xl font-extrabold text-slate-900">{article.title}</h1>
        {article.body.map((paragraph, index) => (
          <p key={`${article.slug}-p-${index}`}>{paragraph}</p>
        ))}
      </article>

      <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50 p-4">
        <p className="text-sm font-bold text-violet-800">Related articles</p>
        <ul className="mt-2 space-y-1">
          {related.map((entry) => (
            <li key={entry.slug}>
              <a href={`/blog/${entry.slug}`} className={sharedLinkClass}>{entry.title}</a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <a href="/blog" className={sharedLinkClass}>Back to /blog</a>
      </div>
    </StaticShell>
  );
}

const webSiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Drizn',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/blog?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default function StaticContentRouter({ path }) {
  const normalizedPath = String(path || '/').replace(/\/$/, '') || '/';
  const articlePrefix = '/blog/';

  if (normalizedPath === '/about') return <AboutPage />;
  if (normalizedPath === '/help') return <HelpPage />;
  if (normalizedPath === '/terms') return <TermsPage />;
  if (normalizedPath === '/contact') return <ContactPage />;
  if (normalizedPath === '/blog') return <BlogPage />;
  if (normalizedPath.startsWith(articlePrefix)) {
    const slug = normalizedPath.slice(articlePrefix.length);
    return <BlogArticlePage slug={slug} />;
  }

  return (
    <StaticShell
      title="Page Not Found"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Not Found' }]}
      seoTitle="Page Not Found | Drizn"
      seoDescription="The requested Drizn page could not be found."
      canonicalUrl={`${SITE_URL}${normalizedPath}`}
      structuredData={webSiteStructuredData}
    >
      <p className="text-sm text-slate-700">That page is unavailable. Go back to <a href="/" className={sharedLinkClass}>Drizn home</a>.</p>
    </StaticShell>
  );
}
