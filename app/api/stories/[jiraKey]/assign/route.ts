import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { assignees }: { assignees: { name: string; email: string }[] } =
      await req.json();

    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    await prisma.$transaction([
      // Replace the assignee list each time this is called, so re-assigning
      // is just "call this again with the new list" rather than needing a
      // separate remove endpoint.
      prisma.assignee.deleteMany({ where: { storyId: story.id } }),
      prisma.assignee.createMany({
        data: assignees.map((a) => ({ storyId: story.id, name: a.name, email: a.email })),
      }),
      prisma.story.update({
        where: { id: story.id },
        data: { stage: assignees.length > 0 ? "ASSIGNED" : "BACKLOG" },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// A reviewer marks their own review done.
export async function PATCH(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { email }: { email: string } = await req.json();
    const story = await prisma.story.findUnique({
      where: { jiraKey: params.jiraKey },
      include: { assignees: true },
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    await prisma.assignee.updateMany({
      where: { storyId: story.id, email },
      data: { markedDone: true, markedDoneAt: new Date() },
    });

    const updated = await prisma.assignee.findMany({ where: { storyId: story.id } });
    const allDone = updated.length > 0 && updated.every((a) => a.markedDone);

    await prisma.story.update({
      where: { id: story.id },
      data: { stage: allDone ? "IN_REVIEW" : "ASSIGNED" },
    });

    return NextResponse.json({ ok: true, allDone });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
