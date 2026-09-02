export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { generateInviteToken } from "@/lib/password";
import { logAuthEvent } from "@/lib/authAudit";
import { getViewer } from "@/lib/viewer";

const TTL_MS = 60 * 60 * 1000;

// Admin issues a one-time reset link for a local account, to relay manually.
// Exists because no mail provider is configured; with one, the user would get
// this by email and admins wouldn't handle tokens at all.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const person = await prisma.person.findUnique({ where: { id: params.id } });
  if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  if (person.authType !== "local")
    return NextResponse.json(
      { error: "That's an Atlassian user — they reset their password with Atlassian" },
      { status: 400 }
    );

  const { raw, hash } = generateInviteToken();
  await prisma.passwordReset.create({
    data: { personId: person.id, tokenHash: hash, expiresAt: new Date(Date.now() + TTL_MS) },
  });

  const admin = await getViewer();
  await logAuthEvent({
    kind: "PASSWORD_RESET_ISSUED", actorName: admin?.name ?? null,
    subject: person.email, authType: "local",
  });

  const base = process.env.APP_BASE_URL || "https://pbr-ops-tool.vercel.app";
  return NextResponse.json({
    ok: true,
    resetUrl: `${base}/reset-password?token=${raw}`,
    expiresInMinutes: 60,
  });
}
