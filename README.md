# Drizn — Phase 1 Pilot App

**Good Things. Nearby.**

## What's included

- Full mobile-first React app (480px max-width — mobile optimised)
- Home page with search, geolocation, category filters, product grid
- Top karma sellers section
- Favourite sellers row
- Product detail sheet with in-person collect option (< 1 km)
- Seller hub with karma score, delivery credits, vouchers, milestones
- Compulsory karma popup after every transaction
- Temporary chat for in-person collection (auto-deletes after handoff)
- Drizn AI — platform assistant (no hallucination, only platform answers)
- Listing sheet — photo + description, posts instantly
- Buyer access unlock — ₹29 one-time payment gate
- Notifications page
- Profile with mode switcher (seller ↔ buyer)

## Run locally

```bash
cd zeromart
npm install
npm run dev
```

Open http://localhost:5173 in your browser, or use the port printed by Vite.

## Deployment

### Frontend on Vercel

1. Import `aravindk0502/Zeromart`.
2. Vercel reads `vercel.json`, runs `npm run build`, and publishes `dist`.
3. Add `VITE_API_URL` and `VITE_GOOGLE_MAPS_API_KEY` from `.env.example`.
4. Add the final Vercel domain to the Google Maps key HTTP-referrer restrictions.

### Backend / Storage environment variables (Vercel)

Add the following environment variables to your Vercel project (Settings → Environment Variables) for the backend and image storage to work correctly:

- `DATABASE_URL` — your Postgres connection string (required for server persistence)
- `JWT_SECRET` — secret for signing user JWTs (defaults to a dev value when missing)
- `CORS_ORIGIN` — allowed origin(s) for CORS (comma-separated), e.g. `https://your-site.vercel.app`
- `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` — optional SMS OTP provider keys (omit for demo mode)
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — optional Razorpay keys for payments
- `SUPABASE_URL` — Supabase project URL (for Storage)
- `SUPABASE_SERVICE_ROLE` or `SUPABASE_KEY` — Supabase service role key (required to upload files server-side)
- `SUPABASE_STORAGE_BUCKET` — (optional) bucket name; defaults to `product-images`

We provide a small helper script to create the Supabase storage bucket locally using the `supabase` CLI: `scripts/create_supabase_bucket.sh`

Example: set env vars in Vercel and redeploy. After deployment, verify:

```bash
curl https://<your-site>/api/persistence
curl https://<your-site>/api/products
```

Production data hygiene
-----------------------

To remove only obvious demo/test listings from Supabase, review and run:

- `scripts/cleanup_test_rows.sql`

The script is intentionally strict (`chennai-*`, `demo-*`, `demo_*`, `business-product-demo-*`) and starts with a preview query before delete.

Supabase storage policies
------------------------

If you prefer to manage upload permissions via Supabase policies, see `supabase_policy.sql` for recommended snippets. Summary:

- Recommended: prefer server-side uploads using the service-role key (`SUPABASE_SERVICE_ROLE`) and keep the bucket private — this prevents clients from writing directly.
- Alternative: if you allow client-side uploads, add `Allow authenticated inserts` and `Allow owners to delete their objects` policies (see `supabase_policy.sql`).

File: [`supabase_policy.sql`](supabase_policy.sql)



### Backend on Railway

1. Create a Railway service from the same repository.
2. Add a PostgreSQL service so Railway provides `DATABASE_URL`.
3. Add the Railway variables documented in `.env.example`.
4. Set `CORS_ORIGIN` to the final Vercel URL.
5. Railway reads `railway.json`, starts `npm start`, and checks `/api/health`.

Never add `.env` to Git. Use `.env.example` only as the variable-name template.

## Stack

- React 18
- Lucide React (icons)
- Google Fonts — Inter + Sora
- Pure CSS (no Tailwind — full custom design system)
- No backend — all state is local (ready for API integration)

## Next steps for production

1. Replace mock data with real API (Node.js + PostgreSQL recommended)
2. Integrate Razorpay for ₹29 buyer payment
3. Integrate Shadowfax/Porter API for delivery
4. Add Firebase Auth for phone number OTP login
5. Deploy on Vercel or Railway
6. Add push notifications (Firebase Cloud Messaging)

## Folder structure

```
src/
  context/     — AppContext (global state)
  pages/       — HomePage, SellerPage, ProfilePage, NotificationsPage
  components/  — ProductSheet, KarmaPopup, TempChat, BotAssistant,
                 ListingSheet, BuyerPaySheet, CollectRequestHandler
  index.css    — Full design system
  App.jsx      — Shell + nav
  index.js     — Entry point
```
