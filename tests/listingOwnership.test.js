import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getActorIdentifiers,
  getListingOwnerIdentifiers,
  isListingOwnedByUser,
} from '../src/utils/listingOwnership.js';

test('getActorIdentifiers normalizes and dedupes ids', () => {
  const ids = getActorIdentifiers({
    userId: ' User-1 ',
    mobile: '9999999999',
    ownerMobile: '9999999999',
  });

  assert.equal(ids.has('user-1'), true);
  assert.equal(ids.has('9999999999'), true);
  assert.equal(ids.size >= 2, true);
});

test('getListingOwnerIdentifiers includes metadata ownerMobile', () => {
  const ids = getListingOwnerIdentifiers({
    sellerId: 'Seller-1',
    metadata: { ownerMobile: '8888888888' },
  });

  assert.equal(ids.has('seller-1'), true);
  assert.equal(ids.has('8888888888'), true);
});

test('isListingOwnedByUser matches by normalized identifier', () => {
  const owned = isListingOwnedByUser(
    { sellerId: 'Seller-1' },
    { userId: ' seller-1 ' },
  );

  assert.equal(owned, true);
});

test('isListingOwnedByUser does not match generic names only', () => {
  const owned = isListingOwnedByUser(
    { sellerName: 'You' },
    { name: 'Unknown' },
  );

  assert.equal(owned, false);
});
