// Capability model. Single source of truth for what each role can do, used
// both server-side (to enforce) and client-side (to hide controls).

export type BoardRole = "PO" | "BA" | "DEVELOPER" | "VIEWER";

export type Capability =
  | "prioritize" // reorder backlog
  | "assign" // assign/unassign reviewers
  | "review" // mark own review done, comment
  | "pbr_send" // run PBR hops up to Pending PO Review (BA-level)
  | "pbr_approve" // final hop to Ready For Dev (PO only)
  | "pipeline_edit" // change layer statuses / owners / sprints
  | "poker_vote" // vote in planning poker (later)
  | "manage_people"; // Settings -> People (admin only)

// Board-role capabilities. Admin is handled separately (global override for
// manage_people and general access).
const ROLE_CAPS: Record<BoardRole, Capability[]> = {
  PO: [
    "prioritize",
    "assign",
    "review",
    "pbr_send",
    "pbr_approve",
    "pipeline_edit",
    "poker_vote",
  ],
  BA: ["prioritize", "assign", "review", "pbr_send", "pipeline_edit", "poker_vote"],
  DEVELOPER: ["review", "pipeline_edit", "poker_vote"],
  VIEWER: [],
};

// Capabilities that ultimately WRITE to Jira. These require a linked Atlassian
// identity, because the write happens under the user's own OAuth token. An
// account with no Atlassian identity could only reach Jira via the app-level
// API token — i.e. acting in the org's Jira without passing the org's own
// authentication. That is the one thing this design refuses to allow.
//
// Everything else touches only our own database, so it is gated by ROLE alone
// and works fine for an account that hasn't linked Atlassian yet.
const JIRA_WRITE_CAPS: Capability[] = ["pbr_send", "pbr_approve"];

export type Viewer = {
  role: BoardRole;
  isAdmin: boolean;
  // "atlassian" = has a linked Atlassian identity, can act in Jira.
  // "local"     = invited account, not linked (yet). Full use of in-tool
  //               features per their role; no Jira writes.
  authType?: string;
};

export function requiresAtlassian(cap: Capability): boolean {
  return JIRA_WRITE_CAPS.includes(cap);
}

export function can(viewer: Viewer | null, cap: Capability): boolean {
  if (!viewer) return false;

  // HARD BLOCK on Jira-writing capabilities for accounts with no linked
  // Atlassian identity. Checked BEFORE role and before the isAdmin override,
  // so a misconfigured admin flag cannot grant it either.
  if (viewer.authType === "local" && requiresAtlassian(cap)) return false;

  if (cap === "manage_people") return viewer.isAdmin;
  // Admins can do everything a PO can, plus manage people.
  if (viewer.isAdmin) return true;
  return ROLE_CAPS[viewer.role].includes(cap);
}

export const ROLE_LABEL: Record<BoardRole, string> = {
  PO: "Product Owner",
  BA: "Business Analyst",
  DEVELOPER: "Developer",
  VIEWER: "Viewer",
};
