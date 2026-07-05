import { useEffect, useState } from 'react';
import { ArrowLeft, LocateFixed, LogOut, MapPin, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { useLocationEngine } from '../hooks/useLocationEngine';
import LocationMap from '../components/LocationMap';
import OrderTrackingModal from '../components/OrderTrackingModal';
import CollectionPass, { getCollectionPassState } from '../components/CollectionPass';

const makeFallbackRows = (count, label, status) => {
  const total = Math.max(0, Number(count) || 0);
  const visible = Math.min(total, 8);
  return Array.from({ length: visible }, (_, index) => ({
    id: `${label}-${index + 1}`,
    title: `${label} ${index + 1}`,
    meta: status,
    status,
  }));
};

export default function ProfilePage({ user, items = [], orders = [], receivedOrders = [], onLogin, onBack, onLogout, onUpdateUser, onSelectItem }) {
  const locationEngine = useLocationEngine();
  const [selectedStat, setSelectedStat] = useState('Items listed');
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    if (locationEngine.location) onUpdateUser?.({ location: locationEngine.location });
  }, [locationEngine.location?.updatedAt]);

  const handleProfileImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdateUser?.({ profileImage: reader.result });
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-[2rem] border border-amber-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Your profile</h2>
          <p className="mt-2 text-sm text-slate-500">Login with your mobile number to view karma, listings, and exchange history.</p>
          <button onClick={onLogin} className="mt-5 rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white">Login with OTP</button>
        </div>
      </div>
    );
  }

  const listedItems = items.filter((item) => item.sellerName === user.name || item.sellerName === 'You');
  const activeItems = listedItems.filter((item) => (item.status || 'Available') !== 'Completed');
  const collectedOrders = orders.filter((order) => order.type === 'delivery' || order.type === 'in-person');
  const givenAwayOrders = orders.filter((order) => order.type === 'in-person');
  const statCards = [
    {
      label: 'Items listed',
      value: user.listed,
      detail: 'Items you have listed for ₹0 so others can reuse them.',
      rows: listedItems.length
        ? listedItems.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.category} · ${item.condition}`,
            status: item.status || 'Available',
            image: item.image,
            item,
          }))
        : makeFallbackRows(user.listed, 'Listed item', 'Listed for ₹0'),
    },
    {
      label: 'Items collected',
      value: user.collected,
      detail: 'Items you have collected personally or through delivery.',
      rows: collectedOrders.length
        ? collectedOrders.map((order) => ({
            id: order.id,
            title: order.title,
            meta: `${order.location}${order.distance ? ` · ${order.distance}` : ''}`,
            status: order.type === 'delivery' ? 'Delivery order' : 'Collected personally',
            image: order.image,
          }))
        : makeFallbackRows(user.collected, 'Collected item', 'Collected personally'),
    },
    {
      label: 'Active listings',
      value: user.activeListings,
      detail: 'Your currently live listings visible on ZeroMart.',
      rows: activeItems.length
        ? activeItems.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.location} · ${item.category}`,
            status: item.status || 'Available',
            image: item.image,
            item,
          }))
        : makeFallbackRows(user.activeListings, 'Active listing', 'Available'),
    },
    {
      label: 'Given away',
      value: user.givenAway,
      detail: 'Items successfully given away for good karma.',
      rows: givenAwayOrders.length
        ? givenAwayOrders.map((order) => ({
            id: order.id,
            title: order.title,
            meta: `Given to collector · ${order.createdAt}`,
            status: 'Good karma received',
            image: order.image,
          }))
        : makeFallbackRows(user.givenAway, 'Given away item', 'Good karma received'),
    },
  ];
  const activeStat = statCards.find((stat) => stat.label === selectedStat) || statCards[0];
  const hiddenRowCount = Math.max(0, Number(activeStat.value || 0) - activeStat.rows.length);
  const collectionOrders = orders.filter((order) => order.collectionCode);
  const activeCollectionOrders = collectionOrders.filter((order) => getCollectionPassState(order).active);
  const currentLocationLines = [
    locationEngine.location?.street,
    locationEngine.location?.subLocality || locationEngine.location?.locality || locationEngine.location?.area,
    locationEngine.location?.city,
    locationEngine.location?.district,
    locationEngine.location?.state,
    locationEngine.location?.country,
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50">
        <ArrowLeft size={16} /> Back
      </button>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-600">Your profile</p>
            <h2 className="text-xl font-semibold text-slate-900">{user.name}</h2>
            <p className="mt-1 text-sm text-slate-500">One account to buy and sell</p>
          </div>
          <div className="text-right">
            <label className="group block cursor-pointer">
              <div className="ml-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-amber-100 bg-amber-50 text-violet-600 transition group-hover:border-violet-200">
                {user.profileImage ? (
                  <img src={user.profileImage} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <ShieldCheck size={22} />
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleProfileImage} />
              <span className="mt-2 block text-xs font-semibold text-violet-700">Add photo</span>
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-violet-700">Good karma points</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{user.karma}</p>
            </div>
            <div className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-violet-700">
              Karma
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Mobile</p>
            <p className="mt-1 text-sm text-violet-800">+91 ******{String(user.mobile || '').slice(-4)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-violet-700">
            {user.isBuyer ? 'Lifetime buying access active' : 'Buying unlocks when you request an item'}
          </div>
          <button onClick={onLogout} className="ml-auto inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <LogOut size={14} /> Logout
          </button>
        </div>

        <div className="mt-4 rounded-[1.25rem] border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2.5 text-emerald-700 shadow-sm"><MapPin size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Current Location</p>
              <div className="mt-2 space-y-0.5">
                {currentLocationLines.length ? currentLocationLines.map((line) => (
                  <p key={line} className="text-sm font-semibold leading-5 text-emerald-800">{line}</p>
                )) : <p className="text-sm font-semibold text-emerald-800">{locationEngine.label}</p>}
              </div>
              {locationEngine.location?.postalCode && <p className="mt-2 text-xs font-bold text-slate-500">Postal code {locationEngine.location.postalCode}</p>}
              {locationEngine.location?.plusCode && <p className="mt-1 text-xs font-semibold text-slate-400">Plus Code {locationEngine.location.plusCode}</p>}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button onClick={() => locationEngine.openPicker({
              title: 'Update current home location',
              requireAddressDetails: false,
              requiredDetails: [],
              addressTypeDefault: 'Home',
            })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white">
              <LocateFixed size={16} /> Update Current Location
            </button>
            <button onClick={() => locationEngine.openPicker({
              title: 'Update home location',
              requireAddressDetails: false,
              requiredDetails: [],
              addressTypeDefault: 'Home',
            })} className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-bold text-emerald-800">Change Location</button>
          </div>
          {locationEngine.location && (
            <div className="mt-3">
              <LocationMap latitude={locationEngine.location.latitude} longitude={locationEngine.location.longitude} title={locationEngine.label} height={170} />
            </div>
          )}
        </div>
      </section>

      {activeCollectionOrders.length > 0 && (
        <section className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Ready for collection</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Your active collection passes</h2>
          <p className="mt-1 text-sm text-slate-500">Keep this QR or collection ID ready until the item is collected.</p>
          <div className="mt-4 space-y-3">
            {activeCollectionOrders.map((order) => (
              <CollectionPass key={order.id} order={order} onTrack={() => setSelectedOrder(order)} />
            ))}
          </div>
        </section>
      )}

      {receivedOrders.length > 0 && (
        <section className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Seller history</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Orders received</h2>
              <p className="mt-1 text-sm text-slate-500">Buyer requests remain here after collection is completed.</p>
            </div>
            <div className="rounded-full bg-emerald-50 p-3 text-emerald-700">
              <PackageCheck size={18} />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {receivedOrders.map((order) => {
              const status = order.status === 'completed'
                ? 'Collected'
                : order.status === 'accepted'
                  ? 'Awaiting collection'
                  : order.status === 'declined'
                    ? 'Declined'
                    : 'Awaiting decision';
              const statusStyle = order.status === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : order.status === 'accepted'
                  ? 'bg-sky-100 text-sky-800'
                  : order.status === 'declined'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-800';
              return (
                <article key={order.requestId} className="rounded-[1.35rem] border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900">{order.productName}</h3>
                      <p className="mt-1 text-sm text-slate-600">Buyer: <strong>{order.buyerName}</strong></p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Quantity {order.quantity || 1} · Request ID {order.requestId}</p>
                    </div>
                    <span className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyle}`}>{status}</span>
                  </div>
                  {(order.collectionDate || order.collectionTime || order.pickupAddress) && (
                    <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-600">
                      {(order.collectionDate || order.collectionTime) && <p>{[order.collectionDate, order.collectionTime].filter(Boolean).join(' · ')}</p>}
                      {order.pickupAddress && <p className="mt-1 flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-emerald-700" />{order.pickupAddress}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-violet-600">Profile activity</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Your ZeroMart summary</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {statCards.map((stat) => (
            <button
              key={stat.label}
              onClick={() => setSelectedStat(stat.label)}
              className={`rounded-[1.5rem] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
                selectedStat === stat.label
                  ? 'border-violet-200 bg-violet-50'
                  : 'border-amber-100 bg-white'
              }`}
            >
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50 to-violet-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-violet-700">{activeStat.label}</p>
              <p className="mt-1 text-sm text-slate-600">{activeStat.detail}</p>
            </div>
            <span className="rounded-full bg-white px-4 py-2 text-lg font-bold text-violet-700">{activeStat.value}</span>
          </div>
          <div className="mt-4 space-y-2">
            {activeStat.rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 p-4 text-sm text-slate-500">
                Nothing to show here yet.
              </div>
            ) : (
              activeStat.rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  disabled={!row.item}
                  onClick={() => row.item && onSelectItem?.(row.item)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/85 p-3 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:ring-2 enabled:hover:ring-violet-100 disabled:cursor-default"
                >
                  {row.image ? (
                    <img src={row.image} alt={row.title} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      <PackageCheck size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.title}</p>
                    <p className="truncate text-xs text-slate-500">{row.meta}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{row.status}</span>
                </button>
              ))
            )}
            {hiddenRowCount > 0 && (
              <div className="rounded-2xl bg-white/60 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                +{hiddenRowCount} more {activeStat.label.toLowerCase()}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-600">Order history</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Your requests and collections</h2>
          </div>
          <div className="rounded-full bg-violet-50 p-3 text-violet-600">
            <PackageCheck size={18} />
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-amber-200 bg-amber-50/50 p-5 text-sm text-slate-500">
            No requests yet. When you request an item for collection, it will appear here.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {orders.map((order) => {
              const isDelivery = order.type === 'delivery';
              const passState = getCollectionPassState(order);
              return (
                <button type="button" key={order.id} onClick={() => setSelectedOrder(order)} className="block w-full rounded-[1.5rem] border border-amber-100 bg-gradient-to-r from-amber-50/70 to-violet-50/70 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300">
                  <div className="flex gap-3">
                    {order.image ? (
                      <img src={order.image} alt={order.title} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600">
                        <PackageCheck size={22} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-900">{order.title}</h3>
                          <p className="mt-1 text-sm text-slate-500">Seller: {order.sellerName}</p>
                          <p className="mt-1 truncate text-xs font-bold text-violet-700">Order ID: {order.orderId || order.id}</p>
                        </div>
                        <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${passState.expired ? 'bg-slate-200 text-slate-600' : isDelivery ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-800'}`}>
                          {isDelivery ? <Truck size={13} /> : <PackageCheck size={13} />}
                          {order.collectionCode ? passState.label : isDelivery ? 'Delivery' : 'In-person collection'}
                        </span>
                      </div>
                      <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm text-slate-600">
                        <p className="font-semibold text-slate-800">{isDelivery ? 'Delivery status' : 'Collection status'}</p>
                        <p className="mt-1">{passState.expired ? 'Reservation expired' : order.status}</p>
                        {isDelivery && order.buyerAddress && (
                          <p className="mt-2 text-xs text-slate-500">Deliver to: {order.buyerAddress}</p>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><MapPin size={12} /> {order.location}{order.distance ? ` · ${order.distance}` : ''}</span>
                        <span>{order.createdAt}</span>
                      </div>
                      <span className="mt-3 inline-flex text-xs font-bold text-violet-700">View tracking details</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <OrderTrackingModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
