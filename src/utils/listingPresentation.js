const CLOSED_STATUSES = new Set(['expired', 'collected', 'completed', 'sold', 'sold out', 'sold_out', 'deleted', 'blocked', 'hidden']);

export const getListingExpiryTimestamp = (item = {}) => {
  const date = item.expiryDate || item.validTill || item.availableUntil || item.metadata?.expiryDate || item.metadata?.validTill;
  if (!date) return null;
  const time = item.expiryTime || item.metadata?.expiryTime || '23:59';
  const timestamp = Date.parse(`${String(date).slice(0, 10)}T${String(time).slice(0, 5)}:59`);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getListingAvailability = (item = {}, now = Date.now()) => {
  const status = String(item.status || item.metadata?.status || 'Available').trim().toLowerCase();
  const expiryTimestamp = getListingExpiryTimestamp(item);
  const expired = CLOSED_STATUSES.has(status) && status === 'expired'
    || (expiryTimestamp !== null && expiryTimestamp <= now);
  if (expired) return { expired: true, available: false, statusLabel: 'Expired', timingLabel: 'Expired' };
  if (status.includes('collected') || status.includes('completed')) return { expired: false, available: false, statusLabel: 'Collected', timingLabel: '' };
  if (status.includes('sold')) return { expired: false, available: false, statusLabel: 'Sold out', timingLabel: '' };
  if (status.includes('reserved')) return { expired: false, available: false, statusLabel: 'Reserved', timingLabel: '' };
  if (Number(item.availableQuantity ?? item.quantity ?? 1) <= 0) return { expired: false, available: false, statusLabel: 'Sold out', timingLabel: '' };
  if (expiryTimestamp === null) return { expired: false, available: true, statusLabel: '', timingLabel: '' };

  const remainingHours = Math.ceil((expiryTimestamp - now) / (60 * 60 * 1000));
  const exact = new Date(expiryTimestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(item.expiryTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
  const rescue = Boolean(item.isBusinessProduct || item.expiryTime || item.nearExpiry || item.expiryBadge?.nearExpiry);
  return {
    expired: false,
    available: true,
    statusLabel: '',
    timingLabel: rescue && remainingHours <= 24
      ? `Expires in ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`
      : `${rescue ? 'Valid until' : 'Available until'}: ${exact}`,
  };
};

export const getPublicProductUrl = (item = {}) => {
  const id = encodeURIComponent(String(item.publicSlug || item.slug || item.serverId || item.id || '').trim());
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.drizn.com';
  return `${origin}/product/${id}`;
};