export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Turning 2FA off requires the account password — otherwise anyone with a
// borrowed session could quietly remove the second factor.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { password }: { password?: string } = await req.json();
  if (!password) return NextResponse.json({ error: "Confirm your password" }, { status: 400 });

  const person = await prisma.person.findUnique({ where: { accountId: session.accountId } });
  if (!person?.passwordHash) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!(await verifyPassword(password, person.passwordHash)))
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });

  await prisma.person.update({
    where: { id: person.id },
    data: { totpSecret: null, totpEnabledAt: null, totpBackupCodes: [] },
  });

  await logAuthEvent({
    kind: "LOGIN", actorName: person.name, actorId: person.id, subject: person.email,
    authType: "local", ip: ipFrom(req), detail: "two-factor disabled",
  });

  return NextResponse.json({ ok: true });
}
