export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url));
}
