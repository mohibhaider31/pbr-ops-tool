export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken, hashPassword, validatePassword, isBreachedPassword } from "@/lib/password";
import { createSession, sessionCookieString } from "@/lib/session";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Redeem an invite and set a password. Single use, time-limited.
export async function POST(req: Request) {
  const { token, password }: { token?: string; password?: string } = await req.json();
  if (!token || !password)
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });

  const invite = await prisma.localInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite link is invalid or has expired" }, { status: 400 });
  }

  const problem = validatePassword(password, { email: invite.email, name: invite.name });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Breach-corpus check (k-anonymity: only a 5-char hash prefix is sent).
  const breach = await isBreachedPassword(password);
  if (breach.breached)
    return NextResponse.json(
      {
        error: `That password has appeared in ${breach.count?.toLocaleString() ?? "known"} data breaches — please choose a different one`,
      },
      { status: 400 }
    );

  const email = invite.email.toLowerCase();
  const passwordHash = await hashPassword(password);

  // Synthetic accountId keeps every existing accountId-based lookup working.
  const syntheticAccountId = `local:${crypto.randomBytes(12).toString("hex")}`;

  const person = await prisma.person.upsert({
    where: { email },
    create: {
      email,
      name: invite.name,
      accountId: syntheticAccountId,
      authType: "local",
      passwordHash,
      source: "manual",
      firstLoginAt: new Date(),
    },
    update: { authType: "local", passwordHash, firstLoginAt: new Date() },
  });

  await prisma.localInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

  // Optional board access, always VIEWER for local accounts.
  if (invite.boardId) {
    await prisma.boardMembership.upsert({
      where: { personId_boardId: { personId: person.id, boardId: invite.boardId } },
      create: { personId: person.id, boardId: invite.boardId, role: "VIEWER" },
      update: { role: "VIEWER" },
    });
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
    kind: "INVITE_ACCEPTED", actorName: person.name, actorId: person.id,
    subject: email, authType: "local", ip: ipFrom(req),
  });

  const res = NextResponse.json({ ok: true, name: person.name });
  res.headers.append("Set-Cookie", sessionCookieString(sessionId));
  return res;
}
