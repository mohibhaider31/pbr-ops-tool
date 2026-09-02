export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard, getAccessibleBoards } from "@/lib/board";

export async function GET() {
  const v = await getViewer();
  if (!v) return NextResponse.json({ viewer: null });
  const board = await getCurrentBoard();
  const boards = await getAccessibleBoards();
  return NextResponse.json({
    viewer: {
      name: v.name,
      email: v.email,
      avatarUrl: v.avatarUrl,
      role: board?.role ?? null,
      isAdmin: v.isAdmin,
      authType: v.authType,
      boardId: board?.id ?? null,
      boardName: board?.name ?? null,
    },
    boards: boards.map((b) => ({ id: b.id, name: b.name, jiraProjectKey: b.jiraProjectKey })),
  });
}
