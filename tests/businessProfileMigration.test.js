import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const identityMigration = new URL('../supabase/migrations/20260722_profile_account_identity.sql', import.meta.url);
const profileMigration = new URL('../supabase/migrations/20260723_business_profile_persistence.sql', import.meta.url);

test('profile identity remains unique by normalized phone and account type', async () => {
  const sql = await readFile(identityMigration, 'utf8');
  assert.match(sql, /normalized_phone, account_type/);
  assert.match(sql, /unique index if not exists profiles_account_key_key/i);
  assert.doesNotMatch(sql, /drop table/i);
});

test('business profile migration is non-destructive and persists requested settings', async () => {
  const sql = await readFile(profileMigration, 'utf8');
  for (const column of ['business_name', 'business_type', 'opening_hours', 'cover_image_url', 'karma_popup_enabled', 'notification_preferences']) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  }
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});
