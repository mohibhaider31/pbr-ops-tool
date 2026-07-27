export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { fetchProjectMembers } from "@/lib/jira";

// Pull assignable project members from Jira and upsert them as Person rows.
// New people default to DEVELOPER; existing rows keep their role/admin flag
// (we only refresh name/avatar). Admin only.
export async function POST() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const session = await getSession();
    const auth = session ? { accessToken: session.accessToken, cloudId: session.cloudId } : undefined;
    const members = await fetchProjectMembers(auth);

    let added = 0;
    for (const m of members) {
      const existing = await prisma.person.findUnique({ where: { accountId: m.accountId } });
      if (existing) {
        await prisma.person.update({
          where: { id: existing.id },
          data: { name: m.name, avatarUrl: m.avatarUrl, email: m.email ?? existing.email },
        });
      } else {
        await prisma.person.create({
          data: {
            accountId: m.accountId,
            name: m.name,
            email: m.email,
            avatarUrl: m.avatarUrl,
            role: "DEVELOPER",
            source: "jira",
          },
        });
        added++;
      }
    }
    return NextResponse.json({ ok: true, total: members.length, added });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
