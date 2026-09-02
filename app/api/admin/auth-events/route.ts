export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";

// Recent authentication activity, so an admin can answer "how did this account
// get access?" and spot repeated failures.
export async function GET(req: Request) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const kind = new URL(req.url).searchParams.get("kind");
  const events = await prisma.authEvent.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, kind: true, actorName: true, subject: true,
      authType: true, ip: true, detail: true, createdAt: true,
    },
  });
  return NextResponse.json({ events });
}
