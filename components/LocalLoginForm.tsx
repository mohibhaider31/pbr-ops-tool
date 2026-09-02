"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Email + password sign-in for stakeholder accounts (people without an
// Atlassian licence). Collapsed by default so the Atlassian route stays the
// obvious primary path for the team.
export default function LocalLoginForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  // Set when the password was right but a second factor is required.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const requestReset = async () => {
    if (!email.trim()) { setError("Enter your email first, then tap reset."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/local/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      setResetSent(d.message || "If that account exists, a reset link is on its way.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Sign-in failed");
      if (d.requires2fa) {
        // No session yet — hold the challenge and ask for the code.
        setChallenge(d.challenge);
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!challenge || code.replace(/\s/g, "").length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/local/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Verification failed");
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  // Second step: the password was accepted, now the code.
  if (challenge) {
    return (
      <div className="w-full flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-borderLight" />
          <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">TWO-STEP VERIFICATION</span>
          <span className="h-px flex-1 bg-borderLight" />
        </div>
        <p className="m-0 text-[12px] text-muted leading-[1.5]">
          Enter the 6-digit code from your authenticator app, or one of your backup codes.
        </p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCode()}
          placeholder="000000"
          className="h-[44px] px-3 border border-border bg-white outline-none font-mono text-[18px] tracking-[.3em] text-center focus:border-ink"
        />
        {error && <div className="text-[12.5px] text-accent">{error}</div>}
        <button
          onClick={submitCode}
          disabled={busy || code.replace(/\s/g, "").length < 6}
          className="h-[40px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button
          onClick={() => { setChallenge(null); setCode(""); setError(null); }}
          className="self-start text-[11.5px] text-muted2 hover:text-key underline underline-offset-2"
        >
          Start over
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12.5px] text-muted2 hover:text-key underline underline-offset-2"
      >
        Sign in with email instead
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-borderLight" />
        <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">STAKEHOLDER ACCESS</span>
        <span className="h-px flex-1 bg-borderLight" />
      </div>

      <input
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="h-[40px] px-3 border border-border bg-white outline-none text-[13.5px] focus:border-ink"
      />
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Password"
        className="h-[40px] px-3 border border-border bg-white outline-none text-[13.5px] focus:border-ink"
      />

      {error && <div className="text-[12.5px] text-accent">{error}</div>}

      <button
        onClick={submit}
        disabled={busy || !email.trim() || !password}
        className="h-[40px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {resetSent ? (
        <p className="m-0 text-[11.5px] text-good leading-[1.5]">{resetSent}</p>
      ) : (
        <button
          onClick={requestReset}
          disabled={busy}
          className="self-start text-[11.5px] text-muted2 hover:text-key underline underline-offset-2 disabled:opacity-50"
        >
          Forgot your password?
        </button>
      )}

      <p className="m-0 text-[11px] text-muted3 leading-[1.5]">
        Stakeholder accounts are read-only and are created by invitation. If you work on the team,
        use Atlassian above instead.
      </p>
    </div>
  );
}
