import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )
}
