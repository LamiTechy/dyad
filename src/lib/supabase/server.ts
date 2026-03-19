// =============================================================================
// lib/supabase/server.ts — Server-side Supabase client (for Server Components / Route Handlers)
// Uses cookies for session management via @supabase/ssr
// =============================================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function getSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component context — cookies can't be set. Middleware handles refresh.
          }
        },
      },
    }
  )
}

// Service-role client — ONLY for Edge Functions and server-side admin operations
// NEVER import this in client components
export function getSupabaseServiceClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Service role client must not be used in browser context')
  }
  // Dynamic import to ensure tree-shaking removes from client bundle
  const { createClient } = require('@supabase/supabase-js')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // NEVER expose to client
    { auth: { persistSession: false } }
  )
}
