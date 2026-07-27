import { NextResponse } from "next/server";
import { transitionIssue } from "@/lib/jira";
import { getSession } from "@/lib/session";

// Single-hop transition, used by the client-side "runner" so the UI can
// animate each step of the PBR-done chain. Runs as the logged-in user so the
// transition is attributed to them and respects their Jira permissions.
export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { to }: { to: string } = await req.json();
    const session = await getSession();
    const auth = session
      ? { accessToken: session.accessToken, cloudId: session.cloudId }
      : undefined;
    await transitionIssue(params.jiraKey, to, auth);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
