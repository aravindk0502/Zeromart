-- ZeroMart Database Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────
-- PROFILES (linked to Supabase Auth)
-- ─────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text unique,
  name        text not null default 'ZeroMart User',
  initials    text not null default 'ZM',
  mode        text not null default 'seller' check (mode in ('seller', 'buyer')),
  is_buyer    boolean not null default false,
  karma       integer not null default 0,
  credits     integer not null default 0,
  vouchers    integer not null default 0,
  has_seen_tour boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────
-- PRODUCTS (listings)
-- ─────────────────────────────────────
create table if not exists products (
  id              serial primary key,
  title           text not null,
  category        text not null,
  emoji           text not null default '📦',
  distance        float not null default 0,
  condition       text not null default 'Good',
  description     text,
  photo_url       text,
  nearby_eligible boolean not null default false,
  listed          text not null default 'just now',
  seller_id       uuid references profiles(id) on delete cascade,
  seller_name     text not null,
  seller_karma    integer not null default 0,
  seller_initials text not null,
  status          text not null default 'active' check (status in ('active', 'given')),
  lat             float,
  lng             float,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────
-- FAVOURITES
-- ─────────────────────────────────────
create table if not exists favourites (
  user_id    uuid references profiles(id) on delete cascade,
  product_id integer references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ─────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────
create sequence if not exists order_seq start 1;

create table if not exists orders (
  id               text primary key default ('ORD' || lpad(nextval('order_seq')::text, 6, '0')),
  buyer_id         uuid references profiles(id),
  product_id       integer references products(id),
  product_title    text not null,
  product_emoji    text not null,
  product_category text not null,
  seller_name      text not null,
  seller_initials  text not null,
  seller_karma     integer not null default 0,
  type             text not null check (type in ('delivery', 'collect')),
  status           text not null default 'pending' check (status in ('pending', 'in_transit', 'delivered')),
  status_label     text not null,
  eta              text,
  steps            jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

create sequence if not exists order_seq start 1;

-- ─────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────
create table if not exists notifications (
  id         serial primary key,
  user_id    uuid references profiles(id) on delete cascade,
  text       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────
alter table profiles     enable row level security;
alter table products     enable row level security;
alter table favourites   enable row level security;
alter table orders       enable row level security;
alter table notifications enable row level security;

-- Profiles: users can read all, edit own
create policy "public read profiles"    on profiles for select using (true);
create policy "own update profile"      on profiles for update using (auth.uid() = id);

-- Products: anyone can read active, sellers manage own
create policy "public read products"    on products for select using (status = 'active');
create policy "sellers insert products" on products for insert with check (auth.uid() = seller_id);
create policy "sellers update products" on products for update using (auth.uid() = seller_id);

-- Favourites: users manage own
create policy "own favourites"          on favourites for all using (auth.uid() = user_id);

-- Orders: buyer or involved seller can see
create policy "own orders"              on orders for select using (auth.uid() = buyer_id);
create policy "insert orders"           on orders for insert with check (auth.uid() = buyer_id);

-- Notifications: user sees own
create policy "own notifications"       on notifications for all using (auth.uid() = user_id);

-- ─────────────────────────────────────
-- DRIZN LIVE MARKETPLACE
-- One production source of truth for community and business listings.
-- ─────────────────────────────────────
create extension if not exists "pgcrypto";

alter table profiles
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists profile_location jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists listings (
  id                 text primary key default gen_random_uuid()::text,
  title              text not null,
  category           text not null default 'Other',
  condition          text not null default 'Good',
  description        text not null default '',
  image_url          text,
  seller_id          text not null,
  seller_name        text not null default 'Unknown',
  seller_type        text not null default 'community' check (seller_type in ('community', 'business')),
  business_id        text,
  store_name         text,
  karma_score        integer not null default 0,
  quantity           integer not null default 1,
  available_quantity integer not null default 1,
  reserved_quantity  integer not null default 0,
  sold_quantity      integer not null default 0,
  price              numeric(10, 2) not null default 0,
  expiry_date        date,
  expiry_time        time,
  status             text not null default 'active' check (status in ('active', 'available', 'reserved', 'sold', 'expired', 'hidden')),
  latitude           double precision,
  longitude          double precision,
  location           text,
  area               text,
  city               text,
  state              text,
  country            text not null default 'India',
  location_data      jsonb not null default '{}'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists listings_status_idx on listings (status);
create index if not exists listings_seller_type_idx on listings (seller_type);
create index if not exists listings_expiry_idx on listings (expiry_date, expiry_time);
create index if not exists listings_location_idx on listings (latitude, longitude);
create index if not exists listings_created_idx on listings (created_at desc);

create table if not exists listing_favourites (
  user_id    text not null,
  listing_id text not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists requests (
  id          text primary key default gen_random_uuid()::text,
  listing_id  text not null references listings(id) on delete cascade,
  buyer_id    text not null,
  seller_id   text not null,
  quantity    integer not null default 1,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'handed_over', 'collected', 'completed', 'cancelled')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table orders
  add column if not exists listing_id text,
  add column if not exists business_id text,
  add column if not exists collection_code text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists karma_events (
  id          text primary key default gen_random_uuid()::text,
  giver_id    text not null,
  receiver_id text not null,
  listing_id  text references listings(id) on delete set null,
  request_id  text,
  order_id    text,
  points      integer not null default 1,
  note        text,
  created_at  timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('Drizn', 'Drizn', true)
on conflict (id) do update set public = excluded.public;

alter table listings enable row level security;
alter table listing_favourites enable row level security;
alter table requests enable row level security;
alter table karma_events enable row level security;

drop policy if exists "public read live listings" on listings;
create policy "public read live listings"
  on listings for select
  using (status in ('active', 'available') and available_quantity > 0);

drop policy if exists "authenticated insert live listings" on listings;
create policy "authenticated insert live listings"
  on listings for insert
  with check (auth.uid() is not null);

drop policy if exists "seller update live listings" on listings;
create policy "seller update live listings"
  on listings for update
  using (auth.uid()::text = seller_id)
  with check (auth.uid()::text = seller_id);

drop policy if exists "own live favourites" on listing_favourites;
create policy "own live favourites"
  on listing_favourites for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "participant read requests" on requests;
create policy "participant read requests"
  on requests for select
  using (auth.uid()::text in (buyer_id, seller_id));

drop policy if exists "buyer insert requests" on requests;
create policy "buyer insert requests"
  on requests for insert
  with check (auth.uid()::text = buyer_id);

drop policy if exists "participant update requests" on requests;
create policy "participant update requests"
  on requests for update
  using (auth.uid()::text in (buyer_id, seller_id));

drop policy if exists "participant read karma" on karma_events;
create policy "participant read karma"
  on karma_events for select
  using (auth.uid()::text in (giver_id, receiver_id));

do $$
begin
  alter publication supabase_realtime add table listings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ─────────────────────────────────────
-- PRODUCTION NOTIFICATION INFRASTRUCTURE
-- ─────────────────────────────────────
create table if not exists push_tokens (
  id             bigserial primary key,
  account_id     text not null,
  token          text not null unique,
  platform       text not null default 'web',
  enabled        boolean not null default true,
  metadata       jsonb not null default '{}'::jsonb,
  last_seen_at   timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists push_tokens_account_id_idx on push_tokens (account_id);
create index if not exists push_tokens_enabled_idx on push_tokens (enabled);

create table if not exists notification_preferences (
  account_id            text primary key,
  transactional_enabled boolean not null default true,
  marketing_enabled     boolean not null default false,
  nearby_enabled        boolean not null default true,
  favourites_enabled    boolean not null default true,
  muted_account_ids     text[] not null default '{}',
  blocked_account_ids   text[] not null default '{}',
  max_nearby_per_day    integer not null default 5,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists app_notifications (
  id                   text primary key,
  recipient_account_id text not null,
  actor_account_id     text,
  event_type           text not null,
  listing_id           text,
  request_id           text,
  order_id             text,
  title                text not null,
  body                 text not null,
  payload              jsonb not null default '{}'::jsonb,
  read                 boolean not null default false,
  created_at           timestamptz not null default now()
);

create index if not exists app_notifications_recipient_idx on app_notifications (recipient_account_id, created_at desc);
create index if not exists app_notifications_event_type_idx on app_notifications (event_type, created_at desc);

create table if not exists notification_events (
  id                   text primary key,
  event_type           text not null,
  recipient_account_id text not null,
  actor_account_id     text,
  listing_id           text,
  request_id           text,
  order_id             text,
  dedupe_key           text unique,
  payload              jsonb not null default '{}'::jsonb,
  push_attempted       boolean not null default false,
  push_sent            boolean not null default false,
  push_error           text,
  created_at           timestamptz not null default now()
);

create index if not exists notification_events_recipient_idx on notification_events (recipient_account_id, created_at desc);
create index if not exists notification_events_type_idx on notification_events (event_type, created_at desc);
