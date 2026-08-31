export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { runPending } from "@/lib/outbox";

// Outbox worker. Called three ways:
//  1. via waitUntil() right after a job is enqueued (fast path - usually the
//     job completes seconds after the user's action)
//  2. by a scheduled cron (catches retries and anything the fast path missed)
//  3. manually, for debugging
//
// Cron calls carry no session, so they authenticate with CRON_SECRET. Browser
// calls are already gated by middleware.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  const isCron = secret && header === `Bearer ${secret}`;
  const hasSession = req.headers.get("cookie")?.includes("pbr_session=");

  if (!isCron && !hasSession)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await runPending(25);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return POST(req);
}
