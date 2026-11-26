# ScrapEase

**Tagline:** Turn your scrap into value. Schedule a pickup in 60 seconds.

ScrapEase is a full-stack circular-economy logistics and scrap pickup scheduling platform built for Indian cities (default city: **Bengaluru**, currency: **INR (₹)**, units: **kg**). It connects **Households**, **Verified Scrap Collectors**, **Authorized Recyclers**, and **Operations Admins** in one relational SQLite + Express + React application.

## Authentication & Portals

- **Household Portal (`/login/household`)**: Supports **Sign in with Google** as well as email/password registration via `/register`.
- **Collector Partner Portal (`/login/collector`)**: Role-locked login for KYC-verified scrap collectors.
- **Recycler Business Portal (`/login/recycler`)**: Role-locked login for GST-verified recycling facilities.
- **Admin Portal (`/admin`)**: Restricted to administrators only. Configure `ADMIN_PASSCODE` in `.env` (or complete the first-run setup form at `/admin`). Non-admin roles are blocked from `/admin`.

## Environment Variables

Copy `.env.example` to `.env` before running locally in a fresh clone:

- `ADMIN_PASSCODE` — Private passcode for the `/admin` portal
- `JWT_SECRET` — Signing secret for session tokens (optional; auto-generated per boot if unset)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Optional Supabase sync credentials (run `supabase/schema.sql` in your Supabase SQL Editor)

## Core Architecture & Scheduling Rules (IST)

- **Operating Days & Hours:** Monday–Saturday (Sundays & admin-configured holidays closed), 8:00 AM – 8:00 PM IST.
- **Time Slots:** Six 2-hour windows (`08-10`, `10-12`, `12-14`, `14-16`, `16-18`, `18-20`), each enforcing area/pincode capacity limits (default 10 pickups/slot).
- **Lead-Time Rules:** Same-day booking requires at least **3 hours** advance notice prior to slot start; advance booking up to **14 days**.
- **Modifications:** Free reschedule or cancellation up to **2 hours** before slot start; modifications inside 2 hours display a warning and flag `late_flag = 1`.
- **Auto-Assignment & Fallback:** Automatically assigns the nearest online, KYC-approved collector serving the booking pincode; escalates unassigned/unaccepted requests after 15 minutes to the Admin Manual Assignment Queue.
- **Reminders & Receipts:** Automated 24-hour and 1-hour IST reminder sweeps, Cash/UPI payout recording, and downloadable GST-style PDF receipts via `jsPDF`.

## Local Development

```bash
npm install
npm run dev
```

For production build and start:

```bash
npm run build
npm run start
```
