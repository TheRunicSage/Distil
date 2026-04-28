// TODO: session refresh + route gating per app_handoff §6.4.
// Refresh Supabase session via supabase.auth.getUser(); redirect unauth users
// from /dashboard|/application|/upload|/history|/settings to /login; redirect
// authed users away from /login. Matcher excludes static assets.
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
