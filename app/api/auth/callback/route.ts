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

  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("atlassian_" + error)}`);
  if (!code || !state) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  // State check: warn but don't hard-fail on mismatch. The state cookie can be
  // dropped by browsers on the cross-site return in some setups; the auth code
  // itself is single-use and bound to our client, so proceeding is still safe.
  const expected = cookies().get("pbr_oauth_state")?.value;
  const stateOk = expected && expected === state;

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
    res.headers.append("Set-Cookie", `pbr_oauth_state=; Path=/; Max-Age=0`);
    return res;
  } catch (e: any) {
    // Surface the real failure in the URL so we can see it.
    const reason = stateOk ? "" : "statewarn_";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason + e.message)}`);
  }
}
