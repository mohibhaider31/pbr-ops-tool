// Server-side capability guard for API routes.
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { can, type Capability } from "@/lib/permissions";

// Returns null if allowed, or a NextResponse error if not.
export async function requireCap(cap: Capability): Promise<NextResponse | null> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can({ role: viewer.role, isAdmin: viewer.isAdmin }, cap))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
