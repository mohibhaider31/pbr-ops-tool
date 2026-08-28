"use client";

import { useMemo, useState } from "react";

// INVEST scoring modal — visual/interaction design per the Claude Design handoff.
// Three-state toggles (untouched grey / 1 green / 0 red), overshoot knob
// animation, hover-to-reveal criterion questions, and a results roll-up phase.
// CSS is inlined so the exact palette/animations ship without build config.

type Mine = {
  independent: boolean; negotiable: boolean; valuable: boolean;
  estimable: boolean; small: boolean; testable: boolean;
};
type Rollup = { key: string; ones: number }[];
type Invest = {
  open: boolean;
  submitted: number;
  score: number | null;
  rollup?: Rollup;
  mine: Mine | null;
};

const LETTERS: { k: keyof Mine; letter: string; word: string; q: string }[] = [
  { k: "independent", letter: "I", word: "Independent", q: "Can it ship without waiting on another story?" },
  { k: "negotiable", letter: "N", word: "Negotiable", q: "Is there still room to discuss the how?" },
  { k: "valuable", letter: "V", word: "Valuable", q: "Does a user or the business actually feel the benefit?" },
  { k: "estimable", letter: "E", word: "Estimable", q: "Do we know enough to size it honestly?" },
  { k: "small", letter: "S", word: "Small", q: "Does it fit comfortably inside one sprint?" },
  { k: "testable", letter: "T", word: "Testable", q: "Can we prove it is done without arguing?" },
];

const CSS = `
.inv-scrim{position:fixed;inset:0;background:rgba(12,11,10,.72);z-index:80;display:flex;align-items:center;justify-content:center;padding:24px}
.inv-modal{width:720px;max-width:100%;background:#171613;border:1px solid #3A3730;color:#EFEBE2;font-family:Archivo,system-ui,sans-serif;animation:inv-rise .22s ease both}
@keyframes inv-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.inv-head{display:flex;align-items:flex-start;gap:14px;padding:20px 26px 16px;border-bottom:1px solid #2C2924}
.inv-kicker{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.12em;color:#8B8579}
.inv-title{font-size:15px;font-weight:600;letter-spacing:-.01em}
.inv-x{margin-left:auto;background:none;border:none;color:#77726A;font-size:18px;line-height:1;cursor:pointer}
.inv-x:hover{color:#EFEBE2}
.inv-body{padding:26px 26px 20px;display:flex;flex-direction:column;gap:20px;align-items:center}
.inv-cols{display:flex;gap:22px;justify-content:center}
.inv-col{display:flex;flex-direction:column;align-items:center;gap:11px;width:66px}
.inv-letter{font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:700;line-height:1;letter-spacing:.02em;color:#EFEBE2;transition:color .18s ease}
.inv-col[data-v="1"] .inv-letter{color:#7FC79B}
.inv-col[data-v="0"] .inv-letter{color:#E5765A}
.inv-track{position:relative;width:52px;height:88px;border:1px solid #3A3730;background:#1C1A17;cursor:pointer;transition:border-color .18s ease}
.inv-col[data-v="1"] .inv-track{border-color:#3E7A5A}
.inv-col[data-v="0"] .inv-track{border-color:#7A2E1A}
.inv-knob{position:absolute;left:4px;right:4px;top:4px;height:40px;background:#2A2721;z-index:1;transform:translateY(0);transition:transform .2s cubic-bezier(.4,1.4,.5,1),background .18s ease}
.inv-col[data-v="1"] .inv-knob{background:#2E8A5F}
.inv-col[data-v="0"] .inv-knob{background:#A32C0C;transform:translateY(44px)}
.inv-zone{position:absolute;left:0;right:0;height:44px;z-index:2;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:#5F5B53}
.inv-zone--one{top:0}
.inv-zone--zero{bottom:0}
.inv-col[data-v="1"] .inv-zone--one,.inv-col[data-v="0"] .inv-zone--zero{color:#fff}
.inv-word{font-size:10.5px;text-align:center;color:#6E6A60;transition:color .18s ease}
.inv-col[data-v="1"] .inv-word{color:#A8C9B4}
.inv-col[data-v="0"] .inv-word{color:#D9917E}
.inv-hint{min-height:34px;width:100%;padding-top:14px;border-top:1px solid #2C2924;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:#A8A296;text-align:center}
.inv-foot{display:flex;align-items:center;gap:16px;padding:0 26px 22px}
.inv-score{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;transition:color .18s ease}
.inv-score[data-band="low"]{color:#E5765A}
.inv-score[data-band="mid"]{color:#EFEBE2}
.inv-score[data-band="high"]{color:#7FC79B}
.inv-score-cap{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.09em;color:#6E6A60}
.inv-spacer{flex:1}
.inv-btn{height:42px;padding:0 20px;border:none;font-size:13px;font-weight:600;cursor:pointer;color:#fff;background:#DA3B12}
.inv-btn:hover{background:#B92F0D}
.inv-btn:disabled{background:#2A2721;color:#6E6A60;cursor:not-allowed}
.inv-btn--ghost{height:42px;padding:0 16px;background:none;border:1px solid #3A3730;color:#A8A296;font-size:13px;font-weight:500;cursor:pointer}
.inv-btn--ghost:hover{border-color:#EFEBE2;color:#EFEBE2}
.inv-res{padding:22px 26px 8px;display:flex;flex-direction:column;gap:16px}
.inv-res-head{display:flex;align-items:baseline;gap:12px}
.inv-res-h{font-size:22px;font-weight:600;letter-spacing:-.02em}
.inv-res-sub{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.09em;color:#8B8579}
.inv-row{display:flex;align-items:center;gap:12px}
.inv-row-l{font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:700;width:16px}
.inv-row-w{font-size:12.5px;color:#A8A296;width:96px}
.inv-bar{flex:1;height:6px;background:#2A2721}
.inv-bar>i{display:block;height:6px;transition:width .3s ease}
.inv-row-t{font-family:'JetBrains Mono',monospace;font-size:11px;width:44px;text-align:right}
.inv-row[data-good="true"] .inv-row-l,.inv-row[data-good="true"] .inv-row-t{color:#7FC79B}
.inv-row[data-good="true"] .inv-bar>i{background:#2E8A5F}
.inv-row[data-good="false"] .inv-row-l,.inv-row[data-good="false"] .inv-row-t{color:#E5765A}
.inv-row[data-good="false"] .inv-bar>i{background:#C13A16}
.inv-weak{border-left:2px solid #DA3B12;padding:2px 0 2px 12px;font-size:12.5px;color:#E5765A;line-height:1.5}
.inv-verdict{font-size:13px;color:#A8A296;line-height:1.55}
@media (prefers-reduced-motion:reduce){.inv-modal{animation:none}.inv-knob,.inv-bar>i,.inv-letter,.inv-word,.inv-track,.inv-score{transition-duration:0s}}
`;

export default function InvestPoll({
  invest,
  jiraKey,
  summary,
  isOrganizer,
  onSubmit,
  onClose,
}: {
  invest: Invest;
  jiraKey: string;
  summary?: string;
  isOrganizer: boolean;
  onSubmit: (scores: Mine) => void;
  onClose: () => void;
}) {
  const initialDraft: Partial<Record<keyof Mine, 0 | 1>> = {};
  if (invest.mine) for (const l of LETTERS) initialDraft[l.k] = invest.mine[l.k] ? 1 : 0;

  const [draft, setDraft] = useState<Partial<Record<keyof Mine, 0 | 1>>>(initialDraft);
  const [hover, setHover] = useState<keyof Mine | null>(null);
  const [phase, setPhase] = useState<"vote" | "results">(invest.mine ? "results" : "vote");
  const [busy, setBusy] = useState(false);

  const answered = Object.keys(draft).length;
  const mine = LETTERS.filter((l) => draft[l.k] === 1).length;
  const band = mine >= 5 ? "high" : mine >= 3 ? "mid" : "low";
  const hovered = LETTERS.find((l) => l.k === hover);
  const hint = hovered ? `${hovered.word} — ${hovered.q}` : "Six calls, one each. 1 if it holds, 0 if it does not.";

  const roll = useMemo(() => {
    const total = invest.submitted || 0;
    const byKey = new Map((invest.rollup ?? []).map((r) => [r.key, r.ones]));
    const rows = LETTERS.map((l) => {
      const ones = byKey.get(l.k) ?? 0;
      const denom = total || 1;
      return { ...l, ones, total, pct: Math.round((ones / denom) * 100), good: ones * 2 > total };
    });
    const clear = rows.filter((r) => r.good).length;
    const weak = rows.filter((r) => !r.good).sort((a, b) => a.ones - b.ones)[0];
    return { rows, clear, weak, total };
  }, [invest.rollup, invest.submitted]);

  const verdict =
    roll.clear === 6
      ? "Clean on all six. Nothing blocking the handoff to dev."
      : roll.clear >= 4
        ? "Good enough to move, but note the weak criteria in the story before dev picks it up."
        : "Too thin. Worth another refinement pass before this leaves the board.";

  const submit = () => {
    if (answered < 6 || busy) return;
    setBusy(true);
    try {
      onSubmit({
        independent: draft.independent === 1, negotiable: draft.negotiable === 1, valuable: draft.valuable === 1,
        estimable: draft.estimable === 1, small: draft.small === 1, testable: draft.testable === 1,
      });
      setPhase("results");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inv-scrim" role="dialog" aria-modal="true" aria-label={`INVEST check for ${jiraKey}`}>
      <style>{CSS}</style>
      <div className="inv-modal">
        <div className="inv-head">
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <span className="inv-kicker">INVEST CHECK · {jiraKey}</span>
            <span className="inv-title">{summary}</span>
          </div>
          <button className="inv-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {phase === "vote" && (
          <>
            <div className="inv-body">
              <div className="inv-cols">
                {LETTERS.map((l) => {
                  const v = draft[l.k];
                  return (
                    <div key={l.k} className="inv-col" data-v={v === undefined ? "" : v}
                         onMouseEnter={() => setHover(l.k)} onFocus={() => setHover(l.k)}>
                      <span className="inv-letter">{l.letter}</span>
                      <div className="inv-track" role="radiogroup" aria-label={`${l.word}: ${l.q}`}>
                        <div className="inv-knob" />
                        <button className="inv-zone inv-zone--one" role="radio" aria-checked={v === 1}
                                onClick={() => setDraft((d) => ({ ...d, [l.k]: 1 }))}>1</button>
                        <button className="inv-zone inv-zone--zero" role="radio" aria-checked={v === 0}
                                onClick={() => setDraft((d) => ({ ...d, [l.k]: 0 }))}>0</button>
                      </div>
                      <span className="inv-word">{l.word}</span>
                    </div>
                  );
                })}
              </div>
              <div className="inv-hint" aria-live="polite">{hint}</div>
            </div>
            <div className="inv-foot">
              <span className="inv-score" data-band={band}>{mine} / 6</span>
              <span className="inv-score-cap">YOUR SCORE</span>
              <span className="inv-spacer" />
              <button className="inv-btn--ghost" onClick={onClose}>Skip</button>
              <button className="inv-btn" disabled={answered < 6 || busy} onClick={submit}>
                {answered < 6 ? `Score all six to submit (${answered}/6)` : busy ? "Submitting…" : "Submit my score"}
              </button>
            </div>
          </>
        )}

        {phase === "results" && (
          <>
            <div className="inv-res">
              <div className="inv-res-head">
                <span className="inv-res-h">{roll.clear} of 6 criteria clear</span>
                <span className="inv-res-sub">{roll.total} team member{roll.total === 1 ? "" : "s"} scored{invest.score != null ? ` · avg ${invest.score}/6` : ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {roll.rows.map((r) => (
                  <div key={r.k} className="inv-row" data-good={String(r.good)}>
                    <span className="inv-row-l">{r.letter}</span>
                    <span className="inv-row-w">{r.word}</span>
                    <div className="inv-bar"><i style={{ width: `${r.pct}%` }} /></div>
                    <span className="inv-row-t">{r.ones} / {r.total}</span>
                  </div>
                ))}
              </div>
              {roll.weak && (
                <div className="inv-weak">{roll.weak.word} is the weakest — {roll.weak.q.toLowerCase()}</div>
              )}
              <span className="inv-verdict">{verdict}</span>
            </div>
            <div className="inv-foot">
              {invest.open && (
                <button className="inv-btn--ghost" onClick={() => { setDraft({}); setPhase("vote"); }}>Re-score</button>
              )}
              <span className="inv-spacer" />
              {isOrganizer && invest.open ? (
                <button className="inv-btn" onClick={onClose}>Close &amp; record</button>
              ) : (
                <button className="inv-btn--ghost" onClick={onClose}>Done</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
