export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { analyze } from "@/lib/poker";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.pokerSession.findUnique({
    where: { code: params.code },
    include: { items: { orderBy: { order: "asc" }, include: { votes: true } } },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOrganizer = session.organizerId === viewer.accountId;
  const current = session.items.find((i) => i.id === session.currentItemId) || null;

  let currentPayload: any = null;
  if (current) {
    const roundVotes = current.votes.filter((v) => v.round === current.round);
    const revealed = current.state === "REVEALED";
    const participants = roundVotes.map((v) => ({
      voterId: v.voterId,
      voterName: v.voterName,
      voted: true,
      card: revealed || v.voterId === viewer.accountId ? v.card : null,
    }));
    const analysis = revealed
      ? analyze(roundVotes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card })))
      : null;
    currentPayload = {
      itemId: current.id,
      jiraKey: current.jiraKey,
      summary: current.summary,
      state: current.state,
      round: current.round,
      finalPoints: current.finalPoints,
      myVote: roundVotes.find((v) => v.voterId === viewer.accountId)?.card ?? null,
      participants,
      analysis,
    };
  }

  return NextResponse.json({
    code: session.code,
    organizerName: session.organizerName,
    isOrganizer,
    queue: session.items.map((i) => ({
      itemId: i.id,
      jiraKey: i.jiraKey,
      summary: i.summary,
      status: i.status,
      finalPoints: i.finalPoints,
      isCurrent: i.id === session.currentItemId,
    })),
    current: currentPayload,
  });
}
