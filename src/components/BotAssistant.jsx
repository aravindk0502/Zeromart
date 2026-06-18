import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Search, MapPin, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';

const SUGGESTIONS = [
  'Find books near me',
  'Any electronics?',
  'How does karma work?',
  'What is ₹29 for?',
  'How to sell?',
];

const PLATFORM_QA = [
  { keys: ['how to sell', 'list item', 'post item', 'give away', 'listing'], answer: 'Tap the + button at the bottom to list a product. Take a photo, add a short description, pick a category — it goes live instantly. Completely free!' },
  { keys: ['how to buy', 'how to request', 'get item', 'buying'], answer: 'Pay a one-time ₹29 to unlock buyer access forever. Then browse, search, and request any item you like.' },
  { keys: ['delivery', 'shipping', 'courier', 'porter', 'shadowfax'], answer: 'The buyer pays the actual delivery cost. We partner with Shadowfax and Porter. Prices are shown before you confirm.' },
  { keys: ['karma', 'points', 'rating', 'review'], answer: 'Karma points are given by buyers after receiving an item. Higher karma = more visibility and better rewards. You earn 1 karma per successful transaction.' },
  { keys: ['in person', 'collect', 'pickup', 'nearby'], answer: 'If a seller is within 1 km, you can request to collect in person. A temporary chat opens to coordinate — it deletes once the handoff is done.' },
  { keys: ['free', 'cost', 'charge', 'fee', 'price'], answer: 'Yes! Listing on ZeroMart is completely free for sellers. Items are listed at ₹0.' },
  { keys: ['reward', 'voucher', 'swiggy', 'bookmyshow', 'myntra', 'milestone'], answer: 'Sellers earn delivery credits and unlock brand vouchers (Swiggy, BookMyShow, Myntra) when they hit karma milestones at 5, 10, 25+ items given.' },
  { keys: ['account', 'profile', 'login', 'sign up', 'otp', 'mobile', 'number'], answer: 'You need your mobile number only when you buy or sell — we send a quick OTP to verify. One account switches between Seller and Buyer mode.' },
  { keys: ['₹29', '29', 'one time', 'lifetime', 'unlock'], answer: 'The ₹29 is a one-time lifetime fee to unlock buyer access. Pay once, browse and buy forever. No subscriptions.' },
  { keys: ['chat', 'message', 'talk', 'contact'], answer: 'A temporary chat opens between buyer and seller only when a seller accepts an in-person collection request. It disappears once the handoff is complete.' },
  { keys: ['report', 'fraud', 'fake', 'scam', 'block'], answer: 'Tap the flag icon on any listing or profile to report. Three verified reports trigger a review. Serious fraud leads to a permanent ban.' },
  { keys: ['credit', 'delivery credit', 'offset'], answer: 'Delivery credits are earned every time you give away an item. Use them to offset your own delivery costs when buying.' },
];

const SEARCH_TRIGGERS = ['find', 'search', 'show', 'any', 'looking for', 'do you have', 'got any', 'need', 'want', 'available'];

function isProductSearch(q) {
  const lower = q.toLowerCase();
  return SEARCH_TRIGGERS.some(t => lower.includes(t));
}

function searchProducts(query, products) {
  const q = query.toLowerCase().replace(/[?!.,]/g, '');
  const words = q.split(/\s+/).filter(w => w.length > 2 && !SEARCH_TRIGGERS.includes(w) && !['near', 'me', 'please', 'the', 'any', 'for', 'some', 'got', 'you', 'have'].includes(w));

  if (!words.length) return products.slice(0, 4);

  return products.filter(p => {
    const haystack = (p.title + ' ' + p.category + ' ' + p.description).toLowerCase();
    return words.some(w => haystack.includes(w));
  }).slice(0, 4);
}

function getPlatformAnswer(question) {
  const q = question.toLowerCase();
  for (const { keys, answer } of PLATFORM_QA) {
    if (keys.some(k => q.includes(k))) return answer;
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
      <div style={{ fontSize: 28, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zm-card)', borderRadius: 8, flexShrink: 0 }}>
        {product.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {product.title}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--zm-green)', fontWeight: 600 }}>FREE</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--zm-text-dim)' }}>
            <MapPin size={9} /> {product.distance} km
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--zm-amber)' }}>
            <Star size={9} fill="currentColor" /> {product.seller.karma}
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

export default function BotAssistant() {
  const { botOpen, setBotOpen, products, setSelectedProduct } = useApp();
  const [messages, setMessages] = useState([
    { id: 0, from: 'bot', text: "Hi! I'm ZeroBot 🤖 — Ask me to find items near you (e.g. \"find books\", \"any electronics?\") or ask how ZeroMart works." }
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

      // Product search intent
      if (isProductSearch(question)) {
        const results = searchProducts(question, products);
        const resultMsg = results.length > 0
          ? `Found ${results.length} item${results.length > 1 ? 's' : ''} near you:`
          : 'Searched all listings near you.';
        setMessages(prev => [...prev, { id: Date.now() + 1, type: 'products', text: resultMsg, products: results }]);
        return;
      }

      // Platform Q&A
      const answer = getPlatformAnswer(question);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        from: 'bot',
        text: answer || "I can help you find items or answer questions about ZeroMart. Try: \"find clothes\", \"how does karma work?\", or \"what is ₹29 for?\"",
      }]);
    }, 600);
  }

  function handleOpenProduct(product) {
    setBotOpen(false);
    setSelectedProduct(product);
  }

  if (!botOpen) return null;

  return (
    <div className="overlay">
      <div className="sheet" style={{ height: '72vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--zm-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={18} color="var(--zm-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ZeroBot</div>
            <div style={{ fontSize: 11, color: 'var(--zm-text-dim)' }}>Find items · Platform help</div>
          </div>
          <button onClick={() => setBotOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
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
