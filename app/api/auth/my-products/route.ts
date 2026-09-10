export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getJiraAuth } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { fetchVisibleProjects } from "@/lib/jira";

// Everything this user could work on, from THEIR Jira access.
//
// The old model required an admin to pre-create every board — but no admin can
// see every Jira project, so products the admin couldn't access could never get
// a board, and their users could never be given one. Products are therefore
// brought in by the person who actually has the access.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.authType === "local")
    return NextResponse.json(
      { error: "Connect your Atlassian account to see your products", needsAtlassianLink: true },
      { status: 403 }
    );

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const auth = await getJiraAuth();
  let projects: { key: string; name: string }[] = [];
  try {
    projects = await fetchVisibleProjects(auth);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Couldn't read your Jira projects: ${String(err?.message || err).slice(0, 160)}` },
      { status: 502 }
    );
  }

  const [boards, memberships] = await Promise.all([
    prisma.board.findMany({ select: { id: true, name: true, jiraProjectKey: true } }),
    prisma.boardMembership.findMany({
      where: { personId: viewer.personId },
      select: { boardId: true, role: true },
    }),
  ]);

  const boardByKey = new Map(boards.map((b) => [b.jiraProjectKey.toUpperCase(), b]));
  const roleByBoard = new Map(memberships.map((m) => [m.boardId, m.role]));

  return NextResponse.json({
    products: projects.map((p) => {
      const board = boardByKey.get(p.key.toUpperCase());
      return {
        key: p.key,
        jiraName: p.name,
        boardId: board?.id ?? null,
        boardName: board?.name ?? null,
        // exists  = someone has already set this product up here
        // joined  = this user is already a member of it
        exists: !!board,
        joined: board ? roleByBoard.has(board.id) : false,
        role: board ? roleByBoard.get(board.id) ?? null : null,
      };
    }),
  });
}
