import {
  ArrowLeft, Bell, CalendarClock, Check, ChevronRight, ExternalLink, Info, Mail, MapPin, MessageCircle, Navigation, Phone, UserRound, X,
} from 'lucide-react';
import { useState } from 'react';
import { createWhatsAppLink } from '../services/transactionService';
import LocationPicker from '../components/LocationPicker';
import { locationLabel } from '../services/locationService';

const requestStatusLabel = (item) => {
  if (item.requestStatus === 'completed') return 'Collected';
  if (item.requestStatus === 'declined') return 'Declined';
  if (item.requestStatus === 'accepted' && item.sellerGave) return 'Awaiting buyer confirmation';
  if (item.requestStatus === 'accepted') return item.type === 'request' ? 'Awaiting collection' : 'Ready to collect';
  return 'Awaiting decision';
};

const businessNotificationTypes = ['businessOrderUpdate', 'businessOrderReceived'];

const notificationStatusLabel = (item) => (
  businessNotificationTypes.includes(item.type) ? item.orderStatus : requestStatusLabel(item)
);

const notificationStatusTone = (item) => {
  const status = String(item.orderStatus || item.requestStatus || '').toLowerCase();
  if (['completed', 'collected', 'accepted', 'ready for pickup'].includes(status)) return 'bg-emerald-100 text-emerald-700';
  if (['declined', 'cancelled', 'no show'].includes(status)) return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-800';
};

const phoneLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `tel:+${digits.length === 10 ? `91${digits}` : digits}`;
};

export default function NotificationsPage({
  notifications,
  selectedNotification,
  onOpenNotification,
  onCloseNotification,
  onRequestDecision,
  onSellerHandover,
  onMarkCollected,
  onBack,
}) {
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  const [demoChatRequestId, setDemoChatRequestId] = useState('');
  const [demoChatDraft, setDemoChatDraft] = useState('');
  const [demoChatMessages, setDemoChatMessages] = useState([]);
  const [confirmation, setConfirmation] = useState({
    collectionDate: '',
    collectionTime: '',
    pickupAddress: '',
    pickupLocationData: null,
    sellerPhone: '',
    optionalMessage: '',
  });

  const openConfirmation = (item) => {
    setConfirmRequest(item);
    setConfirmation({
      collectionDate: '',
      collectionTime: '',
      pickupAddress: item.sellerPickupAddress || '',
      pickupLocationData: item.sellerLocationData || null,
      sellerPhone: item.sellerPhone || '',
      optionalMessage: '',
    });
  };

  const toggleDemoChat = (requestId) => {
    if (demoChatRequestId === requestId) {
      setDemoChatRequestId('');
      return;
    }
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(`zeromart-chat-${requestId}`)) || [];
    } catch {
      saved = [];
    }
    setDemoChatMessages(saved);
    setDemoChatRequestId(requestId);
  };

  const sendDemoChat = () => {
    const message = demoChatDraft.trim();
    if (!message || !demoChatRequestId) return;
    const next = [...demoChatMessages, { id: Date.now(), text: message, sender: 'buyer' }];
    setDemoChatMessages(next);
    localStorage.setItem(`zeromart-chat-${demoChatRequestId}`, JSON.stringify(next));
    setDemoChatDraft('');
  };

  const requestActions = (item) => {
    if (!['request', 'requestAccepted'].includes(item.type)) return null;
    if (item.type === 'request' && item.requestStatus === 'pending') {
      return (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={(event) => { event.stopPropagation(); openConfirmation(item); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white">
            <Check size={16} /> Confirm
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onRequestDecision(item, 'declined'); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700">
            <X size={16} /> Decline
          </button>
        </div>
      );
    }
    if (item.type === 'request' && item.requestStatus === 'accepted' && item.isDemo && !item.sellerGave) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSellerHandover(item);
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white"
        >
          <Check size={16} /> I handed over the item
        </button>
      );
    }
    if (item.type === 'request' && item.requestStatus === 'accepted' && item.isDemo && item.sellerGave) {
      return <p className="mt-3 rounded-xl bg-emerald-100 px-3 py-2.5 text-center text-sm font-bold text-emerald-800">Handed over · awaiting buyer confirmation</p>;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50">
        <ArrowLeft size={16} /> Back
      </button>
      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-violet-600" />
          <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
        </div>
        <div className="mt-4 space-y-2">
          {notifications.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-200 p-4 text-sm text-slate-500">No updates yet.</div>
          ) : (
            notifications.map((item) => (
              <article key={item.id} className="rounded-[1.25rem] border border-slate-100 bg-slate-50 p-3 transition hover:border-violet-100 hover:bg-violet-50/60">
                <button type="button" onClick={() => onOpenNotification(item)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-800">{item.title}</p>
                        {['request', 'requestAccepted', ...businessNotificationTypes].includes(item.type) && (
                          <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${notificationStatusTone(item)}`}>
                            {notificationStatusLabel(item)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{item.body}</p>
                      {item.type === 'request' && (
                        <p className="mt-2 text-xs font-bold text-slate-600">{item.productName || item.title.replace('Request for ', '')} · Quantity {item.quantity || 1}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!item.read && <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />}
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{item.time}</p>
                </button>
                {requestActions(item)}
              </article>
            ))
          )}
        </div>
      </section>

      {selectedNotification && ['requestAccepted', ...businessNotificationTypes].includes(selectedNotification.type) && (
        <button type="button" aria-label="Close notification details" onClick={onCloseNotification} className="fixed inset-0 z-[219] bg-slate-950/50 backdrop-blur-sm" />
      )}
      {selectedNotification && (
        <section className={['requestAccepted', ...businessNotificationTypes].includes(selectedNotification.type)
          ? 'fixed left-1/2 top-1/2 z-[220] max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-5 shadow-2xl'
          : 'rounded-[2rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-5 shadow-sm'}
        >
          {['requestAccepted', ...businessNotificationTypes].includes(selectedNotification.type) && (
            <button type="button" onClick={onCloseNotification} className="absolute right-4 top-4 rounded-full bg-white p-2 text-slate-500 shadow-sm" aria-label="Close accepted request details">
              <X size={18} />
            </button>
          )}
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white p-3 text-violet-600">
              {['request', 'requestAccepted'].includes(selectedNotification.type) ? <UserRound size={18} /> : <Info size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-violet-600">{selectedNotification.type === 'request' ? 'Buyer request' : selectedNotification.type === 'requestAccepted' ? 'Request accepted' : businessNotificationTypes.includes(selectedNotification.type) ? 'Business order' : 'Notification details'}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectedNotification.infoTitle || selectedNotification.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{selectedNotification.infoBody || selectedNotification.body}</p>
              {selectedNotification.type === 'request' && (
                <div className="mt-4 space-y-2 rounded-2xl border border-white/80 bg-white/80 p-3">
                  <p className="flex items-center gap-2 text-sm text-slate-700"><UserRound size={15} className="text-violet-600" /><strong>{selectedNotification.buyerName}</strong></p>
                  <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin size={15} className="text-emerald-700" />{selectedNotification.buyerLocation}</p>
                  <p className="flex items-center gap-2 text-sm text-slate-600"><Phone size={15} className="text-amber-600" />{selectedNotification.buyerPhone}</p>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Product</p>
                    <p className="mt-1 font-bold text-slate-900">{selectedNotification.productName || selectedNotification.title.replace('Request for ', '')}</p>
                    <p className="mt-1 text-sm text-slate-600">Quantity: {selectedNotification.quantity || 1}</p>
                  </div>
                </div>
              )}
              {selectedNotification.type === 'requestAccepted' && (
                <div className="mt-4 space-y-2 rounded-2xl border border-white/80 bg-white/80 p-3 text-sm text-slate-700">
                  <p className="font-bold text-slate-900">{selectedNotification.productName}</p>
                  <p className="text-slate-600">Seller: {selectedNotification.sellerName}</p>
                  {selectedNotification.collectionDate && <p className="flex items-center gap-2"><CalendarClock size={15} className="text-violet-600" />{selectedNotification.collectionDate} · {selectedNotification.collectionTime}</p>}
                  {selectedNotification.pickupAddress && <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-emerald-700" />{selectedNotification.pickupAddress}</p>}
                  {selectedNotification.sellerPhone && <p className="flex items-center gap-2"><Phone size={15} className="text-amber-600" />{selectedNotification.sellerPhone}</p>}
                  {selectedNotification.optionalMessage && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">“{selectedNotification.optionalMessage}”</p>}
                  <div className="grid gap-2 pt-2 sm:grid-cols-2">
                    {selectedNotification.mapsLink && <a href={selectedNotification.mapsLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 font-bold text-emerald-800"><Navigation size={15} /> Open map</a>}
                    {selectedNotification.sellerPhone && <a href={phoneLink(selectedNotification.sellerPhone)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 font-bold text-violet-800"><Phone size={15} /> Call seller</a>}
                    {selectedNotification.whatsappLink && <a href={selectedNotification.whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 font-bold text-emerald-700"><MessageCircle size={15} /> WhatsApp</a>}
                    {selectedNotification.emailLink && <a href={selectedNotification.emailLink} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold text-slate-700"><Mail size={15} /> Email draft</a>}
                    {selectedNotification.isDemo && selectedNotification.requestStatus === 'accepted' && (
                      <button type="button" onClick={() => toggleDemoChat(selectedNotification.requestId)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 font-bold text-violet-800">
                        <MessageCircle size={15} /> Temporary chat
                      </button>
                    )}
                  </div>
                  {selectedNotification.isDemo && demoChatRequestId === selectedNotification.requestId && selectedNotification.requestStatus === 'accepted' && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Temporary chat</p>
                      <div className="mt-2 max-h-28 space-y-2 overflow-y-auto">
                        {demoChatMessages.length === 0
                          ? <p className="text-xs text-slate-500">Coordinate collection here. This chat is deleted when the handover completes.</p>
                          : demoChatMessages.map((message) => <p key={message.id} className="ml-auto w-fit max-w-[85%] rounded-xl bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">{message.text}</p>)}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input value={demoChatDraft} onChange={(event) => setDemoChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendDemoChat(); }} placeholder="Type a message" className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs outline-none" />
                        <button type="button" onClick={sendDemoChat} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">Send</button>
                      </div>
                    </div>
                  )}
                  {selectedNotification.requestStatus === 'accepted' ? (
                    <button type="button" onClick={() => onMarkCollected(selectedNotification)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-3 font-bold text-white"><Check size={16} /> Mark collected</button>
                  ) : selectedNotification.requestStatus === 'completed' ? (
                    <p className="rounded-xl bg-emerald-100 px-3 py-3 text-center font-bold text-emerald-800">Collection completed</p>
                  ) : null}
                </div>
              )}
              {businessNotificationTypes.includes(selectedNotification.type) && (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/80 bg-white/85 p-4 text-sm text-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Product</p>
                      <p className="mt-1 font-bold text-slate-900">{selectedNotification.productName}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${notificationStatusTone(selectedNotification)}`}>{notificationStatusLabel(selectedNotification)}</span>
                  </div>
                  {selectedNotification.businessName && <p>Business: <strong>{selectedNotification.businessName}</strong></p>}
                  {selectedNotification.buyerName && <p>Buyer: <strong>{selectedNotification.buyerName}</strong></p>}
                  <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                    <p>Quantity: <strong>{selectedNotification.quantity || 1}</strong></p>
                    <p>Order ID: <strong>{selectedNotification.orderId}</strong></p>
                    {selectedNotification.collectionCode && <p className="sm:col-span-2">Collection ID: <strong>{selectedNotification.collectionCode}</strong></p>}
                  </div>
                  {selectedNotification.collectionTime && <p className="flex items-center gap-2"><CalendarClock size={15} className="text-violet-600" />{selectedNotification.collectionTime}</p>}
                  {selectedNotification.pickupAddress && <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-emerald-700" />{selectedNotification.pickupAddress}</p>}
                  {selectedNotification.sellerPhone && <p className="flex items-center gap-2"><Phone size={15} className="text-amber-600" />{selectedNotification.sellerPhone}</p>}
                  {selectedNotification.buyerPhone && <p className="flex items-center gap-2"><Phone size={15} className="text-amber-600" />{selectedNotification.buyerPhone}</p>}
                  <div className="grid gap-2 pt-1 sm:grid-cols-2">
                    {selectedNotification.mapsLink && <a href={selectedNotification.mapsLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 font-bold text-emerald-800"><Navigation size={15} /> Open map</a>}
                    {selectedNotification.sellerPhone && <a href={phoneLink(selectedNotification.sellerPhone)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 font-bold text-violet-800"><Phone size={15} /> Call business</a>}
                    {selectedNotification.buyerPhone && <a href={phoneLink(selectedNotification.buyerPhone)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 font-bold text-violet-800"><Phone size={15} /> Call buyer</a>}
                    {selectedNotification.whatsappLink && <a href={selectedNotification.whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 font-bold text-emerald-700"><MessageCircle size={15} /> WhatsApp</a>}
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs font-semibold text-slate-400">{selectedNotification.time}</p>
              {selectedNotification.type === 'request' && requestActions(selectedNotification)}
              {selectedNotification.type === 'request' && selectedNotification.requestStatus === 'pending' && selectedNotification.sellerPhone && (
                <a
                  href={createWhatsAppLink(selectedNotification.sellerPhone, `Hello,\n\n${selectedNotification.buyerName} from ${selectedNotification.buyerLocation} requested to collect your product:\n\n${selectedNotification.productName || 'ZeroMart item'}\n\nQuantity: ${selectedNotification.quantity || 1}\n\nPlease confirm here:\n${selectedNotification.requestUrl || `${window.location.origin}/request/${selectedNotification.requestId}`}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-700"
                >
                  Send WhatsApp reminder <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {confirmRequest && (
        <div className="fixed inset-0 z-[230] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Confirm request</p><h3 className="mt-1 text-xl font-extrabold text-slate-900">{confirmRequest.title}</h3></div>
              <button onClick={() => setConfirmRequest(null)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X size={18} /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">Collection date<input type="date" value={confirmation.collectionDate} onChange={(event) => setConfirmation({ ...confirmation, collectionDate: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
              <label className="text-sm font-bold text-slate-700">Collection time<input type="time" value={confirmation.collectionTime} onChange={(event) => setConfirmation({ ...confirmation, collectionTime: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:col-span-2">
                <p className="text-sm font-bold text-slate-700">Pickup location</p>
                <p className="mt-2 text-sm font-semibold text-emerald-800">{confirmation.pickupAddress || 'Choose the exact collection point'}</p>
                <button type="button" onClick={() => setShowPickupPicker(true)} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm">
                  Choose location
                </button>
              </div>
            </div>
            <label className="mt-4 block text-sm font-bold text-slate-700">Seller phone<input value={confirmation.sellerPhone} onChange={(event) => setConfirmation({ ...confirmation, sellerPhone: event.target.value })} inputMode="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
            <label className="mt-4 block text-sm font-bold text-slate-700">Optional message<textarea rows={2} value={confirmation.optionalMessage} onChange={(event) => setConfirmation({ ...confirmation, optionalMessage: event.target.value })} placeholder="Please come before 6 PM." className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-3" /></label>
            <button
              onClick={() => {
                onRequestDecision(confirmRequest, 'accepted', confirmation);
                setConfirmRequest(null);
              }}
              disabled={!confirmation.collectionDate || !confirmation.collectionTime
                || !confirmation.pickupLocationData?.doorNo || !confirmation.pickupLocationData?.buildingName
                || !confirmation.pickupLocationData?.landmark || !confirmation.sellerPhone}
              className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-40"
            >
              Confirm Collection
            </button>
            <button onClick={() => { onRequestDecision(confirmRequest, 'declined'); setConfirmRequest(null); }} className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-700">Decline</button>
            <p className="mt-3 text-center text-xs font-semibold text-slate-500">These details are sent directly to the buyer for call or WhatsApp coordination.</p>
          </section>
        </div>
      )}
      <LocationPicker
        open={showPickupPicker}
        onClose={() => setShowPickupPicker(false)}
        onSelect={(location) => {
          setConfirmation((current) => ({
            ...current,
            pickupAddress: location.fullAddress || locationLabel(location),
            pickupLocationData: location,
          }));
          setShowPickupPicker(false);
        }}
        title="Choose Collection Location"
        requireAddressDetails={false}
        requiredDetails={[]}
        addressTypeDefault="Other"
        zIndex={250}
      />
    </div>
  );
}
