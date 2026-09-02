export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken, hashPassword, validatePassword } from "@/lib/password";

// Redeem a reset token and set a new password. Also invalidates every existing
// session for that person, so a reset kicks out anyone holding an old cookie.
export async function POST(req: Request) {
  const { token, password }: { token?: string; password?: string } = await req.json();
  if (!token || !password)
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });

  const problem = validatePassword(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    return NextResponse.json({ error: "This reset link is invalid or has expired" }, { status: 400 });

  const person = await prisma.person.findUnique({ where: { id: reset.personId } });
  if (!person || person.authType !== "local")
    return NextResponse.json({ error: "This reset link is invalid" }, { status: 400 });

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.person.update({ where: { id: person.id }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Revoke all sessions: a password change should end existing ones.
    prisma.authSession.deleteMany({ where: { accountId: person.accountId ?? "" } }),
    // Clear the failure window so they aren't locked out right after resetting.
    prisma.loginAttempt.deleteMany({ where: { email: person.email ?? "", success: false } }),
  ]);

  return NextResponse.json({ ok: true });
}
