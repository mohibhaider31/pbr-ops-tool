// Poker estimation helpers: the card deck and reveal analysis.

export const DECK = ["1", "2", "3", "5", "8", "13", "21", "?"];

export type Vote = { voterId: string; voterName: string; card: string };

export type RevealAnalysis = {
  numeric: number[];
  spreadLabel: string;
  median: number | null;
  suggested: number | null; // nearest deck value to the median
  verdict: string;
  safeToAccept: boolean;
};

const NUMERIC_DECK = [1, 2, 3, 5, 8, 13, 21];

function nearestDeckValue(n: number): number {
  return NUMERIC_DECK.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), NUMERIC_DECK[0]);
}

export function analyze(votes: Vote[]): RevealAnalysis {
  const numeric = votes
    .map((v) => v.card)
    .filter((c) => c !== "?")
    .map(Number)
    .sort((a, b) => a - b);

  const hasUnknowns = votes.some((v) => v.card === "?");

  if (numeric.length === 0) {
    return {
      numeric: [],
      spreadLabel: "No numeric votes",
      median: null,
      suggested: null,
      verdict: hasUnknowns ? "Everyone voted ? — the story needs clarification before estimating." : "No votes yet.",
      safeToAccept: false,
    };
  }

  const min = numeric[0];
  const max = numeric[numeric.length - 1];
  const mid = Math.floor(numeric.length / 2);
  const median =
    numeric.length % 2 ? numeric[mid] : (numeric[mid - 1] + numeric[mid]) / 2;
  const suggested = nearestDeckValue(median);

  // "Distance" in deck steps between min and max — a better spread measure
  // than raw difference, since the deck is non-linear (8 to 13 is one step).
  const stepIndex = (v: number) => NUMERIC_DECK.indexOf(nearestDeckValue(v));
  const spreadSteps = stepIndex(max) - stepIndex(min);

  let verdict: string;
  let safe: boolean;

  if (min === max && !hasUnknowns) {
    verdict = "Unanimous — accept with confidence.";
    safe = true;
  } else if (spreadSteps <= 1 && !hasUnknowns) {
    verdict = "Tight agreement — safe to accept the suggested estimate.";
    safe = true;
  } else if (spreadSteps <= 2) {
    verdict = hasUnknowns
      ? "Some spread and a ? vote — worth a quick discussion before accepting."
      : "Moderate spread — a brief discussion will help, but it's close.";
    safe = false;
  } else {
    verdict = "Wide spread — discuss the highest and lowest before re-voting.";
    safe = false;
  }

  const spreadLabel = min === max ? `All ${min}` : `${min} – ${max}${hasUnknowns ? " (+?)" : ""}`;

  return { numeric, spreadLabel, median, suggested, verdict, safeToAccept: safe };
}

// Short, human-friendly invite code.
export function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
