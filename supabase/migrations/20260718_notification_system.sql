-- Notification system migration (Supabase SQL Editor compatible)
-- Applies canonical notification tables used by Drizn production APIs.

create extension if not exists "pgcrypto";

create table if not exists notification_devices (
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

create index if not exists notification_devices_account_id_idx on notification_devices (account_id);
create index if not exists notification_devices_enabled_idx on notification_devices (enabled);

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

create table if not exists notification_events (
  id                   text primary key default gen_random_uuid()::text,
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
create index if not exists notification_events_event_type_idx on notification_events (event_type, created_at desc);

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

create table if not exists pending_karma_actions (
  id                  text primary key default gen_random_uuid()::text,
  request_id          text,
  order_id            text,
  listing_id          text,
  buyer_account_id    text,
  seller_account_id   text,
  business_account_id text,
  status              text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create unique index if not exists pending_karma_actions_request_unique on pending_karma_actions (request_id) where request_id is not null;
create unique index if not exists pending_karma_actions_order_unique on pending_karma_actions (order_id) where order_id is not null;
create index if not exists pending_karma_actions_buyer_idx on pending_karma_actions (buyer_account_id, status);
