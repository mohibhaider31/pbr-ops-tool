import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";

// Moves a story to a new priorityOrder position and shifts everything
// between the old and new spot by one. Simple approach: since backlogs
// here are small (dozens, not thousands), a full renumber on every move
// is fine and avoids float/fractional-index edge cases.
export async function PATCH(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("prioritize");
  if (denied) return denied;
  try {
    const { newOrder }: { newOrder: number } = await req.json();

    const all = await prisma.story.findMany({ orderBy: { priorityOrder: "asc" } });
    const moving = all.find((s) => s.jiraKey === params.jiraKey);
    if (!moving) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const withoutMoving = all.filter((s) => s.jiraKey !== params.jiraKey);
    const clampedIndex = Math.max(0, Math.min(newOrder, withoutMoving.length));
    withoutMoving.splice(clampedIndex, 0, moving);

    await prisma.$transaction(
      withoutMoving.map((s, idx) =>
        prisma.story.update({ where: { id: s.id }, data: { priorityOrder: idx } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
