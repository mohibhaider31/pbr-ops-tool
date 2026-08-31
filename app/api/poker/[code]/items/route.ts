export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Add one or more stories to the session queue. Organizer only. If the
// session has no current item yet, the first added becomes current.
export async function POST(req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.pokerSession.findUnique({
    where: { code: params.code },
    include: { items: true },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "only the organizer can add stories" }, { status: 403 });

  const { stories }: { stories: { jiraKey: string; summary: string }[] } = await req.json();
  if (!Array.isArray(stories) || stories.length === 0)
    return NextResponse.json({ error: "no stories" }, { status: 400 });

  // Skip any already in the queue.
  const existing = new Set(session.items.map((i) => i.jiraKey));
  const toAdd = stories.filter((s) => !existing.has(s.jiraKey));
  let order = session.items.length;
  const created = [];
  for (const s of toAdd) {
    const item = await prisma.pokerItem.create({
      data: { sessionId: session.id, jiraKey: s.jiraKey, summary: s.summary, order: order++ },
    });
    created.push(item);
  }

  // If nothing is current yet, set the first-created as current.
  if (!session.currentItemId && created.length > 0) {
    await prisma.pokerSession.update({
      where: { id: session.id },
      data: { currentItemId: created[0].id },
    });
  }

  waitUntil(pusher().trigger(pokerChannel(session.code), POKER_EVENTS.queueUpdate, {}).catch(() => {}));
  return NextResponse.json({ ok: true, added: created.length });
}
