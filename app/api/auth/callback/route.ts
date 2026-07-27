export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
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
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Read the state cookie directly off the request (reliable) rather than via
  // the cookies() helper.
  const cookieState = req.cookies.get("pbr_oauth_state")?.value;

  // CSRF check: state from Atlassian must match the cookie we set at login.
  // If the cookie is missing entirely (e.g. blocked/stripped), we surface a
  // specific error so it's diagnosable rather than a silent loop.
  if (!cookieState) {
    return NextResponse.redirect(`${origin}/login?error=no_state_cookie`);
  }
  if (!state || state !== cookieState) {
    return NextResponse.redirect(`${origin}/login?error=state_mismatch`);
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

    const res = NextResponse.redirect(`${origin}/`);
    await attachSessionCookie(res, session);
    // clear the one-time state cookie
    res.headers.append(
      "Set-Cookie",
      "pbr_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );
    return res;
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e.message)}`);
  }
}
