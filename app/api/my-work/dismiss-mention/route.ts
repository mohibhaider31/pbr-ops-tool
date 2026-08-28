export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

// Dismiss a specific Jira comment mention from the dashboard. Idempotent.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { jiraKey, commentId }: { jiraKey?: string; commentId?: string } = await req.json();
  if (!jiraKey || !commentId) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  await prisma.dismissedMention.upsert({
    where: { accountId_commentId: { accountId: viewer.accountId, commentId } },
    create: { accountId: viewer.accountId, jiraKey, commentId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
