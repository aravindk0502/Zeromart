import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingAvailability, getListingExpiryTimestamp, getPublicProductUrl } from '../src/utils/listingPresentation.js';

test('formats exact rescue expiry and blocks expired listings', () => {
  const item = { id: 'safe-id', expiryDate: '2026-07-22', expiryTime: '20:00', isBusinessProduct: true };
  const beforeExpiry = Date.parse('2026-07-22T17:00:00');
  const afterExpiry = Date.parse('2026-07-22T20:01:00');

  assert.equal(getListingExpiryTimestamp(item), Date.parse('2026-07-22T20:00:59'));
  assert.equal(getListingAvailability(item, beforeExpiry).timingLabel, 'Expires in 4 hours');
  assert.equal(getListingAvailability(item, afterExpiry).available, false);
  assert.equal(getListingAvailability(item, afterExpiry).statusLabel, 'Expired');
});

test('does not invent availability dates and creates safe product links', () => {
  const item = { id: 'listing/with spaces', status: 'Available', availableQuantity: 1 };
  assert.equal(getListingAvailability(item).timingLabel, '');
  assert.equal(getPublicProductUrl(item), 'https://www.drizn.com/product/listing%2Fwith%20spaces');
});

test('maps terminal listing states to non-requestable labels', () => {
  assert.deepEqual(getListingAvailability({ status: 'Reserved' }).statusLabel, 'Reserved');
  assert.deepEqual(getListingAvailability({ status: 'Collected' }).statusLabel, 'Collected');
  assert.deepEqual(getListingAvailability({ status: 'sold_out' }).statusLabel, 'Sold out');
  assert.equal(getListingAvailability({ status: 'Available', availableQuantity: 0 }).available, false);
});
