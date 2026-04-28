// Server Supabase client. Anon key, RLS-enforced, cookie-bound. Used in
// Server Components, route handlers, and Server Actions. Read user via
// getUser() (validates JWT against Supabase), never getSession() per
// app_handoff §6.4.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Setting cookies from a Server Component throws; the call site
          // (Server Action / route handler / proxy) is responsible for
          // surfaces where setting is allowed. Swallowing here is the
          // pattern recommended by @supabase/ssr.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // No-op — Server Component context, refresh happens in proxy.
          }
        },
      },
    },
  );
}
