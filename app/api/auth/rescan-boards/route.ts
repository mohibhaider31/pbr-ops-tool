export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getJiraAuth } from "@/lib/session";
import { provisionBoardsFromJira } from "@/lib/boardProvision";

// "Refresh my products" — re-reads the signed-in user's Jira project access.
//
// Self-service by necessity: only their own token can see their access, so an
// admin can't run this on someone else's behalf. Adds only; an admin's revoke
// is never undone.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.authType === "local")
    return NextResponse.json(
      { error: "Connect your Atlassian account first", needsAtlassianLink: true },
      { status: 403 }
    );

  const person = await prisma.person.findUnique({ where: { accountId: session.accountId } });
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });

  const auth = await getJiraAuth();
  const result = await provisionBoardsFromJira(person.id, auth, { force: true });
  return NextResponse.json({ ok: true, ...result });
}
