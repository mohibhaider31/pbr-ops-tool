import { NextRequest, NextResponse } from "next/server";

// Route gate. Anything not explicitly public requires a session cookie.
// We only check for cookie presence here (middleware runs on the edge and
// can't easily decrypt); full validation happens in the route/page via
// getSession(). An invalid cookie falls through to getSession() returning
// null, which the pages handle.
const PUBLIC_PATHS = [
  "/login",
  "/privacy",
  "/terms",
  "/poker-guest",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/poker/guest/join",
  // Scheduled outbox worker - authenticates with CRON_SECRET in the route.
  "/api/outbox/run",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and Next internals/assets.
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has("pbr_session");
  const hasGuest = req.cookies.has("pbr_guest");

  // Guests (guest cookie, no full session) may reach only the poker session
  // read + vote endpoints. Everything else still requires a real session.
  // The routes themselves enforce that a guest can only read/vote (never run
  // organizer actions), so this just lets the request through to that logic.
  if (!hasSession && hasGuest && pathname.startsWith("/api/poker/")) {
    // Guests may cast ANY of the three participant votes: estimation, the
    // post-accept refinement poll, and INVEST scoring. The previous regex
    // matched only "/vote", so guests were 401'd out of refinement-vote and
    // invest-vote despite the feature being built for equal participation.
    const isVote = /^\/api\/poker\/[^/]+\/item\/[^/]+\/(vote|refinement-vote|invest-vote)$/.test(pathname);
    const isRead = /^\/api\/poker\/[^/]+$/.test(pathname);
    if (isVote || isRead) return NextResponse.next();
  }

  if (!hasSession) {
    // For API calls, return 401 rather than redirecting (cleaner for fetch).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
