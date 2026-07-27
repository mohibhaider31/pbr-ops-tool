export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchMe, fetchCloudId } from "@/lib/atlassian-oauth";
import { setSessionCookie, type Session } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Verify state matches what we set at login.
  const expected = cookies().get("pbr_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(`${origin}/login?error=bad_state`);
  }
  cookies().set("pbr_oauth_state", "", { path: "/", maxAge: 0 });

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCode(code);
    const [me, cloudId] = await Promise.all([fetchMe(accessToken), fetchCloudId(accessToken)]);

    const session: Session = {
      accountId: me.accountId,
      name: me.name,
      email: me.email,
      avatarUrl: me.avatarUrl,
      cloudId,
      accessToken,
      refreshToken,
      accessExpiresAt: Date.now() + expiresIn * 1000,
    };
    await setSessionCookie(session);
    return NextResponse.redirect(`${origin}/`);
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e.message)}`);
  }
}
