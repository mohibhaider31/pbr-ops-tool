export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";

// List people with their role ON THE CURRENT BOARD. People with no membership
// on this board show role null (not a member here).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ people: [], boardId: null });

  // ALL memberships, not just this board's — an admin needs to see which
  // products each person can reach, since that's the access control.
  const people = await prisma.person.findMany({
    orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
    include: {
      memberships: { include: { board: { select: { id: true, name: true, jiraProjectKey: true } } } },
    },
  });
  return NextResponse.json({
    boardId: board.id,
    people: people.map((p) => ({
      id: p.id,
      accountId: p.accountId,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      role: p.memberships.find((m) => m.boardId === board.id)?.role ?? null, // on current board
      isMember: p.memberships.some((m) => m.boardId === board.id),
      // Every product this person can reach, for the admin view.
      boards: p.memberships.map((m) => ({
        id: m.board.id,
        key: m.board.jiraProjectKey,
        name: m.board.name,
        role: m.role,
      })),
      isAdmin: p.isAdmin,
      source: p.source,
      authType: p.authType,
      deactivatedAt: p.deactivatedAt ? p.deactivatedAt.toISOString() : null,
      active: !!p.firstLoginAt && !p.deactivatedAt,
      firstLoginAt: p.firstLoginAt ? p.firstLoginAt.toISOString() : null,
    })),
  });
}

// Manually add a person by email and grant them a board.
//
// The board is explicit rather than "whichever one the admin is looking at" —
// assignment is the access control, so it shouldn't be a side effect of
// navigation. Passing no boardId is allowed; the person then sees the
// "no product assigned" screen until someone grants them one.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const {
    name, email, role, boardId,
  }: { name?: string; email: string; role?: string; boardId?: string } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const person = await prisma.person.upsert({
    where: { email: email.trim() },
    create: { email: email.trim(), name: name?.trim() || email.trim(), source: "manual" },
    update: {},
  });
  const targetBoardId = boardId || board.id;
  await prisma.boardMembership.upsert({
    where: { personId_boardId: { personId: person.id, boardId: targetBoardId } },
    create: { personId: person.id, boardId: targetBoardId, role: (role as any) || "DEVELOPER" },
    update: {},
  });
  // Explicit projection. Returning the raw row here leaked passwordHash to the
  // client - admin-only, but a bcrypt hash should never reach a browser.
  return NextResponse.json({
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      accountId: person.accountId,
      isAdmin: person.isAdmin,
      source: person.source,
    },
  });
}
