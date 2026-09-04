export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";
import { getViewer } from "@/lib/viewer";
import { generateInviteToken } from "@/lib/password";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";
import { sendInviteEmail, mailConfigured } from "@/lib/mail";

const INVITE_TTL_DAYS = 7;
// Per-admin cap. Admin-gated already, but an unlimited invite mint is a poor
// blast radius for a compromised admin session — and the links grant sight of
// internal roadmap data.
const MAX_INVITES_PER_HOUR = 20;

// Admin-only provisioning of local (stakeholder) accounts. Invite-only by
// design: there is no public signup, because the roadmap this grants sight of
// is internal.
export async function POST(req: Request) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const { email, name, grantBoardAccess }: { email?: string; name?: string; grantBoardAccess?: boolean } =
    await req.json();

  if (!email?.trim() || !name?.trim())
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });

  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized))
    return NextResponse.json({ error: "That doesn't look like an email address" }, { status: 400 });

  // Don't shadow an Atlassian user with a local password account.
  const existing = await prisma.person.findUnique({ where: { email: normalized } });
  if (existing && existing.authType === "atlassian") {
    return NextResponse.json(
      { error: "That address already belongs to an Atlassian user — they should sign in with Atlassian" },
      { status: 409 }
    );
  }

  const [board, viewer] = await Promise.all([getCurrentBoard(), getViewer()]);

  const recent = await prisma.localInvite.count({
    where: {
      createdById: viewer?.accountId ?? undefined,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent >= MAX_INVITES_PER_HOUR)
    return NextResponse.json(
      { error: `That's ${MAX_INVITES_PER_HOUR} invites in an hour — pausing as a safety check. Try again shortly.` },
      { status: 429 }
    );

  const { raw, hash } = generateInviteToken();

  await prisma.localInvite.create({
    data: {
      email: normalized,
      name: name.trim(),
      tokenHash: hash, // raw token is never stored
      boardId: grantBoardAccess && board ? board.id : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      createdById: viewer?.accountId ?? null,
    },
  });

  await logAuthEvent({
    kind: "INVITE_CREATED", actorName: viewer?.name ?? null, actorId: viewer?.accountId ?? null,
    subject: normalized, authType: "local", ip: ipFrom(req),
  });

  const base = process.env.APP_BASE_URL || "https://pbr-ops-tool.vercel.app";
  const inviteUrl = `${base}/accept-invite?token=${raw}`;

  // Email it if a provider is configured; otherwise hand the link back for the
  // admin to relay. Either way the invite exists and is valid.
  const mail = await sendInviteEmail(normalized, name.trim(), inviteUrl, INVITE_TTL_DAYS);

  return NextResponse.json({
    ok: true,
    emailed: mail.delivered,
    mailConfigured: mailConfigured(),
    // Only returned when we couldn't deliver it — no point putting a live token
    // on screen if it already reached their inbox.
    inviteUrl: mail.delivered ? null : inviteUrl,
    expiresInDays: INVITE_TTL_DAYS,
  });
}

// List outstanding invites so an admin can see who hasn't accepted.
export async function GET() {
  const denied = await requireCap("manage_people");
  if (denied) return denied;
  const invites = await prisma.localInvite.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, expiresAt: true, createdAt: true },
  });
  return NextResponse.json({ invites });
}
