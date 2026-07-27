export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { attachSessionCookie, type Session } from "@/lib/session";

export async function GET() {
  const fake: Session = {
    accountId: "test", name: "Test User", email: "test@example.com", avatarUrl: null,
    cloudId: "test-cloud", accessToken: "a".repeat(50), refreshToken: "r".repeat(50),
    accessExpiresAt: Date.now() + 3600_000,
  };
  // Attach to the SAME response we return.
  const res = NextResponse.json({ ok: true });
  await attachSessionCookie(res, fake);
  return res;
}
