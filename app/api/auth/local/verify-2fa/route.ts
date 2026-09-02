export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, sessionCookieString } from "@/lib/session";
import { hashToken } from "@/lib/password";
import { decryptSecret, verifyTotp, matchBackupCode } from "@/lib/totp";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

const MAX_ATTEMPTS = 6;

// Second step of login: exchange a valid challenge + code for a session.
//
// The challenge is single-use and attempt-capped, so a leaked challenge token
// can't be used to brute-force the 6-digit code.
export async function POST(req: Request) {
  const ip = ipFrom(req);
  const { challenge, code }: { challenge?: string; code?: string } = await req.json();
  if (!challenge || !code)
    return NextResponse.json({ error: "Missing challenge or code" }, { status: 400 });

  const row = await prisma.totpChallenge.findUnique({ where: { tokenHash: hashToken(challenge) } });
  if (!row || row.usedAt || row.expiresAt < new Date())
    return NextResponse.json({ error: "That sign-in attempt expired — start again" }, { status: 400 });

  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.totpChallenge.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return NextResponse.json({ error: "Too many incorrect codes — start again" }, { status: 429 });
  }

  const person = await prisma.person.findUnique({ where: { id: row.personId } });
  if (!person?.totpSecret || !person.totpEnabledAt || person.deactivatedAt)
    return NextResponse.json({ error: "That sign-in attempt is no longer valid" }, { status: 400 });

  // A TOTP code, or one of the single-use backup codes.
  let ok = verifyTotp(decryptSecret(person.totpSecret), code);
  let usedBackup = false;

  if (!ok && person.totpBackupCodes.length > 0) {
    const idx = await matchBackupCode(code, person.totpBackupCodes);
    if (idx >= 0) {
      ok = true;
      usedBackup = true;
      // Consume it: a backup code works exactly once.
      const remaining = person.totpBackupCodes.filter((_, i) => i !== idx);
      await prisma.person.update({
        where: { id: person.id },
        data: { totpBackupCodes: remaining },
      });
    }
  }

  if (!ok) {
    await prisma.totpChallenge.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    await logAuthEvent({
      kind: "LOGIN_FAILED", subject: person.email, authType: "local", ip,
      detail: "incorrect second factor",
    });
    return NextResponse.json({ error: "That code isn't right" }, { status: 401 });
  }

  await prisma.totpChallenge.update({ where: { id: row.id }, data: { usedAt: new Date() } });

  if (!person.firstLoginAt) {
    await prisma.person.update({ where: { id: person.id }, data: { firstLoginAt: new Date() } });
  }

  const sessionId = await createSession({
    accountId: person.accountId!,
    name: person.name,
    email: person.email,
    avatarUrl: person.avatarUrl,
    authType: "local",
    cloudId: null,
    accessToken: null,
    refreshToken: null,
    accessExpiresAt: null,
  });

  await logAuthEvent({
    kind: "LOGIN", actorName: person.name, actorId: person.id, subject: person.email,
    authType: "local", ip,
    detail: usedBackup
      ? `backup code used, ${person.totpBackupCodes.length - 1} left`
      : "two-factor",
  });

  const res = NextResponse.json({
    ok: true,
    name: person.name,
    usedBackup,
    backupCodesRemaining: usedBackup ? person.totpBackupCodes.length - 1 : person.totpBackupCodes.length,
  });
  res.headers.append("Set-Cookie", sessionCookieString(sessionId));
  return res;
}
