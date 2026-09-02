"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Redeem a password-reset token. Resetting also ends every existing session
// for that account, so an old cookie stops working.
export default function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready = password.length >= 12 && password === confirm && !!token;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/local/reset-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not reset password");
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper text-ink font-sans p-6">
      <div className="w-[400px] flex flex-col items-center gap-8">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[14px] tracking-[.06em] px-[9px] py-[5px]">PBR</span>
          <span className="text-[17px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="w-full bg-white border border-border p-8 flex flex-col gap-5">
          {done ? (
            <div className="flex flex-col gap-4">
              <span className="text-[18px] font-semibold">Password updated</span>
              <p className="m-0 text-[13px] text-muted leading-[1.55]">
                You&apos;ve been signed out everywhere else. Sign in with your new password.
              </p>
              <button
                onClick={() => router.push("/login")}
                className="h-[40px] bg-ink text-white text-[13px] font-semibold"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">Choose a new password</h1>
                <p className="m-0 text-[13px] text-muted leading-[1.55]">
                  This link works once and expires an hour after it was issued.
                </p>
              </div>

              {!token && (
                <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark">
                  This link is missing its token. Ask an admin for a new one.
                </div>
              )}

              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (min 12 characters)"
                className="h-[40px] px-3 border border-border outline-none text-[13.5px] focus:border-ink"
              />
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Confirm password"
                className="h-[40px] px-3 border border-border outline-none text-[13.5px] focus:border-ink"
              />
              {password.length > 0 && password.length < 12 && (
                <span className="text-[12px] text-amberText">At least 12 characters.</span>
              )}
              {confirm.length > 0 && password !== confirm && (
                <span className="text-[12px] text-accent">Passwords don&apos;t match.</span>
              )}
              {error && <span className="text-[12.5px] text-accent">{error}</span>}

              <button
                onClick={submit}
                disabled={!ready || busy}
                className="h-[42px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
              >
                {busy ? "Updating…" : "Set new password"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
