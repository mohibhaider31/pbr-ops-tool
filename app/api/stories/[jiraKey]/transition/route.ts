import { NextResponse } from "next/server";
import { transitionIssue } from "@/lib/jira";

// Single-hop transition, used by the client-side "runner" so the UI can
// animate each step of the PBR-done chain individually instead of doing
// all hops in one opaque server call.
export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { to }: { to: string } = await req.json();
    await transitionIssue(params.jiraKey, to);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
