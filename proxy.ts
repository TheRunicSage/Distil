// Next.js 16 proxy (was middleware.ts in Next 14/15). Refreshes the
// Supabase session on every request and redirects unauth users from
// protected paths to /login, authed users away from /login. Matcher
// excludes static assets and image optimisation routes.

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
