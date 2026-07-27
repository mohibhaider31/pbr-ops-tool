import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_LAYERS = ["ENGINE", "MIDDLEWARE", "FRONTEND"];
const VALID_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"];

// Upsert a single layer cell for a story. Sets doneAt when the status
// becomes DONE (and clears it otherwise) so stall detection has a timestamp.
export async function PATCH(
  req: Request,
  { params }: { params: { jiraKey: string; layer: string } }
) {
  try {
    const layer = params.layer.toUpperCase();
    if (!VALID_LAYERS.includes(layer))
      return NextResponse.json({ error: "Invalid layer" }, { status: 400 });

    const body = await req.json();
    const { status, owner, sprint } = body as {
      status?: string;
      owner?: string | null;
      sprint?: string | null;
    };

    if (status && !VALID_STATUSES.includes(status))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const doneAt = status === "DONE" ? new Date() : status ? null : undefined;

    const existing = await prisma.layerTrack.findUnique({
      where: { jiraKey_layer: { jiraKey: params.jiraKey, layer: layer as any } },
    });

    const track = await prisma.layerTrack.upsert({
      where: { jiraKey_layer: { jiraKey: params.jiraKey, layer: layer as any } },
      create: {
        jiraKey: params.jiraKey,
        layer: layer as any,
        status: (status as any) || "NOT_STARTED",
        owner: owner ?? null,
        sprint: sprint ?? null,
        doneAt: doneAt ?? null,
      },
      update: {
        ...(status !== undefined ? { status: status as any } : {}),
        ...(owner !== undefined ? { owner } : {}),
        ...(sprint !== undefined ? { sprint } : {}),
        ...(doneAt !== undefined ? { doneAt } : {}),
      },
    });

    return NextResponse.json({ track });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
