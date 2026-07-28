export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { fetchReadyForDevStories } from "@/lib/jira";
import { getCurrentBoard } from "@/lib/board";

// Stories in "Ready For Dev" — the natural candidates to point.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await getSession();
    const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const stories = await fetchReadyForDevStories(auth, { projectKey: board.jiraProjectKey, readyForDevStatus: board.readyForDevStatus });
    return NextResponse.json({ stories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
