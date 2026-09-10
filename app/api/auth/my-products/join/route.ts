export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getJiraAuth } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { fetchVisibleProjects, verifyJiraProject } from "@/lib/jira";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Join a product — creating its board if nobody has yet.
//
// This is the piece that unblocks multi-product. Board creation used to be
// admin-only, but no admin can see every Jira project, so a product the admin
// couldn't access could never be set up and its users could never get in.
//
// Authorisation is the user's OWN Jira access: we re-check, with their token,
// that they can browse the project before doing anything. They can't invent a
// board for a project they can't see.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.authType === "local")
    return NextResponse.json(
      { error: "Connect your Atlassian account first", needsAtlassianLink: true },
      { status: 403 }
    );

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { projectKey }: { projectKey?: string } = await req.json();
  const key = (projectKey ?? "").trim().toUpperCase();
  if (!key) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const auth = await getJiraAuth();

  // Re-verify against their own token — the client's claim isn't trusted.
  const visible = await fetchVisibleProjects(auth).catch(() => []);
  const match = visible.find((p) => p.key.toUpperCase() === key);
  if (!match)
    return NextResponse.json(
      { error: "You don't have access to that Jira project" },
      { status: 403 }
    );

  let board = await prisma.board.findUnique({ where: { jiraProjectKey: key } });
  let created = false;

  if (!board) {
    // Read the project's real statuses so the board isn't configured with
    // guesses that don't exist in this project's workflow.
    const info = await verifyJiraProject(key, auth);
    const statuses = info.statuses ?? [];
    const pick = (wanted: string[], fallback: string) =>
      statuses.find((s) => wanted.some((w) => s.toLowerCase() === w.toLowerCase())) ??
      statuses.find((s) => wanted.some((w) => s.toLowerCase().includes(w.toLowerCase()))) ??
      fallback;

    board = await prisma.board.create({
      data: {
        name: match.name,
        jiraProjectKey: key,
        backlogStatus: pick(["To Do", "Backlog", "Open"], "To Do"),
        readyForDevStatus: pick(["Ready For Dev", "Ready for Development", "Selected for Development"], "Ready For Dev"),
        pbrDonePath: "",
        isDefault: (await prisma.board.count()) === 0,
      },
    });
    created = true;
  }

  // Whoever brings a product in owns it here; otherwise join as DEVELOPER.
  const existing = await prisma.boardMembership.findUnique({
    where: { personId_boardId: { personId: viewer.personId, boardId: board.id } },
  });
  if (!existing) {
    await prisma.boardMembership.create({
      data: { personId: viewer.personId, boardId: board.id, role: created ? "PO" : "DEVELOPER" },
    });
  }

  await logAuthEvent({
    kind: "LOGIN",
    actorName: viewer.name,
    actorId: viewer.accountId,
    subject: key,
    ip: ipFrom(req),
    detail: created ? `product created: ${match.name}` : `joined product ${key}`,
  });

  return NextResponse.json({
    ok: true,
    created,
    board: { id: board.id, name: board.name, key: board.jiraProjectKey },
  });
}
