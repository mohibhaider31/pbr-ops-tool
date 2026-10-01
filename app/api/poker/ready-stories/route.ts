export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession, getJiraAuth } from "@/lib/session";
import { getViewer } from "@/lib/viewer";

import { getCurrentBoard } from "@/lib/board";
import { waitUntil } from "@vercel/functions";
import { localStoriesByStatus, refreshIfStale, isProjectionEmpty, distinctStatuses } from "@/lib/readModel";
import { syncBoardIssues } from "@/lib/jiraSync";

// Stories in "Ready For Dev" — the natural candidates to point.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await getSession();
    const auth = await getJiraAuth();
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    // Local read model. Was a live Jira search measured at 1.75-2.0s.
    //
    // If the projection has nothing for this board we must populate it NOW,
    // not in the background — otherwise the picker shows "no stories" even
    // though Jira has plenty, which is exactly how this broke. Backlog already
    // did this; ready-stories didn't.
    if (await isProjectionEmpty(board.id)) {
      await syncBoardIssues(board.id, board.jiraProjectKey, auth);
    } else {
      waitUntil(refreshIfStale(board.id, board.jiraProjectKey, auth));
    }

    let stories = await localStoriesByStatus(board.id, board.readyForDevStatus);

    // Nothing matched the configured status. Rather than show an empty picker,
    // re-sync once and retry — covers a stale projection after stories were
    // moved to Ready For Dev in Jira.
    if (stories.length === 0) {
      const result = await syncBoardIssues(board.id, board.jiraProjectKey, auth);
      stories = await localStoriesByStatus(board.id, board.readyForDevStatus);

      if (stories.length === 0) {
        // Report WHY, so this isn't a silent empty list again.
        const available = await distinctStatuses(board.id);
        return NextResponse.json({
          stories: [],
          diagnostic: {
            configuredStatus: board.readyForDevStatus,
            projectedIssues: result.synced,
            availableStatuses: available,
            syncError: result.error ?? null,
          },
        });
      }
    }

    return NextResponse.json({ stories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
