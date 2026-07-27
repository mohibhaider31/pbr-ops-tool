export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, clearCookieString } from "@/lib/session";

async function doLogout() {
  const id = cookies().get("pbr_session")?.value;
  if (id) await deleteSession(id);
}

export async function POST() {
  await doLogout();
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookieString());
  return res;
}

export async function GET(req: Request) {
  await doLogout();
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.headers.append("Set-Cookie", clearCookieString());
  return res;
}
