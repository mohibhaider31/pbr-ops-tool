export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchMe, fetchCloudId } from "@/lib/atlassian-oauth";
import { attachSessionCookie, type Session } from "@/lib/session";

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

  const expected = cookies().get("pbr_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(`${origin}/login?error=bad_state`);
  }

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

    // Set the session cookie ON the redirect response (not via cookies()),
    // so it reliably attaches. Also clear the one-time state cookie here.
    const res = NextResponse.redirect(`${origin}/`);
    await attachSessionCookie(res, session);
    res.cookies.set("pbr_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e.message)}`);
  }
}
