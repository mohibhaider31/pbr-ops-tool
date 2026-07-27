export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/atlassian-oauth";
import { randomBytes } from "crypto";

// Kick off the OAuth flow. A random `state` is stored in a short-lived cookie
// (set via a raw Set-Cookie header, which is reliable in Next 14 route
// handlers) and echoed back by Atlassian so the callback can verify the
// response belongs to this login attempt (CSRF protection).
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.headers.append(
    "Set-Cookie",
    [
      `pbr_oauth_state=${state}`,
      "Path=/",
      "Max-Age=600",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; ")
  );
  return res;
}
