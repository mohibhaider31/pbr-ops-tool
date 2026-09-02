"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Redeem an invite and set a password. Public by necessity — the token in the
// URL is the authorisation, and it is single-use and time-limited.
export default function AcceptInvitePage() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= 12 && password === confirm && !!token;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/local/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not accept invite");
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper text-ink font-sans p-6">
      <div className="w-[400px] flex flex-col items-center gap-8">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[14px] tracking-[.06em] px-[9px] py-[5px]">
            PBR
          </span>
          <span className="text-[17px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="w-full bg-white border border-border p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">Set your password</h1>
            <p className="m-0 text-[13px] text-muted leading-[1.55]">
              You&apos;ve been invited as a stakeholder. Choose a password and you&apos;ll have
              read-only access to the roadmap.
            </p>
          </div>

          {!token && (
            <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark">
              This link is missing its invite token. Please use the full link you were sent.
            </div>
          )}

          <div className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 12 characters)"
              className="h-[40px] px-3 border border-border bg-white outline-none text-[13.5px] focus:border-ink"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Confirm password"
              className="h-[40px] px-3 border border-border bg-white outline-none text-[13.5px] focus:border-ink"
            />
            {tooShort && <span className="text-[12px] text-amberText">At least 12 characters.</span>}
            {mismatch && <span className="text-[12px] text-accent">Passwords don&apos;t match.</span>}
            {error && <span className="text-[12.5px] text-accent">{error}</span>}

            <button
              onClick={submit}
              disabled={!ready || busy}
              className="h-[42px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
            >
              {busy ? "Setting up…" : "Set password & continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
