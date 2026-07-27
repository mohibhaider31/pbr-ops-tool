// Pipeline handoff-state derivation.
// Given the three per-layer statuses for a story, derive the single
// rolled-up state the tracker surfaces. Derived (never stored) so it
// can't drift from the underlying layer cells.

export type Layer = "ENGINE" | "MIDDLEWARE" | "FRONTEND";
export type LayerStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";

export const LAYERS: Layer[] = ["ENGINE", "MIDDLEWARE", "FRONTEND"];
export const LAYER_LABEL: Record<Layer, string> = {
  ENGINE: "Engine",
  MIDDLEWARE: "Middleware",
  FRONTEND: "Frontend",
};

export type HandoffState =
  | "NOT_STARTED" // nothing begun
  | "IN_ENGINE" // engine active, downstream untouched
  | "ENGINE_TO_MW" // engine done, MW not yet done
  | "MW_TO_FE" // engine + MW done, FE not yet done
  | "STALLED" // a layer done, next not started (immediate flag)
  | "BLOCKED" // any layer blocked
  | "SHIPPED"; // all three done

export const HANDOFF_META: Record<
  HandoffState,
  { label: string; tone: "neutral" | "active" | "warn" | "bad" | "good" }
> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_ENGINE: { label: "In Engine", tone: "active" },
  ENGINE_TO_MW: { label: "Engine → MW", tone: "active" },
  MW_TO_FE: { label: "MW → FE", tone: "active" },
  STALLED: { label: "Stalled", tone: "warn" },
  BLOCKED: { label: "Blocked", tone: "bad" },
  SHIPPED: { label: "Shipped", tone: "good" },
};

export type LayerCells = Record<Layer, LayerStatus>;

// Stall rule (per PO): flag immediately when an upstream layer is DONE
// but the immediately-downstream layer is still NOT_STARTED.
function isStalled(cells: LayerCells): boolean {
  if (cells.ENGINE === "DONE" && cells.MIDDLEWARE === "NOT_STARTED") return true;
  if (cells.MIDDLEWARE === "DONE" && cells.FRONTEND === "NOT_STARTED") return true;
  return false;
}

export function deriveHandoff(cells: LayerCells): HandoffState {
  const { ENGINE, MIDDLEWARE, FRONTEND } = cells;

  // Blocked takes precedence — it's the thing that needs attention most.
  if (ENGINE === "BLOCKED" || MIDDLEWARE === "BLOCKED" || FRONTEND === "BLOCKED")
    return "BLOCKED";

  if (ENGINE === "DONE" && MIDDLEWARE === "DONE" && FRONTEND === "DONE")
    return "SHIPPED";

  // Stall check before the normal in-flight states, so a done-then-untouched
  // handoff surfaces as a problem rather than looking like healthy progress.
  if (isStalled(cells)) return "STALLED";

  const anyStarted =
    ENGINE !== "NOT_STARTED" ||
    MIDDLEWARE !== "NOT_STARTED" ||
    FRONTEND !== "NOT_STARTED";
  if (!anyStarted) return "NOT_STARTED";

  if (ENGINE === "DONE" && MIDDLEWARE === "DONE") return "MW_TO_FE";
  if (ENGINE === "DONE") return "ENGINE_TO_MW";
  return "IN_ENGINE";
}

export function emptyCells(): LayerCells {
  return { ENGINE: "NOT_STARTED", MIDDLEWARE: "NOT_STARTED", FRONTEND: "NOT_STARTED" };
}
