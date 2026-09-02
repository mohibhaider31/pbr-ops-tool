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
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

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

      <p className="m-0 text-[11px] text-muted3 leading-[1.5]">
        Stakeholder accounts are read-only and are created by invitation. If you work on the team,
        use Atlassian above instead.
      </p>
    </div>
  );
}
