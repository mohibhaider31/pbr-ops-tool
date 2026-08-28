import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";

// Moves a story to a new priorityOrder position.
//
// Two bugs fixed here:
//  1. The previous version queried Story with NO boardId filter, so a reorder
//     on one board renumbered stories belonging to every other board.
//  2. It renumbered EVERY row in a transaction. With ~675 stories that is 675
//     UPDATE statements per drag. We now only rewrite the rows between the old
//     and new position, which is typically a handful.
export async function PATCH(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("prioritize");
  if (denied) return denied;
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const { newOrder }: { newOrder: number } = await req.json();
    if (typeof newOrder !== "number" || newOrder < 0)
      return NextResponse.json({ error: "invalid newOrder" }, { status: 400 });

    // Board-scoped: only this board's stories participate in the ordering.
    const all = await prisma.story.findMany({
      where: { boardId: board.id },
      select: { id: true, jiraKey: true, priorityOrder: true },
      orderBy: { priorityOrder: "asc" },
    });

    const fromIdx = all.findIndex((s) => s.jiraKey === params.jiraKey);
    if (fromIdx < 0) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const toIdx = Math.max(0, Math.min(newOrder, all.length - 1));
    if (toIdx === fromIdx) return NextResponse.json({ ok: true, updated: 0 });

    const reordered = [...all];
    const [moving] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moving);

    // Only the span between from/to shifts; everything outside keeps its order.
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const writes = [];
    for (let i = lo; i <= hi; i++) {
      const row = reordered[i];
      if (row.priorityOrder !== i) {
        writes.push(prisma.story.update({ where: { id: row.id }, data: { priorityOrder: i } }));
      }
    }

    if (writes.length > 0) await prisma.$transaction(writes);
    return NextResponse.json({ ok: true, updated: writes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
