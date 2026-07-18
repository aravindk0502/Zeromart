-- Safe cleanup for obvious test/demo data only.
-- Review candidates first, then run DELETEs inside a transaction.

begin;

-- 1) Preview candidate listing rows (no deletion yet)
select id, title, seller_id, created_at
from public.listings
where id::text like 'chennai-%'
   or id::text like 'demo-%'
   or id::text like 'demo_%'
   or id::text like 'business-product-demo-%'
   or seller_id::text like 'demo-%'
   or seller_id::text like 'demo_%';

-- 2) Delete only those exact demo/test rows.
delete from public.listings
where id::text like 'chennai-%'
   or id::text like 'demo-%'
   or id::text like 'demo_%'
   or id::text like 'business-product-demo-%'
   or seller_id::text like 'demo-%'
   or seller_id::text like 'demo_%';

-- Optional: remove matching profile rows only when they are clearly demo ids.
-- Keep this separate so no real profile is deleted by mistake.
-- delete from public.profiles
-- where id::text like 'demo-%'
--    or id::text like 'demo_%';

-- If the preview looked correct:
-- commit;
-- Otherwise:
-- rollback;
