# Dyad — Setup & Deployment

## Prerequisites
- Node.js 20+
- Supabase account (free tier works)
- Vercel account (free tier works)

## 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
3. Seed your 2 allowed users:
   ```sql
   INSERT INTO public.allowed_users (email)
   VALUES ('user1@example.com'), ('user2@example.com');
   ```
4. Create the storage bucket:
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit)
   VALUES ('chat-media', 'chat-media', false, 104857600);
   ```
5. Copy your **Project URL** and **anon key** from Settings → API

## 2. Local Development

```bash
git clone <your-repo>
cd dyad
cp .env.example .env.local
# Fill in your Supabase values in .env.local
npm install
npm run dev
```

Visit http://localhost:3000

## 3. TURN Server (Required for calls)

For WebRTC to work behind NAT, you need a TURN server.

**Option A — Metered (easiest):**
1. Sign up at https://www.metered.ca/tools/openrelay/
2. Get free TURN credentials
3. Add to .env.local

**Option B — Twilio NTS:**
1. https://www.twilio.com/docs/stun-turn
2. Use TWILIO_ACCOUNT_SID + generate short-lived credentials per call

**Option C — Self-hosted Coturn:**
```bash
# Ubuntu
apt install coturn
# Configure /etc/turnserver.conf
```

## 4. Deploy to Vercel

```bash
npm i -g vercel
vercel
# Follow prompts, add env vars from .env.example
```

Or via Vercel dashboard:
1. Import GitHub repo
2. Add environment variables
3. Deploy

## 5. Regenerate DB Types (after schema changes)

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
```

## Security Checklist

- [ ] Seeded `allowed_users` with exactly 2 emails
- [ ] `SUPABASE_SERVICE_ROLE_KEY` NOT in `NEXT_PUBLIC_*` variables
- [ ] Storage bucket is NOT public
- [ ] RLS enabled on all tables (verify in Supabase dashboard)
- [ ] TURN server configured for production calls
- [ ] Auth email confirmations enabled in Supabase Auth settings

## Known Limitations

1. **E2EE search**: Encrypted messages can't be searched server-side. Implement MiniSearch in-memory for client-side search over decrypted messages.
2. **Multi-device key sync**: When a user adds a new device, they need to re-establish key exchange. Implement a key verification ceremony.
3. **Signal Protocol**: We use static ECDH, not Double Ratchet. Forward secrecy is per-session, not per-message.
4. **Call quality**: For production calling, consider Livekit or Daily.co as an alternative to raw WebRTC.
5. **Push notifications**: Requires a service worker + Web Push API + Supabase Edge Function. Scaffold is in place but push subscription management needs wiring.
