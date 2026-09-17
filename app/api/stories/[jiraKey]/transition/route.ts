import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transitionIssue } from "@/lib/jira";
import { getSession, getJiraAuth } from "@/lib/session";
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

    // The story must belong to THIS board. Capability and status validation
    // were both done against the current board, but nothing checked the story
    // was actually on it — so a user could transition another product's story
    // whenever the status name happened to match their own board's path.
    const owned = await prisma.story.findFirst({
      where: { jiraKey: params.jiraKey, boardId: board.id },
      select: { id: true },
    });
    if (!owned)
      return NextResponse.json(
        { error: "That story isn't on this board" },
        { status: 404 }
      );

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
    // authType MUST be passed: without it, can() can't apply the "no Jira
    // write without a linked Atlassian identity" rule, so a stakeholder
    // account would slip through this check.
    const sess = await getSession();
    if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin, authType: sess?.authType }, needed)) {
      return NextResponse.json(
        { error: isFinalHop ? "Only a PO can approve to Ready For Dev" : "forbidden" },
        { status: 403 }
      );
    }

    const auth = await getJiraAuth();
    await transitionIssue(params.jiraKey, to, auth);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
