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
  average: number | null; // mean of numeric votes
  mode: string | null; // most-voted card (the "Most Votes" value)
  confidence: number | null; // % of ALL votes matching the mode (0-100)
  distribution: { card: string; count: number }[]; // sorted desc by count
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

  // Vote distribution across ALL cards (including ?), sorted by count desc.
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.card, (counts.get(v.card) || 0) + 1);
  const distribution = [...counts.entries()]
    .map(([card, count]) => ({ card, count }))
    .sort((a, b) => b.count - a.count);

  // Mode = the most-voted card; confidence = its share of all votes.
  const mode = distribution.length ? distribution[0].card : null;
  const confidence =
    votes.length && mode !== null
      ? Math.round((distribution[0].count / votes.length) * 100)
      : null;

  const average =
    numeric.length > 0
      ? Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) / 100
      : null;

  if (numeric.length === 0) {
    return {
      numeric: [],
      spreadLabel: "No numeric votes",
      median: null,
      suggested: null,
      verdict: hasUnknowns ? "Everyone voted ? — the story needs clarification before estimating." : "No votes yet.",
      safeToAccept: false,
      average: null,
      mode,
      confidence,
      distribution,
    };
  }

  const min = numeric[0];
  const max = numeric[numeric.length - 1];
  const mid = Math.floor(numeric.length / 2);
  const median =
    numeric.length % 2 ? numeric[mid] : (numeric[mid - 1] + numeric[mid]) / 2;
  const suggested = nearestDeckValue(median);

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

  return { numeric, spreadLabel, median, suggested, verdict, safeToAccept: safe, average, mode, confidence, distribution };
}

// Short, human-friendly invite code.
export function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
