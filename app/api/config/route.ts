import { NextResponse } from "next/server";

const PBR_DONE_PATH = (
  process.env.JIRA_PBR_DONE_PATH ||
  "Requirement Analysis,Requirement Documentation,Pending PO Review,Ready For Dev"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET() {
  return NextResponse.json({ pbrDonePath: PBR_DONE_PATH });
}
