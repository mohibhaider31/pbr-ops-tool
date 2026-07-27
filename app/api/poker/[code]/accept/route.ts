export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { setStoryPoints } from "@/lib/jira";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Organizer accepts an agreed estimate: writes it to Jira's Story Points
// field (as the organizer, via their token) and records finalPoints.
export async function POST(req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { points }: { points: number } = await req.json();
  if (typeof points !== "number" || points < 0)
    return NextResponse.json({ error: "invalid points" }, { status: 400 });

  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "only the organizer can accept" }, { status: 403 });

  try {
    const auth = (async () => {
      const s = await getSession();
      return s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
    });
    const jiraAuth = await auth();
    await setStoryPoints(session.jiraKey, points, jiraAuth);

    await prisma.pokerSession.update({
      where: { id: session.id },
      data: { finalPoints: points },
    });
    await pusher().trigger(pokerChannel(session.code), POKER_EVENTS.accepted, { points });
    return NextResponse.json({ ok: true, points });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
