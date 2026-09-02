export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const body = await req.json();
  const data: any = {};
  if (body.label?.trim()) data.label = body.label.trim();
  if (body.date) data.date = new Date(body.date);
  if (body.kind) data.kind = body.kind;

  const r = await prisma.roadmapMilestone.updateMany({
    where: { id: params.id, boardId: board.id },
    data,
  });
  if (r.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
  await prisma.roadmapMilestone.deleteMany({ where: { id: params.id, boardId: board.id } });
  return NextResponse.json({ ok: true });
}
