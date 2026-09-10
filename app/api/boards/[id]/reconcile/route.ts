export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getJiraAuth } from "@/lib/session";
import { fetchProjectMembers } from "@/lib/jira";

// Compare this board's members against who has actually worked on its Jira
// project, so an admin can clean up memberships granted in bulk by mistake.
//
// GET reviews, POST removes a chosen set. Deliberately NOT automatic: being a
// contributor and having legitimate access aren't the same thing — a new PO or
// a stakeholder may have neither an assigned issue nor a reported one. So this
// proposes, and a human decides.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const board = await prisma.board.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const auth = await getJiraAuth();
  let contributorIds = new Set<string>();
  try {
    const contributors = await fetchProjectMembers(auth, { projectKey: board.jiraProjectKey });
    contributorIds = new Set(contributors.map((c) => c.accountId));
  } catch (err: any) {
    return NextResponse.json(
      { error: `Couldn't read ${board.jiraProjectKey} from Jira: ${String(err?.message || err).slice(0, 160)}` },
      { status: 502 }
    );
  }

  const members = await prisma.boardMembership.findMany({
    where: { boardId: board.id },
    include: {
      person: {
        select: { id: true, name: true, email: true, accountId: true, isAdmin: true, authType: true },
      },
    },
  });

  const rows = members.map((m) => ({
    personId: m.personId,
    name: m.person.name,
    email: m.person.email,
    role: m.role,
    isAdmin: m.person.isAdmin,
    authType: m.person.authType,
    // Local stakeholder accounts have no Jira identity, so "not a contributor"
    // is expected for them and must not be read as a stale membership.
    isContributor: !!m.person.accountId && contributorIds.has(m.person.accountId),
    hasJiraIdentity: !!m.person.accountId && m.person.authType !== "local",
  }));

  return NextResponse.json({
    board: { id: board.id, name: board.name, key: board.jiraProjectKey },
    contributorCount: contributorIds.size,
    memberCount: rows.length,
    members: rows,
    // The suggestion, not the action.
    suggested: rows.filter((r) => r.hasJiraIdentity && !r.isContributor && !r.isAdmin),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const { personIds }: { personIds?: string[] } = await req.json();
  if (!Array.isArray(personIds) || personIds.length === 0)
    return NextResponse.json({ error: "personIds required" }, { status: 400 });

  const r = await prisma.boardMembership.deleteMany({
    where: { boardId: params.id, personId: { in: personIds } },
  });
  return NextResponse.json({ ok: true, removed: r.count });
}
