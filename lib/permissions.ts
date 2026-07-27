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

export type Viewer = {
  role: BoardRole;
  isAdmin: boolean;
};

export function can(viewer: Viewer | null, cap: Capability): boolean {
  if (!viewer) return false;
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
