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
  // Local (stakeholder) auth: the invite token in the URL is the authorisation.
  "/accept-invite",
  "/api/auth/local/login",
  "/api/auth/local/accept-invite",
  "/reset-password",
  "/api/auth/local/reset-request",
  "/api/auth/local/reset-confirm",
  // Scheduled outbox worker - authenticates with CRON_SECRET in the route.
  "/api/outbox/run",
];

// State-changing requests must originate from this app.
//
// SameSite=Lax already blocks cookies on cross-site POSTs, which covers the
// realistic CSRF cases — this is defence in depth, and cheaper than plumbing
// per-form tokens. Server-to-server callers (the cron worker) send no Origin,
// so they're allowed through here and authenticate with CRON_SECRET instead.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ORIGIN_EXEMPT = ["/api/outbox/run"];

function originAllowed(req: NextRequest): boolean {
  if (!MUTATING.has(req.method)) return true;
  if (ORIGIN_EXEMPT.some((p) => req.nextUrl.pathname.startsWith(p))) return true;

  const origin = req.headers.get("origin");
  // Browsers always send Origin on cross-origin mutating requests. A missing
  // Origin here means a same-origin form post or a non-browser client; we fall
  // back to Referer when present.
  if (origin) return origin === req.nextUrl.origin;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === req.nextUrl.origin;
    } catch {
      return false;
    }
  }
  return true;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!originAllowed(req)) {
    return NextResponse.json({ error: "cross-origin request blocked" }, { status: 403 });
  }

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
