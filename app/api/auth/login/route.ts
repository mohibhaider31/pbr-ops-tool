export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/atlassian-oauth";
import { randomBytes } from "crypto";

// Kick off OAuth. The random `state` is stored in a short-lived cookie set
// via an explicit Set-Cookie header (res.cookies.set is unreliable in Next 14
// route handlers), and echoed back by Atlassian so the callback can verify
// the response belongs to this attempt.
//
// ?link=1 marks this as an existing user attaching their Atlassian identity to
// an already-invited account, rather than a fresh sign-in. The callback keys
// off the "link:" prefix in state.
export async function GET(req: NextRequest) {
  const linking = new URL(req.url).searchParams.get("link") === "1";
  const nonce = randomBytes(16).toString("hex");
  const state = linking ? `link:${nonce}` : nonce;

  const res = NextResponse.redirect(authorizeUrl(state));
  res.headers.append(
    "Set-Cookie",
    `pbr_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  );
  return res;
}
