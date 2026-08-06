export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeGuest, guestCookieString } from "@/lib/guest";

// A guest joins a poker session using its code + a display name. No account,
// no Atlassian login. Grants a guest cookie bound to this one session.
export async function POST(req: Request) {
  const { code, name }: { code?: string; name?: string } = await req.json();
  if (!code?.trim() || !name?.trim())
    return NextResponse.json({ error: "Enter the session code and your name" }, { status: 400 });

  const session = await prisma.pokerSession.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!session) return NextResponse.json({ error: "No session with that code" }, { status: 404 });

  const guest = makeGuest(name, session.code);
  const res = NextResponse.json({ ok: true, code: session.code, name: guest.name });
  res.headers.append("Set-Cookie", guestCookieString(guest));
  return res;
}
