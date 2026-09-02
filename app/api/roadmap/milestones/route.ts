export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";
import { getViewer } from "@/lib/viewer";

const KINDS = ["RELEASE", "UAT", "REGRESSION", "OTHER"];

// Milestones are standalone dated markers (UAT / Production Release /
// Regression) — not stories, so the PO creates them directly here.
export async function POST(req: Request) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const { label, date, kind } = (await req.json()) ?? {};
  if (!label?.trim() || !date)
    return NextResponse.json({ error: "Label and date are required" }, { status: 400 });
  const d = new Date(date);
  if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const viewer = await getViewer();
  const milestone = await prisma.roadmapMilestone.create({
    data: {
      boardId: board.id,
      label: label.trim(),
      date: d,
      kind: KINDS.includes(kind) ? kind : "RELEASE",
      createdBy: viewer?.name ?? null,
    },
  });
  return NextResponse.json({ ok: true, milestone });
}
