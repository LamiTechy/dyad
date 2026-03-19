# Dyad — Private 2-Person Messenger

A production-ready, end-to-end encrypted, real-time messaging application for exactly two users.
Built with Next.js 14 App Router, Supabase, WebRTC, and a serious E2EE layer.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth Layer  │  │  Chat Layer  │  │    Call Layer (WRtc) │  │
│  │  (Supabase)  │  │  (Realtime)  │  │  (WebRTC + Signaling)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────▼─────────────────▼──────────────────────▼──────────┐  │
│  │                   E2EE Crypto Layer                       │  │
│  │  (SubtleCrypto API — ECDH key exchange + AES-GCM encrypt) │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │              Supabase JS Client (anon key only)           │  │
│  └──────────────────────────┬────────────────────────────────┘  │
└────────────────────────────-│───────────────────────────────────┘
                              │ HTTPS / WSS
┌─────────────────────────────▼───────────────────────────────────┐
│                      SUPABASE PLATFORM                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth        │  │  Postgres    │  │  Storage             │  │
│  │  (Magic Link │  │  (RLS every- │  │  (Private buckets    │  │
│  │   / Password)│  │   where)     │  │   signed URLs)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐ │
│  │  Realtime    │  │  Edge Functions                          │ │
│  │  (broadcast  │  │  (link-preview, push-notif, signaling)   │ │
│  │   + presence)│  │                                          │ │
│  └──────────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Feature → Service Mapping

| Feature | Mechanism |
|---|---|
| Auth / access control | Supabase Auth + `allowed_users` table + RLS |
| Text messaging | Supabase Postgres + Realtime DB changes |
| Typing indicators | Supabase Realtime Broadcast |
| Online presence / last seen | Supabase Realtime Presence |
| Message status (sent/delivered/seen) | `message_receipts` table + Realtime |
| Media uploads | Supabase Storage (private bucket) + signed URLs |
| Voice/video calls | WebRTC (RTCPeerConnection) + Supabase Realtime Broadcast for signaling |
| Link previews | Supabase Edge Function (server-side fetch) |
| E2EE | SubtleCrypto (ECDH + AES-GCM) in browser |
| Push notifications | Supabase Edge Function + Web Push API |
| Disappearing messages | Postgres `expires_at` + scheduled cleanup via Edge Function cron |
| Search | Postgres full-text search (tsvector) |
| Export chat | Edge Function → streaming CSV/JSON |

## Security Model

- **Zero trust server**: Server stores only encrypted ciphertext. Key material never leaves the client.
- **RLS everywhere**: Every table has RLS enabled. Policies use `auth.uid()` checks against `allowed_users`.
- **No service role on client**: `SUPABASE_SERVICE_ROLE_KEY` used only in Edge Functions.
- **Signed URLs**: All media accessed via short-lived signed URLs, never public.
- **Anon key restrictions**: The anon key cannot read any meaningful data without an authenticated session.

## Setup Instructions

See [docs/SETUP.md](./docs/SETUP.md) for full local dev and production deployment instructions.
