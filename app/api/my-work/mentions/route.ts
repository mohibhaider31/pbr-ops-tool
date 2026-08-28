export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { getCurrentBoard } from "@/lib/board";
import { fetchMyMentions } from "@/lib/jira";

// Jira @-mentions, split out of /api/my-work.
//
// This is the single most expensive thing the dashboard does: 1 JQL search
// plus up to 40 per-issue comment fetches. Blocking the whole My Work page on
// it meant the user waited seconds to see data we already had locally. The
// page now renders immediately and loads this in the background.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  try {
    const session = await getSession();
    const auth = session ? { accessToken: session.accessToken, cloudId: session.cloudId } : undefined;
    const [found, dismissed] = await Promise.all([
      fetchMyMentions(viewer.accountId, auth, { projectKey: board.jiraProjectKey }),
      prisma.dismissedMention.findMany({
        where: { accountId: viewer.accountId },
        select: { commentId: true },
      }),
    ]);
    const dismissedIds = new Set(dismissed.map((d) => d.commentId));
    return NextResponse.json({ mentions: found.filter((m) => !dismissedIds.has(m.commentId)) });
  } catch {
    return NextResponse.json({ mentions: [] });
  }
}
