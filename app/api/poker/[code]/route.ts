export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParticipant } from "@/lib/pokerParticipant";
import { analyze } from "@/lib/poker";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const t0 = Date.now();
  const me = await getParticipant(params.code);
  const tParticipant = Date.now();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.pokerSession.findUnique({
    where: { code: params.code },
    include: { items: { orderBy: { order: "asc" }, include: { votes: true, refinementVotes: true, investVotes: true } } },
  });
  const tQuery = Date.now();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  console.log(`[perf] poker-read code=${params.code} participant=${tParticipant - t0}ms query=${tQuery - tParticipant}ms total=${tQuery - t0}ms`);

  // Only the authenticated organizer gets organizer controls; guests never do.
  const isOrganizer = !me.isGuest && session.organizerId === me.accountId;
  const current = session.items.find((i) => i.id === session.currentItemId) || null;

  let currentPayload: any = null;
  if (current) {
    const roundVotes = current.votes.filter((v) => v.round === current.round);
    const revealed = current.state === "REVEALED";
    const participants = roundVotes.map((v) => ({
      voterId: v.voterId,
      voterName: v.voterName,
      voted: true,
      card: revealed || v.voterId === me.voterId ? v.card : null,
    }));
    const analysis = revealed
      ? analyze(roundVotes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card })))
      : null;
    // Post-accept refinement poll state (if open or just closed).
    const rVotes = current.refinementVotes || [];
    const refinement = {
      open: current.refinementPollOpen,
      myVote: rVotes.find((v) => v.voterId === me.voterId)?.needsWork ?? null,
      voted: rVotes.length,
      yes: rVotes.filter((v) => v.needsWork).length,
      score: current.rediscussionScore ?? null,
    };
    // Post-refinement INVEST scoring poll state.
    const iVotes = current.investVotes || [];
    const myInvest = iVotes.find((v) => v.voterId === me.voterId) || null;
    const iTotal = iVotes.length;
    const crit: { key: string; ones: number }[] = [
      { key: "independent", ones: iVotes.filter((v) => v.independent).length },
      { key: "negotiable", ones: iVotes.filter((v) => v.negotiable).length },
      { key: "valuable", ones: iVotes.filter((v) => v.valuable).length },
      { key: "estimable", ones: iVotes.filter((v) => v.estimable).length },
      { key: "small", ones: iVotes.filter((v) => v.small).length },
      { key: "testable", ones: iVotes.filter((v) => v.testable).length },
    ];
    const invest = {
      open: current.investPollOpen,
      submitted: iTotal,
      score: current.investScore ?? null,
      rollup: crit, // per-criterion ones-count, for the results bars
      mine: myInvest
        ? {
            independent: myInvest.independent, negotiable: myInvest.negotiable, valuable: myInvest.valuable,
            estimable: myInvest.estimable, small: myInvest.small, testable: myInvest.testable,
          }
        : null,
    };
    currentPayload = {
      itemId: current.id,
      jiraKey: current.jiraKey,
      summary: current.summary,
      state: current.state,
      round: current.round,
      finalPoints: current.finalPoints,
      myVote: roundVotes.find((v) => v.voterId === me.voterId)?.card ?? null,
      participants,
      analysis,
      refinement,
      invest,
    };
  }

  return NextResponse.json({
    code: session.code,
    organizerName: session.organizerName,
    isOrganizer,
    isGuest: me.isGuest,
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
