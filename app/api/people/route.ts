export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

// List everyone. Any authenticated user can read the roster; only admins
// can mutate (handled in PATCH/POST below).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const people = await prisma.person.findMany({ orderBy: [{ isAdmin: "desc" }, { name: "asc" }] });
  return NextResponse.json({
    people: people.map((p) => ({
      id: p.id,
      accountId: p.accountId,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      role: p.role,
      isAdmin: p.isAdmin,
      source: p.source,
      active: !!p.firstLoginAt, // has logged into the tool at least once
      firstLoginAt: p.firstLoginAt ? p.firstLoginAt.toISOString() : null,
    })),
  });
}

// Manually add a person by email. Admin only.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { name, email, role }: { name?: string; email: string; role?: string } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const person = await prisma.person.upsert({
    where: { email: email.trim() },
    create: {
      email: email.trim(),
      name: name?.trim() || email.trim(),
      role: (role as any) || "DEVELOPER",
      source: "manual",
    },
    update: {},
  });
  return NextResponse.json({ person });
}
