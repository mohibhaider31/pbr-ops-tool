export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getViewer } from "@/lib/viewer";

import { getCurrentBoard } from "@/lib/board";
import { waitUntil } from "@vercel/functions";
import { localStoriesByStatus, refreshIfStale } from "@/lib/readModel";

// Stories in "Ready For Dev" — the natural candidates to point.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await getSession();
    const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    // Local read model. Was a live Jira search measured at 1.75-2.0s.
    waitUntil(refreshIfStale(board.id, board.jiraProjectKey, auth));
    const stories = await localStoriesByStatus(board.id, board.readyForDevStatus);
    return NextResponse.json({ stories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
