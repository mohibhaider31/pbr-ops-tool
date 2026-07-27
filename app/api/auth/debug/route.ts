export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { attachSessionCookie, type Session } from "@/lib/session";

// TEMP diagnostic: builds a fake session, attaches the cookie to a redirect,
// and reports the cookie length. Lets us confirm the Set-Cookie actually
// emits and isn't oversized. Remove after debugging.
export async function GET() {
  const fake: Session = {
    accountId: "test",
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    cloudId: "test-cloud",
    accessToken: "a".repeat(50),
    refreshToken: "r".repeat(50),
    accessExpiresAt: Date.now() + 3600_000,
  };
  const res = NextResponse.json({ ok: true });
  await attachSessionCookie(res, fake);
  const setCookie = res.headers.get("set-cookie") || "";
  return NextResponse.json({
    cookieEmitted: setCookie.length > 0,
    cookieLength: setCookie.length,
    preview: setCookie.slice(0, 80),
  });
}
