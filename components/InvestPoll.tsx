"use client";

import { useState, useEffect } from "react";

// INVEST scoring poll. Each participant gives 0/1 for each of the 6 components.
// Displayed as I N V E S T across, each letter with a vertical 1/0 toggle.
// Team score = average of everyone's 0-6 totals, out of 6 (computed server-side).

type Mine = {
  independent: boolean; negotiable: boolean; valuable: boolean;
  estimable: boolean; small: boolean; testable: boolean;
};
type Invest = { open: boolean; submitted: number; score: number | null; mine: Mine | null };

const LETTERS: { key: keyof Mine; letter: string; word: string }[] = [
  { key: "independent", letter: "I", word: "Independent" },
  { key: "negotiable", letter: "N", word: "Negotiable" },
  { key: "valuable", letter: "V", word: "Valuable" },
  { key: "estimable", letter: "E", word: "Estimable" },
  { key: "small", letter: "S", word: "Small" },
  { key: "testable", letter: "T", word: "Testable" },
];

const EMPTY: Mine = {
  independent: false, negotiable: false, valuable: false,
  estimable: false, small: false, testable: false,
};

export default function InvestPoll({
  invest,
  jiraKey,
  isOrganizer,
  onSubmit,
  onClose,
}: {
  invest: Invest;
  jiraKey: string;
  isOrganizer: boolean;
  onSubmit: (scores: Mine) => void;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<Mine>(invest.mine ?? EMPTY);
  const [submitted, setSubmitted] = useState(!!invest.mine);

  // Keep local state in sync if server says we already submitted.
  useEffect(() => {
    if (invest.mine) { setScores(invest.mine); setSubmitted(true); }
  }, [invest.mine]);

  const myTotal = Object.values(scores).filter(Boolean).length;

  const toggle = (key: keyof Mine, val: boolean) =>
    setScores((s) => ({ ...s, [key]: val }));

  const submit = () => { onSubmit(scores); setSubmitted(true); };

  return (
    <div className="fixed inset-0 bg-ink/40 z-[80] flex items-center justify-center p-6">
      <div className="w-[520px] bg-white border border-[#C8C3B8] shadow-xl">
        <div className="px-6 pt-5 pb-3 border-b border-borderLight text-center">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted2">{jiraKey}</span>
          <h3 className="m-0 text-[16px] font-semibold mt-[2px]">INVEST scoring</h3>
          <p className="m-0 mt-1 text-[12px] text-muted">Score each component 1 (yes) or 0 (no). The team average becomes the story&apos;s INVEST score.</p>
        </div>

        <div className="px-6 py-6">
          {/* I N V E S T with vertical toggles */}
          <div className="flex items-start justify-center gap-3">
            {LETTERS.map(({ key, letter, word }) => {
              const on = scores[key];
              return (
                <div key={key} className="flex flex-col items-center gap-2" style={{ width: 68 }}>
                  <span className="text-[30px] font-bold leading-none tracking-tight">{letter}</span>
                  <span className="text-[9px] font-mono tracking-[.03em] text-muted3 h-[22px] text-center leading-tight">{word}</span>
                  {/* vertical 1 / 0 toggle */}
                  <div className="flex flex-col border border-border overflow-hidden w-[40px]">
                    <button
                      onClick={() => toggle(key, true)}
                      className={`h-[34px] text-[14px] font-bold font-mono transition-colors ${on ? "bg-good text-white" : "bg-white text-muted3 hover:bg-cream"}`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => toggle(key, false)}
                      className={`h-[34px] text-[14px] font-bold font-mono border-t border-border transition-colors ${!on ? "bg-ink text-white" : "bg-white text-muted3 hover:bg-cream"}`}
                    >
                      0
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* my running total */}
          <div className="flex items-center justify-center gap-2 mt-5">
            <span className="text-[12px] text-muted2">Your score:</span>
            <span className="text-[18px] font-bold">{myTotal}<span className="text-[12px] text-muted3">/6</span></span>
          </div>
        </div>

        <div className="px-6 pb-5 flex flex-col gap-3">
          <button
            onClick={submit}
            className={`h-[42px] text-[13px] font-semibold transition-colors ${submitted ? "bg-white border border-good text-good" : "bg-ink text-white"}`}
          >
            {submitted ? "Update my score ✓" : "Submit my score"}
          </button>

          <div className="flex items-center justify-center gap-4 font-mono text-[11px] text-muted2">
            <span>{invest.submitted} submitted</span>
          </div>

          {isOrganizer && (
            <button
              onClick={onClose}
              disabled={invest.submitted === 0}
              className="h-[38px] border border-border text-[12.5px] font-semibold text-ink hover:border-ink disabled:opacity-40 transition-colors"
            >
              Close &amp; record team INVEST score
            </button>
          )}
          {!isOrganizer && (
            <p className="m-0 text-center text-[11.5px] text-muted3">
              {submitted ? "Submitted — waiting for the organizer to close." : "Submit your score above."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
