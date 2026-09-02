export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, sessionCookieString } from "@/lib/session";
import { verifyPassword, isLockedOut, recordAttempt, clearFailures } from "@/lib/password";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";
import { generateInviteToken } from "@/lib/password";

// A real bcrypt hash (cost 12) of a random string, used only to equalise
// response timing when the account doesn't exist.
const DUMMY_HASH = "$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// Email + password login for local (stakeholder) accounts.
//
// These sessions carry NO Atlassian credentials, so the account is read-only by
// construction — it cannot act in the org's Jira. Atlassian users continue to
// use the OAuth flow.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { email, password }: { email?: string; password?: string } = await req.json();

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();

  if (await isLockedOut(normalized)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  const person = await prisma.person.findUnique({ where: { email: normalized } });

  // Uniform failure message AND uniform timing. Returning early here would
  // skip bcrypt entirely, so a non-existent address would answer measurably
  // faster than a wrong password - a user-enumeration side channel. Burn an
  // equivalent hash comparison against a dummy before failing.
  if (!person || person.authType !== "local" || !person.passwordHash) {
    await verifyPassword(password, DUMMY_HASH);
    await recordAttempt(normalized, false, ip);
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(password, person.passwordHash);
  if (!ok) {
    await recordAttempt(normalized, false, ip);
    await logAuthEvent({ kind: "LOGIN_FAILED", subject: normalized, authType: "local", ip });
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  // Deactivated accounts keep their history but lose access.
  if (person.deactivatedAt) {
    await logAuthEvent({
      kind: "LOGIN_FAILED", subject: normalized, authType: "local", ip, detail: "account deactivated",
    });
    return NextResponse.json({ error: "This account has been deactivated" }, { status: 403 });
  }

  await Promise.all([recordAttempt(normalized, true, ip), clearFailures(normalized)]);

  // Password is correct — but if a second factor is enabled we must NOT create
  // a session yet. Issue a short-lived, single-use challenge instead.
  if (person.totpEnabledAt && person.totpSecret) {
    const { raw, hash } = generateInviteToken();
    await prisma.totpChallenge.create({
      data: { personId: person.id, tokenHash: hash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    return NextResponse.json({
      requires2fa: true,
      challenge: raw,
      backupCodesRemaining: person.totpBackupCodes.length,
    });
  }

  if (!person.firstLoginAt) {
    await prisma.person.update({ where: { id: person.id }, data: { firstLoginAt: new Date() } });
  }

  const sessionId = await createSession({
    accountId: person.accountId!, // synthetic "local:<id>", set at provisioning
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
    kind: "LOGIN", actorName: person.name, actorId: person.id,
    subject: normalized, authType: "local", ip,
  });

  const res = NextResponse.json({ ok: true, name: person.name });
  res.headers.append("Set-Cookie", sessionCookieString(sessionId));
  return res;
}
