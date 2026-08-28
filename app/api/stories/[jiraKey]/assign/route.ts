import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";
import { getViewer } from "@/lib/viewer";

type IncomingAssignee = { name: string; email: string; accountId?: string | null };

// Replace the reviewer list for a story.
//
// Changed from delete-all/create-all to a diff: reviewers who are staying keep
// their row, which means their markedDone state survives a re-assign. The old
// version silently reset everyone's review progress whenever one person was
// added.
export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("assign");
  if (denied) return denied;
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const { assignees }: { assignees: IncomingAssignee[] } = await req.json();
    if (!Array.isArray(assignees))
      return NextResponse.json({ error: "assignees must be an array" }, { status: 400 });

    const story = await prisma.story.findFirst({
      where: { jiraKey: params.jiraKey, boardId: board.id },
      include: { assignees: true },
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const wantByEmail = new Map(assignees.map((a) => [a.email.toLowerCase(), a]));
    const haveByEmail = new Map(story.assignees.map((a) => [a.email.toLowerCase(), a]));

    const toRemove = story.assignees.filter((a) => !wantByEmail.has(a.email.toLowerCase()));
    const toAdd = assignees.filter((a) => !haveByEmail.has(a.email.toLowerCase()));
    // Existing rows that should pick up an accountId they didn't have before.
    const toBackfill = story.assignees.filter((a) => {
      const want = wantByEmail.get(a.email.toLowerCase());
      return want?.accountId && want.accountId !== a.accountId;
    });

    const ops: any[] = [];
    if (toRemove.length)
      ops.push(prisma.assignee.deleteMany({ where: { id: { in: toRemove.map((a) => a.id) } } }));
    if (toAdd.length)
      ops.push(
        prisma.assignee.createMany({
          data: toAdd.map((a) => ({
            storyId: story.id,
            name: a.name,
            email: a.email,
            accountId: a.accountId ?? null,
          })),
        })
      );
    for (const a of toBackfill) {
      const want = wantByEmail.get(a.email.toLowerCase())!;
      ops.push(prisma.assignee.update({ where: { id: a.id }, data: { accountId: want.accountId } }));
    }
    ops.push(
      prisma.story.update({
        where: { id: story.id },
        data: { stage: assignees.length > 0 ? "ASSIGNED" : "BACKLOG" },
      })
    );

    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// A reviewer marks their own review done (or undoes it).
//
// Identity now resolves from the authenticated session, not a client-supplied
// email - the client used to send a hardcoded placeholder. Matching prefers
// the stable Atlassian accountId and falls back to email for rows created
// before accountId existed.
export async function PATCH(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("review");
  if (denied) return denied;
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    // `done` omitted = toggle. The previous version could only ever set true.
    const body = await req.json().catch(() => ({}));
    const explicitDone: boolean | undefined =
      typeof body?.done === "boolean" ? body.done : undefined;

    const story = await prisma.story.findFirst({
      where: { jiraKey: params.jiraKey, boardId: board.id },
      include: { assignees: true },
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const mine =
      story.assignees.find((a) => a.accountId && a.accountId === viewer.accountId) ??
      (viewer.email
        ? story.assignees.find((a) => a.email.toLowerCase() === viewer.email!.toLowerCase())
        : undefined);

    if (!mine)
      return NextResponse.json({ error: "You are not a reviewer on this story" }, { status: 403 });

    const nextDone = explicitDone ?? !mine.markedDone;

    await prisma.assignee.update({
      where: { id: mine.id },
      data: {
        markedDone: nextDone,
        markedDoneAt: nextDone ? new Date() : null,
        // Opportunistically stamp the stable id on legacy rows.
        accountId: mine.accountId ?? viewer.accountId,
      },
    });

    const updated = await prisma.assignee.findMany({ where: { storyId: story.id } });
    const allDone = updated.length > 0 && updated.every((a) => a.markedDone);

    await prisma.story.update({
      where: { id: story.id },
      data: { stage: allDone ? "IN_REVIEW" : "ASSIGNED" },
    });

    return NextResponse.json({ ok: true, markedDone: nextDone, allDone });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
