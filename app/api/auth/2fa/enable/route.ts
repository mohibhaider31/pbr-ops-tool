export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { decryptSecret, verifyTotp, generateBackupCodes, hashBackupCodes } from "@/lib/totp";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Finish enrolment: only turn 2FA on once a valid code proves the authenticator
// is set up correctly. Returns backup codes ONCE — only hashes are kept.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code }: { code?: string } = await req.json();
  if (!code) return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });

  const person = await prisma.person.findUnique({ where: { accountId: session.accountId } });
  if (!person?.totpSecret)
    return NextResponse.json({ error: "Start setup again" }, { status: 400 });
  if (person.totpEnabledAt)
    return NextResponse.json({ error: "Already enabled" }, { status: 409 });

  if (!verifyTotp(decryptSecret(person.totpSecret), code))
    return NextResponse.json({ error: "That code isn't right — check your app and try again" }, { status: 400 });

  const backupCodes = generateBackupCodes();
  await prisma.person.update({
    where: { id: person.id },
    data: { totpEnabledAt: new Date(), totpBackupCodes: await hashBackupCodes(backupCodes) },
  });

  await logAuthEvent({
    kind: "LOGIN", actorName: person.name, actorId: person.id, subject: person.email,
    authType: "local", ip: ipFrom(req), detail: "two-factor enabled",
  });

  return NextResponse.json({ ok: true, backupCodes });
}
