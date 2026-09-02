export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInviteToken, isLockedOut, recordAttempt } from "@/lib/password";

const TTL_MS = 60 * 60 * 1000; // 1 hour — shorter than an invite

// Request a password reset.
//
// Always returns the same response whether or not the address exists, so this
// can't be used to enumerate accounts. Because no mail provider is configured,
// an admin currently has to relay the link; the token is returned ONLY when the
// caller is an admin (see /api/people/reset-link) — never here.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { email }: { email?: string } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const normalized = email.trim().toLowerCase();

  // Throttle by email so this endpoint can't be used to spam resets.
  if (await isLockedOut(normalized)) {
    return NextResponse.json({ ok: true }); // still uniform
  }
  await recordAttempt(normalized, false, ip);

  const person = await prisma.person.findUnique({ where: { email: normalized } });
  if (person && person.authType === "local") {
    const { hash } = generateInviteToken();
    await prisma.passwordReset.create({
      data: { personId: person.id, tokenHash: hash, expiresAt: new Date(Date.now() + TTL_MS) },
    });
    // Intentionally NOT returned. Without email delivery, the user contacts an
    // admin, who issues a link via the admin endpoint.
  }

  return NextResponse.json({
    ok: true,
    message: "If that account exists, an administrator can issue you a reset link.",
  });
}
