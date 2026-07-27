export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl } from "@/lib/atlassian-oauth";
import { randomBytes } from "crypto";

// Kick off the OAuth flow. A random `state` is stored in a short-lived cookie
// and echoed back by Atlassian, so the callback can verify the response
// belongs to this login attempt (CSRF protection).
export async function GET() {
  const state = randomBytes(16).toString("hex");
  cookies().set("pbr_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
