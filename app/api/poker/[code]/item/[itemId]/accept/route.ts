export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { setStoryPoints } from "@/lib/jira";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { points }: { points: number } = await req.json();
  if (typeof points !== "number" || points < 0)
    return NextResponse.json({ error: "invalid points" }, { status: 400 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const s = await getSession();
    const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
    await setStoryPoints(item.jiraKey, points, auth);
    await prisma.pokerItem.update({
      where: { id: item.id },
      data: { finalPoints: points, status: "DONE" },
    });
    await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.accepted, { itemId: item.id, points });
    return NextResponse.json({ ok: true, points });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
