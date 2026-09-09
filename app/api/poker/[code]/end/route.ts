export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

// Organizer ends the session.
//
// Previously this DELETED the session, cascading away every item and vote —
// which destroyed the estimation history the poker stats are built from
// (rounds per story, who took part, alignment/INVEST/re-discussion scores).
// It's now a soft end: the record stays, it just stops being live.
export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "only the organizer can end the session" }, { status: 403 });

  await prisma.pokerSession.update({
    where: { id: session.id },
    data: { endedAt: new Date(), currentItemId: null },
  });
  return NextResponse.json({ ok: true });
}
