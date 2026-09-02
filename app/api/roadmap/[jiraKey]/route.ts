export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";

// Update one entry (dates, lane, state, version) — used by the side panel.
export async function PATCH(req: Request, { params }: { params: { jiraKey: string } }) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const body = await req.json();
  const data: any = {};
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.targetDate) data.targetDate = new Date(body.targetDate);
  if (body.version !== undefined) data.version = body.version || null;
  if (body.lane) data.lane = body.lane;
  if (body.state) data.state = body.state === "TENTATIVE" ? "TENTATIVE" : "CONFIRMED";
  if (body.note !== undefined) data.note = body.note || null;
  if (typeof body.order === "number") data.order = body.order;

  if (data.startDate && data.targetDate && data.targetDate < data.startDate)
    return NextResponse.json({ error: "Target date can't be before the start date" }, { status: 400 });

  const updated = await prisma.roadmapEntry.updateMany({
    where: { boardId: board.id, jiraKey: params.jiraKey },
    data,
  });
  if (updated.count === 0) return NextResponse.json({ error: "not on the roadmap" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Remove from the roadmap (does not touch the story itself).
export async function DELETE(_req: Request, { params }: { params: { jiraKey: string } }) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  await prisma.roadmapEntry.deleteMany({ where: { boardId: board.id, jiraKey: params.jiraKey } });
  return NextResponse.json({ ok: true });
}
