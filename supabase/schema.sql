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
