import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getListingAvailability,
  getListingExpiryTimestamp,
  getOptimizedProductImageUrl,
  getProductRouteId,
  getPublicProductUrl,
} from '../src/utils/listingPresentation.js';

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
  assert.equal(getPublicProductUrl(item), 'https://www.drizn.com/product/listing%2Fwith%20spaces?preview=2');
});

test('optimizes Supabase product images without changing external images', () => {
  const source = 'https://project.supabase.co/storage/v1/object/public/product-images/item.jpeg';
  assert.equal(
    getOptimizedProductImageUrl(source, 1200, 800),
    'https://project.supabase.co/storage/v1/render/image/public/product-images/item.jpeg?width=1200&height=800&resize=cover&quality=78',
  );
  assert.equal(getOptimizedProductImageUrl('https://images.example/item.jpg'), 'https://images.example/item.jpg');
});

test('matches only the current product or legacy listing route', () => {
  assert.equal(getProductRouteId('/product/business-product-1'), 'business-product-1');
  assert.equal(getProductRouteId('/listing/item%20one'), 'item one');
  assert.equal(getProductRouteId('/'), '');
  assert.equal(getProductRouteId('/product/%E0%A4%A'), '');
});

test('maps terminal listing states to non-requestable labels', () => {
  assert.deepEqual(getListingAvailability({ status: 'Reserved' }).statusLabel, 'Reserved');
  assert.deepEqual(getListingAvailability({ status: 'Collected' }).statusLabel, 'Collected');
  assert.deepEqual(getListingAvailability({ status: 'sold_out' }).statusLabel, 'Sold out');
  assert.equal(getListingAvailability({ status: 'Available', availableQuantity: 0 }).available, false);
});
