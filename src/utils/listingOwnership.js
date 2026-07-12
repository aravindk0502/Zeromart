const normalize = (value) => String(value ?? '').trim().toLowerCase();

const toSet = (values) => new Set(values.map(normalize).filter(Boolean));

const GENERIC_NAMES = new Set(['unknown', 'you', 'business store', 'seller']);

export const getActorIdentifiers = (actor = {}) => {
  return toSet([
    actor.userId,
    actor.id,
    actor.accountId,
    actor.businessId,
    actor.sellerId,
    actor.mobile,
    actor.phone,
    actor.ownerId,
    actor.ownerMobile,
  ]);
};

export const getListingOwnerIdentifiers = (listing = {}) => {
  return toSet([
    listing.ownerId,
    listing.owner_id,
    listing.sellerId,
    listing.seller_id,
    listing.businessId,
    listing.business_id,
    listing.ownerMobile,
    listing.owner_mobile,
    listing.metadata?.ownerMobile,
  ]);
};

export const isListingOwnedByUser = (listing = {}, actor = null) => {
  if (!actor || !listing) return false;
  if (listing.isOwn === true) return true;

  const actorIds = getActorIdentifiers(actor);
  const listingIds = getListingOwnerIdentifiers(listing);
  for (const id of actorIds) {
    if (listingIds.has(id)) return true;
  }

  const actorName = normalize(actor.name);
  const listingSeller = normalize(listing.sellerName || listing.storeName || listing.businessName);
  if (GENERIC_NAMES.has(actorName) || GENERIC_NAMES.has(listingSeller)) return false;
  return Boolean(actorName && listingSeller && actorName === listingSeller);
};
