-- Production dedupe hardening for request lifecycle and karma submission
-- Safe to run multiple times.

create unique index if not exists karma_events_request_receiver_unique
  on karma_events (request_id, receiver_id)
  where request_id is not null;

create unique index if not exists app_notifications_request_event_recipient_unique
  on app_notifications (recipient_account_id, event_type, request_id)
  where request_id is not null
    and event_type in ('new_request', 'request_accepted', 'request_declined', 'karma_required', 'karma_received');

create unique index if not exists app_notifications_order_event_recipient_unique
  on app_notifications (recipient_account_id, event_type, order_id)
  where order_id is not null
    and event_type in ('store_reservation_received', 'reservation_confirmed', 'businessOrderUpdate', 'businessOrderReceived');
