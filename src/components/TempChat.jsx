import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, Clock, MapPin, Package, Phone, Send, X } from 'lucide-react';

const INITIAL_MESSAGES = [
  { id: 1, from: 'system', text: 'Use this chat to coordinate collection, share contact details, or arrange your own courier.', time: 'now' },
];

export default function TempChat({ open, chat, onClose, onComplete }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [completed, setCompleted] = useState(false);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);
  const storageKey = chat?.requestId ? `zeromart-chat-${chat.requestId}` : '';

  useEffect(() => {
    if (!open || !storageKey) return undefined;

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      setMessages(Array.isArray(saved) && saved.length ? saved : INITIAL_MESSAGES);
    } catch {
      setMessages(INITIAL_MESSAGES);
    }

    const handleStorage = (event) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        setMessages(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed chat data.
      }
    };

    window.addEventListener('storage', handleStorage);
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(`zeromart-chat-${chat.requestId}`);
      channelRef.current.onmessage = (event) => {
        if (Array.isArray(event.data)) setMessages(event.data);
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [open, storageKey, chat?.requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!open) return null;

  function send() {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  }

  function sendMessage(text) {
    const newMsg = {
      id: Date.now(),
      senderId: chat?.currentUserId || 'local-user',
      senderName: chat?.currentUserName || 'You',
      text,
      time: 'now',
    };
    setMessages((prev) => {
      const next = [...prev, newMsg];
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      channelRef.current?.postMessage(next);
      return next;
    });
  }

  function sharePhone() {
    sendMessage(chat?.phone ? `My phone number is ${chat.phone}.` : 'Please share your phone number so we can coordinate.');
  }

  function shareLocation() {
    sendMessage(chat?.location ? `My current pickup area is ${chat.location}.` : 'Please share the exact pickup location.');
  }

  function arrangeCourier() {
    sendMessage('I would like to arrange my own courier, such as Uber Courier. Can we coordinate pickup details here?');
  }

  function markComplete() {
    setCompleted(true);
    setTimeout(() => {
      const fullyCompleted = onComplete(chat?.role || 'buyer');
      setCompleted(false);
      if (fullyCompleted) {
        setMessages(INITIAL_MESSAGES);
        if (storageKey) localStorage.removeItem(storageKey);
      } else {
        onClose();
      }
    }, 1200);
  }

  return (
    <div className="overlay">
      <div className="sheet" style={{ height: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div className="avatar avatar-sm">{chat?.initials || 'NZ'}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{chat?.name || 'Nearby seller'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} color="var(--zm-amber)" />
                <span style={{ fontSize: 11, color: 'var(--zm-amber)' }}>Temporary chat — closes after handoff</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Warning banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(245,166,35,0.08)', borderBottom: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <AlertCircle size={12} color="var(--zm-amber)" />
          <span style={{ fontSize: 11, color: 'var(--zm-amber)' }}>This chat is temporary and will be permanently deleted once you mark the handoff complete.</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.senderId === chat?.currentUserId ? 'flex-end' : 'flex-start' }}>
              <div className={`chat-bubble ${msg.senderId === chat?.currentUserId ? 'mine' : 'theirs'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={shareLocation} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <MapPin size={13} /> Share location
            </button>
            <button type="button" onClick={sharePhone} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
              <Phone size={13} /> Share phone
            </button>
            <button type="button" onClick={arrangeCourier} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <Package size={13} /> Arrange courier
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Type a message…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button onClick={send} className="btn btn-primary" style={{ padding: '0 14px', borderRadius: 10 }}>
              <Send size={16} />
            </button>
          </div>
          {chat?.canComplete ? (
            <button className="btn btn-green btn-full btn-sm" onClick={markComplete}>
              {completed ? 'Saving confirmation… ✓' : chat?.role === 'seller' ? '✓ I Gave the item' : '✓ I Collected the item'}
            </button>
          ) : (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">
              Waiting for the buyer to confirm they received the item.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
