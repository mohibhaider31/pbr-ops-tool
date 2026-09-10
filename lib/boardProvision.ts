// Board auto-provisioning from a user's real Jira access.
//
// The problem this solves: before someone logs in we have no way to know which
// Jira projects they can see — that can only be read with THEIR token, not
// ours. So an invited user either has to be assigned a board up front, or gets
// nothing until an admin notices.
//
// On login we can ask Jira, as them, which projects they can browse, and grant
// membership on any board whose project key matches.
//
// Two deliberate rules:
//  - Only ever ADDS. It never removes a board or downgrades a role, so an
//    admin's manual revoke isn't undone by the next sign-in.
//  - Runs once (tracked by Person.boardsScannedAt) rather than on every login,
//    for the same reason. A user can re-run it themselves from the UI if their
//    Jira access has changed.

import { prisma } from "@/lib/prisma";
import { fetchVisibleProjectKeys, type JiraAuth } from "@/lib/jira";

export type ProvisionResult = {
  granted: { key: string; name: string }[];
  alreadyHad: string[];
  noMatch: string[]; // Jira projects with no board in this tool
};

export async function provisionBoardsFromJira(
  personId: string,
  auth: JiraAuth | undefined,
  opts?: { force?: boolean }
): Promise<ProvisionResult> {
  const empty: ProvisionResult = { granted: [], alreadyHad: [], noMatch: [] };
  if (!auth) return empty; // local accounts have no Jira identity to scan

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, boardsScannedAt: true },
  });
  if (!person) return empty;
  if (person.boardsScannedAt && !opts?.force) return empty;

  let keys: string[];
  try {
    keys = await fetchVisibleProjectKeys(auth);
  } catch {
    return empty; // never let provisioning break a login
  }

  const [boards, existing] = await Promise.all([
    prisma.board.findMany({ select: { id: true, name: true, jiraProjectKey: true } }),
    prisma.boardMembership.findMany({ where: { personId }, select: { boardId: true } }),
  ]);

  const have = new Set(existing.map((m) => m.boardId));
  const byKey = new Map(boards.map((b) => [b.jiraProjectKey.toUpperCase(), b]));

  const result: ProvisionResult = { granted: [], alreadyHad: [], noMatch: [] };

  for (const key of keys) {
    const board = byKey.get(key.toUpperCase());
    if (!board) {
      result.noMatch.push(key);
      continue;
    }
    if (have.has(board.id)) {
      result.alreadyHad.push(board.jiraProjectKey);
      continue;
    }
    await prisma.boardMembership.create({
      // DEVELOPER, not PO: they can review, comment and vote, but not
      // prioritise or push stories through PBR. An admin promotes them.
      data: { personId, boardId: board.id, role: "DEVELOPER" },
    });
    result.granted.push({ key: board.jiraProjectKey, name: board.name });
  }

  await prisma.person.update({
    where: { id: personId },
    data: { boardsScannedAt: new Date() },
  });

  return result;
}
