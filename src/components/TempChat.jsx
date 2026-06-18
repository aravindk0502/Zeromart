import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Clock, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

const INITIAL_MESSAGES = [
  { id: 1, from: 'them', text: "Hi! I've accepted your collect request. When are you free to pick this up?", time: 'now' },
];

export default function TempChat() {
  const { chatOpen, setChatOpen, triggerKarmaPopup } = useApp();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [completed, setCompleted] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!chatOpen) return null;

  function send() {
    if (!input.trim()) return;
    const newMsg = { id: Date.now(), from: 'me', text: input.trim(), time: 'now' };
    setMessages(prev => [...prev, newMsg]);
    setInput('');

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        from: 'them',
        text: "Sounds good! I'll be at the gate. Look for the blue building.",
        time: 'now'
      }]);
    }, 1200);
  }

  function markComplete() {
    setCompleted(true);
    setTimeout(() => {
      setChatOpen(null);
      setCompleted(false);
      setMessages(INITIAL_MESSAGES);
      triggerKarmaPopup(chatOpen);
    }, 1500);
  }

  return (
    <div className="overlay">
      <div className="sheet" style={{ height: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid var(--zm-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div className="avatar avatar-sm">{chatOpen.initials}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{chatOpen.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} color="var(--zm-amber)" />
                <span style={{ fontSize: 11, color: 'var(--zm-amber)' }}>Temporary chat — closes after handoff</span>
              </div>
            </div>
          </div>
          <button onClick={() => setChatOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zm-text-muted)' }}>
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
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.from === 'me' ? 'flex-end' : 'flex-start' }}>
              <div className={`chat-bubble ${msg.from === 'me' ? 'mine' : 'theirs'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--zm-border)', flexShrink: 0 }}>
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
          <button className="btn btn-green btn-full btn-sm" onClick={markComplete}>
            {completed ? 'Completing handoff… ✓' : '✓ Mark handoff complete'}
          </button>
        </div>
      </div>
    </div>
  );
}
