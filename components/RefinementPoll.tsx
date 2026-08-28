"use client";

// Post-accept "Does this story still need refinement?" poll. Shown to everyone
// in the session (including guests) after story points are accepted. Each person
// votes yes/no; the organizer sees the tally and closes it. A >50% "needs
// refinement" majority increments the story's re-discussion flag count.

type Refinement = {
  open: boolean;
  myVote: boolean | null;
  voted: number;
  yes: number;
  score: number | null;
};

export default function RefinementPoll({
  refinement,
  jiraKey,
  isOrganizer,
  onVote,
  onClose,
}: {
  refinement: Refinement;
  jiraKey: string;
  isOrganizer: boolean;
  onVote: (needsWork: boolean) => void;
  onClose: () => void;
}) {
  const { myVote, voted, yes, open, score } = refinement;
  const no = voted - yes;

  return (
    <div className="fixed inset-0 bg-ink/40 z-[80] flex items-center justify-center p-6">
      <div className="w-[440px] bg-white border border-[#C8C3B8] shadow-xl">
        <div className="px-5 pt-4 pb-3 border-b border-borderLight">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted2">{jiraKey}</span>
          <h3 className="m-0 text-[16px] font-semibold mt-[2px]">Does this story still need refinement?</h3>
          <p className="m-0 mt-1 text-[12px] text-muted">
            Points are recorded. Now flag whether the story itself needs more work before dev — this feeds its re-discussion score.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {open ? (
            <>
              <div className="flex gap-3">
                <button
                  onClick={() => onVote(true)}
                  className={`flex-1 h-[46px] border text-[13px] font-semibold transition-colors ${
                    myVote === true ? "bg-amberText text-white border-amberText" : "bg-white border-border hover:border-amberText text-amberText"
                  }`}
                >
                  Needs refinement
                </button>
                <button
                  onClick={() => onVote(false)}
                  className={`flex-1 h-[46px] border text-[13px] font-semibold transition-colors ${
                    myVote === false ? "bg-good text-white border-good" : "bg-white border-border hover:border-good text-good"
                  }`}
                >
                  Good to go
                </button>
              </div>

              {/* Live tally */}
              <div className="flex items-center justify-center gap-5 font-mono text-[11px] text-muted2">
                <span><span className="text-amberText font-semibold">{yes}</span> needs work</span>
                <span><span className="text-good font-semibold">{no}</span> good</span>
                <span>{voted} voted</span>
              </div>

              {isOrganizer ? (
                <button
                  onClick={onClose}
                  disabled={voted === 0}
                  className="h-[40px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Close poll &amp; record score
                </button>
              ) : (
                <p className="m-0 text-center text-[11.5px] text-muted3">
                  {myVote === null ? "Cast your vote." : "Vote recorded — waiting for the organizer to close the poll."}
                </p>
              )}
            </>
          ) : (
            // Poll closed — show the resulting score briefly.
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="font-mono text-[10px] tracking-[.1em] text-muted3">RE-DISCUSSION SCORE</span>
              <span className="text-[40px] font-bold leading-none">{score ?? "–"}<span className="text-[18px] text-muted3">/5</span></span>
              <p className="m-0 text-[12px] text-muted text-center">
                {yes > no ? "Flagged for refinement — score reduced." : "Cleared — no refinement needed."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
