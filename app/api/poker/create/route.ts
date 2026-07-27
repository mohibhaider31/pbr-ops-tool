export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { generateCode } from "@/lib/poker";

// Start a poker session for a story. Anyone who can vote can organize
// (PO/BA/Dev). Viewers cannot.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can({ role: viewer.role, isAdmin: viewer.isAdmin }, "poker_vote"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { jiraKey, summary }: { jiraKey: string; summary: string } = await req.json();
  if (!jiraKey) return NextResponse.json({ error: "jiraKey required" }, { status: 400 });

  // unique code (retry a few times on the rare collision)
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.pokerSession.findUnique({ where: { code } });
    if (!clash) break;
    code = generateCode();
  }

  const session = await prisma.pokerSession.create({
    data: {
      code,
      jiraKey,
      summary: summary || jiraKey,
      organizerId: viewer.accountId,
      organizerName: viewer.name,
    },
  });
  return NextResponse.json({ code: session.code });
}
