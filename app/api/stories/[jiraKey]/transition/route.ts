import { NextResponse } from "next/server";
import { transitionIssue } from "@/lib/jira";
import { getSession } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";
import { can } from "@/lib/permissions";

// Single-hop transition for the PBR-done runner. The final hop to Ready For
// Dev requires pbr_approve (PO only); all earlier hops require pbr_send (BA+).
export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { to }: { to: string } = await req.json();

    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const READY_FOR_DEV = board.readyForDevStatus.toLowerCase();

    // Only allow transitions to statuses this board actually declares as part
    // of its PBR path (plus the Ready-For-Dev target). Previously any status
    // string from the client was attempted against Jira.
    const allowed = new Set(
      [...board.pbrDonePath, board.readyForDevStatus].map((s) => s.toLowerCase())
    );
    if (!allowed.has(to.toLowerCase())) {
      return NextResponse.json(
        { error: `"${to}" is not a configured PBR status for this board` },
        { status: 400 }
      );
    }

    const isFinalHop = to.toLowerCase() === READY_FOR_DEV;
    const needed = isFinalHop ? "pbr_approve" : "pbr_send";
    if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin }, needed)) {
      return NextResponse.json(
        { error: isFinalHop ? "Only a PO can approve to Ready For Dev" : "forbidden" },
        { status: 403 }
      );
    }

    const session = await getSession();
    const auth = session ? { accessToken: session.accessToken, cloudId: session.cloudId } : undefined;
    await transitionIssue(params.jiraKey, to, auth);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
