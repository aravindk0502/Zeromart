-- Persist Business profile fields without replacing or deleting existing data.

alter table profiles
  add column if not exists full_name text,
  add column if not exists business_name text,
  add column if not exists business_type text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists description text,
  add column if not exists opening_hours text,
  add column if not exists store_location text,
  add column if not exists registration text,
  add column if not exists cover_image_url text,
  add column if not exists verified boolean not null default false,
  add column if not exists karma_popup_enabled boolean not null default true,
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

create index if not exists listings_seller_status_created_idx
  on listings (seller_id, status, created_at desc);
create index if not exists listings_business_status_created_idx
  on listings (business_id, status, created_at desc);
create index if not exists listings_location_idx
  on listings (city, area, created_at desc);
create index if not exists notification_events_recipient_created_idx
  on notification_events (recipient_account_id, created_at desc);