// Server-side capability guard for API routes, now board-aware. Uses the
// viewer's role on the CURRENT board (admins act at PO level everywhere).
import { NextResponse } from "next/server";
import { getCurrentBoard } from "@/lib/board";
import { getSession } from "@/lib/session";
import { can, requiresAtlassian, type Capability } from "@/lib/permissions";

export async function requireCap(cap: Capability): Promise<NextResponse | null> {
  const [board, session] = await Promise.all([getCurrentBoard(), getSession()]);
  if (!board || !session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Second line of defence, deliberately duplicating can(): an account with no
  // linked Atlassian identity can never perform a Jira-writing capability, so a
  // future refactor of the capability table cannot accidentally open it up.
  if (session.authType === "local" && requiresAtlassian(cap))
    return NextResponse.json(
      {
        error: "Connect your Atlassian account to do this",
        needsAtlassianLink: true,
      },
      { status: 403 }
    );

  if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin, authType: session.authType }, cap))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
