export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCap } from "@/lib/guard";
import { getJiraAuth } from "@/lib/session";
import { verifyJiraProject } from "@/lib/jira";

// Check a Jira project key before a board is created for it. Without this, a
// typo produces a board that looks fine and then silently syncs nothing.
export async function GET(req: Request) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const key = (new URL(req.url).searchParams.get("key") ?? "").trim().toUpperCase();
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const auth = await getJiraAuth();
  const result = await verifyJiraProject(key, auth);
  return NextResponse.json(result);
}
