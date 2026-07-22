-- Allow one personal and one business profile per phone number.
-- Existing rows are preserved; this only broadens the identity model.

alter table profiles
  drop constraint if exists profiles_phone_key;

alter table profiles
  add column if not exists normalized_phone text,
  add column if not exists account_type text not null default 'personal',
  add column if not exists account_key text,
  add column if not exists profile_image_url text;

update profiles
set
  normalized_phone = regexp_replace(coalesce(normalized_phone, phone, ''), '[^0-9]', '', 'g'),
  account_type = coalesce(nullif(account_type, ''), 'personal'),
  account_key = coalesce(
    nullif(account_key, ''),
    case
      when regexp_replace(coalesce(normalized_phone, phone, ''), '[^0-9]', '', 'g') <> ''
        then regexp_replace(coalesce(normalized_phone, phone, ''), '[^0-9]', '', 'g') || ':' || coalesce(nullif(account_type, ''), 'personal')
      else id::text || ':' || coalesce(nullif(account_type, ''), 'personal')
    end
  ),
  updated_at = now();

create unique index if not exists profiles_account_key_key on profiles (account_key) where account_key is not null;
create index if not exists profiles_normalized_phone_account_type_idx on profiles (normalized_phone, account_type);
