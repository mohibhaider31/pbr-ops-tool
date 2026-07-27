export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchMe, fetchCloudId } from "@/lib/atlassian-oauth";
import { createSession, sessionCookieString } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("atlassian_" + error)}`);
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCode(code);
    const [me, cloudId] = await Promise.all([fetchMe(accessToken), fetchCloudId(accessToken)]);

    const id = await createSession({
      accountId: me.accountId,
      name: me.name,
      email: me.email,
      avatarUrl: me.avatarUrl,
      cloudId,
      accessToken,
      refreshToken,
      accessExpiresAt: Date.now() + expiresIn * 1000,
    });

    const res = NextResponse.redirect(`${origin}/`);
    res.headers.append("Set-Cookie", sessionCookieString(id));
    res.headers.append("Set-Cookie", "pbr_oauth_state=; Path=/; Max-Age=0");
    return res;
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e.message)}`);
  }
}
