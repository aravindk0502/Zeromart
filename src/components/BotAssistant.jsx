import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Search, MapPin, Star } from 'lucide-react';

const SUGGESTIONS = [
  'What is near me?',
  'Show food in Koramangala',
  'Movie tickets?',
  'How does karma work?',
  'What is ₹29 for?',
];

const PLATFORM_QA = [
  { keys: ['how to sell', 'list item', 'post item', 'give away', 'listing'], answer: 'Tap the + button at the bottom to list a product. Take a photo, add a short description, pick a category — it goes live instantly. Completely free!' },
  { keys: ['how to buy', 'how to request', 'get item', 'buying'], answer: 'Pay a one-time ₹29 to unlock buyer access forever. Then browse, search, and request any item you like.' },
  { keys: ['delivery', 'shipping', 'courier', 'porter', 'shadowfax', 'uber'], answer: 'Drizn currently uses direct collection coordination. Use the seller chat to arrange pickup or your own courier service and share the required contact details.' },
  { keys: ['karma', 'points', 'rating', 'review'], answer: 'Karma is mandatory after collection. The buyer who received the item sends good karma to the seller or store, and that seller/store gains the karma point.' },
  { keys: ['in person', 'collect', 'pickup', 'nearby'], answer: 'For community items, send a collection request and wait for the seller to accept. Their phone, pickup address, date, time, and instructions then appear in Alerts. Business items use Reserve & Collect with a collection ID and QR pass.' },
  { keys: ['free', 'cost', 'charge', 'fee', 'price'], answer: 'Yes! Listing on Drizn is completely free for sellers. Items are listed at ₹0.' },
  { keys: ['reward', 'voucher', 'swiggy', 'bookmyshow', 'myntra', 'milestone'], answer: 'Sellers earn delivery credits and unlock brand vouchers (Swiggy, BookMyShow, Myntra) when they hit karma milestones at 5, 10, 25+ items given.' },
  { keys: ['account', 'profile', 'login', 'sign up', 'otp', 'mobile', 'number'], answer: 'You need your mobile number only when you buy or sell — we send a quick OTP to verify. One account lets you list for ₹0 and buy ₹0 items after lifetime access.' },
  { keys: ['₹29', '29', 'one time', 'lifetime', 'unlock'], answer: 'The ₹29 is a one-time lifetime fee to unlock buyer access. Pay once, browse and buy forever. No subscriptions.' },
  { keys: ['chat', 'message', 'talk', 'contact'], answer: 'After a seller accepts your request, their phone number, pickup address, time, and instructions appear in Alerts. You can call or use WhatsApp to coordinate.' },
  { keys: ['report', 'fraud', 'fake', 'scam', 'block'], answer: 'Tap the flag icon on any listing or profile to report. Three verified reports trigger a review. Serious fraud leads to a permanent ban.' },
  { keys: ['credit', 'delivery credit', 'offset'], answer: 'Delivery credits are earned every time you give away an item. Use them to offset your own delivery costs when buying.' },
  { keys: ['business', 'store', 'reserve', 'qr', 'collection id', 'collection pass'], answer: 'Business store items use Reserve & Collect. After reserving, the buyer gets a collection ID/QR pass with directions. The store marks it collected, then the buyer must send good karma.' },
  { keys: ['limit', '24 hour', 'again', 'sold out', 'stock'], answer: 'Each user can request up to 2 quantity per product in 24 hours. If stock reaches 0, the product shows Sold Out and the request button is disabled.' },
  { keys: ['live', 'listed now', 'new listing', 'real time'], answer: 'New listings are saved into Drizn marketplace storage and refreshed into the feed by location. The nearest live listings appear first, then karma and freshness decide the order.' },
];

const SEARCH_TRIGGERS = ['find', 'search', 'show', 'any', 'looking for', 'do you have', 'got any', 'need', 'want', 'available'];
const STOP_WORDS = ['near', 'me', 'please', 'the', 'any', 'for', 'some', 'got', 'you', 'have', 'what', 'which', 'with', 'and', 'item', 'items', 'product', 'products', 'drizn', 'ai'];
const FEATURE_TOPICS = [
  {
    keys: ['feature', 'platform', 'how works', 'what can', 'inside'],
    answer: 'Drizn lets you browse ₹0 items, list products for free, save favorites, search by keyword/location/category/condition, request collection, coordinate by phone or WhatsApp after acceptance, track orders, receive notifications, and ask Drizn AI for help.',
  },
  {
    keys: ['footer', 'terms', 'faq', 'support', 'contact', 'blog', 'social'],
    answer: 'The compact footer links to About, Help, Terms, Contact, Instagram, LinkedIn, and WhatsApp.',
  },
  {
    keys: ['location', 'area', 'km', 'radius', 'filter'],
    answer: 'Use the top location selector or homepage filters to search by area and km radius. The platform supports places like Koramangala, Indiranagar, Jayanagar, HSR Layout, and Whitefield, plus current location.',
  },
  {
    keys: ['favorite', 'favourite', 'saved'],
    answer: 'Tap the heart on any product to save it. Favorites show a count badge in the bottom nav, appear on the Favorites page, and can be removed from there.',
  },
  {
    keys: ['notification', 'alert', 'updates'],
    answer: 'Alerts are clickable. Product notifications open the related product, and platform updates open an information detail card.',
  },
  {
    keys: ['profile', 'history', 'order', 'listed', 'collected', 'active listings', 'given away'],
    answer: 'Profile shows karma points, photo, bio, optional website, Instagram and location links, item activity, active listings, given away, and order history with collection status.',
  },
];

function isProductSearch(q) {
  const lower = q.toLowerCase();
  return SEARCH_TRIGGERS.some(t => lower.includes(t));
}

function searchProducts(query, products) {
  const q = query.toLowerCase().replace(/[?!.,]/g, '');
  const words = q.split(/\s+/).filter(w => w.length > 2 && !SEARCH_TRIGGERS.includes(w) && !STOP_WORDS.includes(w));

  if (!words.length) return products.slice(0, 4);

  return products
    .map(p => {
      const haystack = [
        p.title,
        p.brand,
        p.category,
        p.condition,
        p.description,
        p.location,
        p.sellerName,
        p.status,
        p.distance,
      ].filter(Boolean).join(' ').toLowerCase();
      const score = words.reduce((total, word) => {
        if (haystack.includes(word)) return total + 2;
        if (word.endsWith('s') && haystack.includes(word.slice(0, -1))) return total + 1;
        return total;
      }, 0);
      return { product: p, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.product)
    .slice(0, 5);
}

function getPlatformAnswer(question) {
  const q = question.toLowerCase();
  for (const { keys, answer } of FEATURE_TOPICS) {
    if (keys.some(k => q.includes(k))) return answer;
  }
  for (const { keys, answer } of PLATFORM_QA) {
    if (keys.some(k => q.includes(k))) return answer;
  }
  return null;
}

function buildContextAnswer(question, context) {
  const q = question.toLowerCase();
  const products = context.items || [];
  const locations = [...new Set(products.map(item => item.location).filter(Boolean))];
  const categories = [...new Set(products.map(item => item.category).filter(Boolean))];

  if (q.includes('how many') || q.includes('summary') || q.includes('dashboard')) {
    return `I can see ${products.length} products, ${categories.length} categories, ${locations.length} locations, ${context.favorites?.length || 0} favorites, ${context.orders?.length || 0} orders, and ${context.notifications?.length || 0} notifications in this Drizn session.`;
  }

  if (q.includes('category') || q.includes('categories')) {
    return categories.length
      ? `Available categories: ${categories.join(', ')}. Ask me for any category, like "show ${categories[0]}".`
      : 'I do not see categories yet because no products are loaded.';
  }

  if (q.includes('where') || q.includes('location') || q.includes('area')) {
    return locations.length
      ? `Products are currently listed around ${locations.join(', ')}. Your selected area is ${context.locationLabel || 'Your area'}.`
      : `Your selected area is ${context.locationLabel || 'Your area'}, but I do not see product locations yet.`;
  }

  if (q.includes('favorite') || q.includes('favourite') || q.includes('saved')) {
    return context.favorites?.length
      ? `You have ${context.favorites.length} favorite item${context.favorites.length === 1 ? '' : 's'}. Ask "show my favorites" to open them here.`
      : 'You have no favorites yet. Tap the heart on any product to save it.';
  }

  if (q.includes('order') || q.includes('delivery status') || q.includes('collected')) {
    return context.orders?.length
      ? `You have ${context.orders.length} order history entr${context.orders.length === 1 ? 'y' : 'ies'}. Delivery orders show delivery status, and in-person handoffs show collected personally in Profile.`
      : 'No orders yet. When you request delivery or collect personally, it will appear in Profile order history.';
  }

  if (q.includes('notification') || q.includes('alert')) {
    return context.notifications?.length
      ? `You have ${context.notifications.length} notification${context.notifications.length === 1 ? '' : 's'}. Product alerts open product pages; platform updates show an info card.`
      : 'No notifications yet.';
  }

  return null;
}

function ProductResultCard({ product, onOpen }) {
  return (
    <div
      onClick={() => onOpen(product)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        background: 'var(--zm-surface2)', borderRadius: 12, cursor: 'pointer',
        border: '1px solid var(--zm-border)', transition: 'border-color 0.15s',
        marginBottom: 6,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--zm-accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--zm-border)'}
    >
      {product.image ? (
        <img src={product.image} alt={product.title} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
      ) : (
        <div style={{ fontSize: 20, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zm-card)', borderRadius: 10, flexShrink: 0 }}>
          ₹0
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {product.title}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--zm-green)', fontWeight: 600 }}>₹0</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--zm-text-dim)' }}>
            <MapPin size={9} /> {product.location} · {product.distance}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--zm-amber)' }}>
            <Star size={9} fill="currentColor" /> {product.sellerKarma || 0}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--zm-text-dim)', flexShrink: 0 }}>{product.condition}</div>
    </div>
  );
}

function BotMessage({ msg, onOpenProduct }) {
  if (msg.type === 'products') {
    return (
      <div style={{ maxWidth: '90%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={12} color="var(--zm-accent)" />
          </div>
          <div className="chat-bubble theirs" style={{ fontSize: 13 }}>{msg.text}</div>
        </div>
        {msg.products.length > 0 ? (
          <div style={{ paddingLeft: 32 }}>
            {msg.products.map(p => (
              <ProductResultCard key={p.id} product={p} onOpen={onOpenProduct} />
            ))}
          </div>
        ) : (
          <div style={{ paddingLeft: 32 }}>
            <div className="chat-bubble theirs" style={{ fontSize: 13, color: 'var(--zm-text-dim)' }}>
              Nothing found nearby for that. Try a different keyword!
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
      {msg.from === 'bot' && (
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={12} color="var(--zm-accent)" />
        </div>
      )}
      <div className={`chat-bubble ${msg.from === 'user' ? 'mine' : 'theirs'}`} style={{ fontSize: 13 }}>
        {msg.text}
      </div>
    </div>
  );
}

export default function BotAssistant({ open, onClose, items = [], favorites = [], orders = [], notifications = [], locationLabel, user, onSelectItem }) {
  const [messages, setMessages] = useState([
    { id: 0, from: 'bot', text: "Hi! I'm Drizn AI. I can help you with everything inside Drizn." }
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function ask(q) {
    const question = (q || input).trim();
    if (!question) return;
    setInput('');

    const userMsg = { id: Date.now(), from: 'user', text: question };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);

      const botContext = { items, favorites, orders, notifications, locationLabel, user };
      const favoriteIntent = question.toLowerCase().includes('show my favorite') || question.toLowerCase().includes('show favourite');
      const contextAnswer = buildContextAnswer(question, botContext);
      if (contextAnswer && !favoriteIntent) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'bot', text: contextAnswer }]);
        return;
      }

      const productsToSearch = favoriteIntent ? favorites : items;
      const productIntent = isProductSearch(question) || searchProducts(question, productsToSearch).length > 0;
      if (productIntent) {
        const results = favoriteIntent ? productsToSearch.slice(0, 5) : searchProducts(question, productsToSearch);
        const resultMsg = results.length > 0
          ? `Found ${results.length} matching ₹0 item${results.length > 1 ? 's' : ''}:`
          : `I searched ${productsToSearch.length} platform item${productsToSearch.length === 1 ? '' : 's'} but did not find a match. Try a category, location, seller, or product name.`;
        setMessages(prev => [...prev, { id: Date.now() + 1, type: 'products', text: resultMsg, products: results }]);
        return;
      }

      // Platform Q&A
      const answer = getPlatformAnswer(question);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        from: 'bot',
        text: answer || 'I can help only with Drizn platform features.',
      }]);
    }, 600);
  }

  function handleOpenProduct(product) {
    onClose();
    onSelectItem(product);
  }

  if (!open) return null;

  return (
    <div className="overlay">
      <div className="sheet" style={{ height: '72vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={18} color="var(--zm-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drizn AI</div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>Find items · Platform help</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map(msg => (
            <BotMessage key={msg.id} msg={msg} onOpenProduct={handleOpenProduct} />
          ))}
          {typing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={12} color="var(--zm-accent)" />
              </div>
              <div className="chat-bubble theirs" style={{ fontSize: 13, color: 'var(--zm-text-dim)' }}>
                Searching…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0, borderTop: '1px solid var(--zm-border)' }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => ask(s)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--zm-border)', background: 'transparent', color: 'var(--zm-text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
              {s.toLowerCase().startsWith('find') || s.toLowerCase().startsWith('any') ? <Search size={10} /> : null}
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 14px', flexShrink: 0 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Find items or ask a question…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
          />
          <button onClick={() => ask()} className="btn btn-primary" style={{ padding: '0 14px', borderRadius: 10 }}>
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
