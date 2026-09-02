export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession, getJiraAuth } from "@/lib/session";
import { getCurrentBoard } from "@/lib/board";
import { fetchProjectMembers } from "@/lib/jira";

// Pull assignable members of the current board's Jira project and ensure each
// is a Person AND a member of this board (default DEVELOPER). Admin only.
export async function POST() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  try {
    const session = await getSession();
    const auth = await getJiraAuth();
    const members = await fetchProjectMembers(auth, { projectKey: board.jiraProjectKey });

    let added = 0;
    for (const m of members) {
      const person = await prisma.person.upsert({
        where: { accountId: m.accountId },
        create: { accountId: m.accountId, name: m.name, email: m.email, avatarUrl: m.avatarUrl, source: "jira" },
        update: { name: m.name, avatarUrl: m.avatarUrl, email: m.email ?? undefined },
      });
      const existing = await prisma.boardMembership.findUnique({
        where: { personId_boardId: { personId: person.id, boardId: board.id } },
      });
      if (!existing) {
        await prisma.boardMembership.create({ data: { personId: person.id, boardId: board.id, role: "DEVELOPER" } });
        added++;
      }
    }
    return NextResponse.json({ ok: true, total: members.length, added });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
