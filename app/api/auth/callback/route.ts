export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchMe, fetchCloudId } from "@/lib/atlassian-oauth";
import { prisma } from "@/lib/prisma";
import { createSession, getSession, sessionCookieString } from "@/lib/session";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  // Set when an already-signed-in user is LINKING Atlassian to their existing
  // invited account, rather than signing in fresh.
  const isLinking = url.searchParams.get("state")?.startsWith("link:") ?? false;
  const origin = url.origin;

  if (error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("atlassian_" + error)}`);
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCode(code);
    const [me, cloudId] = await Promise.all([fetchMe(accessToken), fetchCloudId(accessToken)]);
    const emailLower = me.email?.toLowerCase() ?? null;

    // ---- LINKING an Atlassian identity onto the signed-in account ----
    if (isLinking) {
      const current = await getSession();
      if (!current) return NextResponse.redirect(`${origin}/login?error=link_no_session`);

      // Refuse if this Atlassian identity is already attached to someone else.
      const alreadyLinked = await prisma.person.findUnique({ where: { accountId: me.accountId } });
      const currentPerson = await prisma.person.findUnique({ where: { accountId: current.accountId } });
      if (alreadyLinked && currentPerson && alreadyLinked.id !== currentPerson.id) {
        return NextResponse.redirect(`${origin}/settings?error=atlassian_already_linked`);
      }
      if (!currentPerson) return NextResponse.redirect(`${origin}/login?error=link_no_person`);

      await prisma.person.update({
        where: { id: currentPerson.id },
        data: {
          accountId: me.accountId, // replaces the synthetic "local:..." id
          authType: "atlassian",
          avatarUrl: me.avatarUrl ?? currentPerson.avatarUrl,
          email: currentPerson.email ?? emailLower,
        },
      });

      // Issue a fresh Atlassian-backed session so Jira writes work immediately.
      const id = await createSession({
        accountId: me.accountId,
        name: currentPerson.name,
        email: currentPerson.email ?? emailLower,
        avatarUrl: me.avatarUrl ?? currentPerson.avatarUrl,
        authType: "atlassian",
        cloudId,
        accessToken,
        refreshToken,
        accessExpiresAt: Date.now() + expiresIn * 1000,
      });
      await logAuthEvent({
        kind: "ATLASSIAN_LINKED", actorName: currentPerson.name, actorId: me.accountId,
        subject: currentPerson.email, authType: "atlassian", ip: ipFrom(req),
      });

      const res = NextResponse.redirect(`${origin}/settings?linked=1`);
      res.headers.append("Set-Cookie", sessionCookieString(id));
      res.headers.append("Set-Cookie", "pbr_oauth_state=; Path=/; Max-Age=0");
      return res;
    }

    // ---- SIGNING IN: invite-only ----
    //
    // The tool is invite-only, so a valid Atlassian login is not by itself
    // enough. We admit the person only if they were already provisioned (by
    // accountId or by the email an admin invited), or if they are the
    // configured bootstrap admin. Anyone else is told to ask for an invite.
    const known =
      (await prisma.person.findUnique({ where: { accountId: me.accountId } })) ??
      (emailLower ? await prisma.person.findUnique({ where: { email: emailLower } }) : null);

    const isBootstrapAdmin =
      !!process.env.SEED_ADMIN_ACCOUNT_ID && me.accountId === process.env.SEED_ADMIN_ACCOUNT_ID;

    if (!known && !isBootstrapAdmin) {
      await logAuthEvent({
        kind: "LOGIN_FAILED", subject: emailLower ?? me.accountId,
        authType: "atlassian", ip: ipFrom(req), detail: "not invited",
      });
      return NextResponse.redirect(`${origin}/login?error=not_invited`);
    }

    // Deactivated accounts keep their history but lose access, whichever way
    // they sign in.
    if (known?.deactivatedAt) {
      await logAuthEvent({
        kind: "LOGIN_FAILED", subject: known.email, authType: "atlassian",
        ip: ipFrom(req), detail: "account deactivated",
      });
      return NextResponse.redirect(`${origin}/login?error=deactivated`);
    }

    // Attach the Atlassian id to a person who was invited by email only.
    if (known && !known.accountId) {
      await prisma.person.update({
        where: { id: known.id },
        data: { accountId: me.accountId, authType: "atlassian", avatarUrl: me.avatarUrl },
      });
    }

    const id = await createSession({
      accountId: me.accountId,
      name: known?.name || me.name,
      email: known?.email ?? emailLower,
      avatarUrl: me.avatarUrl,
      authType: "atlassian",
      cloudId,
      accessToken,
      refreshToken,
      accessExpiresAt: Date.now() + expiresIn * 1000,
    });

    await logAuthEvent({
      kind: "LOGIN", actorName: known?.name || me.name, actorId: me.accountId,
      subject: known?.email ?? emailLower, authType: "atlassian", ip: ipFrom(req),
    });

    const res = NextResponse.redirect(`${origin}/`);
    res.headers.append("Set-Cookie", sessionCookieString(id));
    res.headers.append("Set-Cookie", "pbr_oauth_state=; Path=/; Max-Age=0");
    return res;
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e.message)}`);
  }
}
