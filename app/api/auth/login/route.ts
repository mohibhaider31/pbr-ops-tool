export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/atlassian-oauth";
import { randomBytes } from "crypto";

// Kick off OAuth. The random `state` is stored in a short-lived cookie set
// via an explicit Set-Cookie header (res.cookies.set is unreliable in Next 14
// route handlers), and echoed back by Atlassian so the callback can verify
// the response belongs to this attempt.
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.headers.append(
    "Set-Cookie",
    `pbr_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  );
  return res;
}
