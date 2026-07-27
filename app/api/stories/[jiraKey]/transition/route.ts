import { NextResponse } from "next/server";
import { transitionIssue } from "@/lib/jira";
import { getSession } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";

const READY_FOR_DEV = (process.env.JIRA_READY_FOR_DEV_STATUS || "Ready For Dev").toLowerCase();

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

    const isFinalHop = to.toLowerCase() === READY_FOR_DEV;
    const needed = isFinalHop ? "pbr_approve" : "pbr_send";
    if (!can({ role: viewer.role, isAdmin: viewer.isAdmin }, needed)) {
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
