export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getCurrentBoard } from "@/lib/board";
import { syncBoardIssues, getSyncState } from "@/lib/jiraSync";

// Manual "refresh from Jira" + a way for the UI to show sync freshness.
export async function GET() {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
  const state = await getSyncState(board.id);
  const count = await prisma.jiraIssue.count({ where: { boardId: board.id } });
  return NextResponse.json({
    lastSyncAt: state?.lastSyncAt ?? null,
    syncing: state?.syncing ?? false,
    lastError: state?.lastError ?? null,
    issueCount: count,
  });
}

// Force a sync now. Awaited, because the user explicitly asked for it and
// expects to see the result.
export async function POST() {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
  const session = await getSession();
  const auth = session ? { accessToken: session.accessToken, cloudId: session.cloudId } : undefined;
  const result = await syncBoardIssues(board.id, board.jiraProjectKey, auth);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
