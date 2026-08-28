// Board resolution + per-board config. Replaces the old env-based single-board
// config. The selected board is stored in a cookie; falls back to the user's
// default/first board.

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import type { BoardRole } from "@/lib/permissions";

const BOARD_COOKIE = "pbr_board";

export type BoardConfig = {
  id: string;
  name: string;
  jiraProjectKey: string;
  backlogStatus: string;
  readyForDevStatus: string;
  pbrDonePath: string[];
  role: BoardRole | null; // the viewer's role on THIS board (null if not a member; admins get PO-equivalent)
  isAdmin: boolean;
};

// Boards the current user can access (their memberships; admins see all).
// Memoised per request - getCurrentBoard and the viewer route both use it.
export const getAccessibleBoards = cache(async function getAccessibleBoards() {
  const viewer = await getViewer();
  if (!viewer) return [];
  if (viewer.isAdmin) {
    return prisma.board.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  }
  const memberships = await prisma.boardMembership.findMany({
    where: { personId: viewer.personId },
    include: { board: true },
  });
  return memberships
    .map((m) => m.board)
    .sort((a, b) => (a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1));
});

// The currently-selected board for this request, with the viewer's role on it.
// Memoised per request. Several routes call this more than once.
export const getCurrentBoard = cache(async function getCurrentBoard(): Promise<BoardConfig | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const selectedId = cookies().get(BOARD_COOKIE)?.value;
  const accessible = await getAccessibleBoards();
  if (accessible.length === 0) return null;

  let board = selectedId ? accessible.find((b) => b.id === selectedId) : undefined;
  if (!board) board = accessible.find((b) => b.isDefault) || accessible[0];

  // Resolve the viewer's role on this board.
  let role: BoardRole | null = null;
  if (viewer.isAdmin) {
    role = "PO"; // admins act with PO-level product capability on any board
  } else {
    const m = await prisma.boardMembership.findUnique({
      where: { personId_boardId: { personId: viewer.personId, boardId: board.id } },
    });
    role = (m?.role as BoardRole) ?? null;
  }

  return {
    id: board.id,
    name: board.name,
    jiraProjectKey: board.jiraProjectKey,
    backlogStatus: board.backlogStatus,
    readyForDevStatus: board.readyForDevStatus,
    pbrDonePath: board.pbrDonePath.split(",").map((s) => s.trim()).filter(Boolean),
    role,
    isAdmin: viewer.isAdmin,
  };
});

export function setBoardCookie(boardId: string) {
  cookies().set(BOARD_COOKIE, boardId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export const BOARD_COOKIE_NAME = BOARD_COOKIE;
