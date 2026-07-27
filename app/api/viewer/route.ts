export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ viewer: null });
  return NextResponse.json({
    viewer: {
      name: viewer.name,
      email: viewer.email,
      avatarUrl: viewer.avatarUrl,
      role: viewer.role,
      isAdmin: viewer.isAdmin,
    },
  });
}
