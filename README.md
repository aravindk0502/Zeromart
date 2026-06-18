# ZeroMart — Phase 1 Pilot App

**Give what you don't need. Earn what you can use.**

## What's included

- Full mobile-first React app (480px max-width — mobile optimised)
- Home page with search, geolocation, category filters, product grid
- Top karma sellers section
- Favourite sellers row
- Product detail sheet with in-person collect option (< 1 km)
- Seller hub with karma score, delivery credits, vouchers, milestones
- Compulsory karma popup after every transaction
- Temporary chat for in-person collection (auto-deletes after handoff)
- ZeroBot — platform assistant (no hallucination, only platform answers)
- Listing sheet — photo + description, posts instantly
- Buyer access unlock — ₹29 one-time payment gate
- Notifications page
- Profile with mode switcher (seller ↔ buyer)

## Run locally

```bash
cd zeromart
npm install
npm start
```

Open http://localhost:3000 in your browser.

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
