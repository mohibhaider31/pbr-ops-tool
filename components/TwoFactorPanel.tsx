"use client";

import { useCallback, useEffect, useState } from "react";

// Two-factor enrolment for password accounts.
//
// Enrolment is deliberately two-phase: the secret is stored first, but 2FA is
// only switched on once a valid code proves the authenticator is working. A
// one-shot "here's your secret, it's now required" flow locks people out when
// the QR scan silently fails.

type Status = {
  available: boolean;
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
};

export default function TwoFactorPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(() => {
    fetch("/api/auth/2fa/status")
      .then((r) => r.json())
      .then((d) => typeof d?.enabled === "boolean" && setStatus(d))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!status) return null;
  // Atlassian users get their second factor from Atlassian itself.
  if (!status.available) return null;

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't start setup");
      setSetup({ qr: d.qr, secret: d.secret });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't enable");
      setCodes(d.backupCodes);
      setSetup(null);
      setCode("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't disable");
      setDisabling(false);
      setPassword("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold">Two-step verification</span>
          <p className="m-0 text-[12px] text-muted leading-[1.5]">
            Adds a 6-digit code from an authenticator app on top of your password.
          </p>
        </div>
        {status.enabled ? (
          <span className="flex-none inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[.05em] text-good border border-good/40 px-[8px] py-[3px]">
            <span className="w-[6px] h-[6px] rounded-full bg-good inline-block" /> ON
          </span>
        ) : (
          <span className="flex-none font-mono text-[10px] tracking-[.05em] text-muted3 border border-border px-[8px] py-[3px]">
            OFF
          </span>
        )}
      </div>

      {error && <span className="text-[12.5px] text-accent">{error}</span>}

      {/* Backup codes, shown exactly once */}
      {codes && (
        <div className="border border-good/40 bg-good/5 p-4 flex flex-col gap-3">
          <span className="text-[12.5px] font-semibold text-good">
            Two-step verification is on — save your backup codes
          </span>
          <p className="m-0 text-[12px] text-muted leading-[1.5]">
            Each works once, if you lose access to your authenticator. This is the only time
            they&apos;re shown — we only keep hashes.
          </p>
          <div className="grid grid-cols-2 gap-[6px] font-mono text-[12.5px]">
            {codes.map((c) => (
              <span key={c} className="bg-white border border-border px-2 py-1 text-center">{c}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
              className="h-[30px] px-3 text-[12px] font-semibold bg-ink text-white"
            >
              Copy all
            </button>
            <button onClick={() => setCodes(null)} className="h-[30px] px-3 text-[12px] border border-border">
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {/* Enrolment */}
      {!status.enabled && !setup && !codes && (
        <button
          onClick={begin}
          disabled={busy}
          className="self-start h-[32px] px-3 text-[12.5px] font-semibold border border-border hover:border-ink transition-colors disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Set up two-step verification"}
        </button>
      )}

      {setup && (
        <div className="border border-borderLight p-4 flex gap-5">
          <img src={setup.qr} alt="Scan this QR code" width={180} height={180} className="flex-none border border-border" />
          <div className="flex flex-col gap-3 min-w-0">
            <p className="m-0 text-[12.5px] text-muted leading-[1.55]">
              Scan this with Google Authenticator, Microsoft Authenticator, or any TOTP app. Then
              enter the code it shows to confirm it&apos;s working.
            </p>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] tracking-[.09em] text-muted3">OR ENTER THIS KEY MANUALLY</span>
              <span className="font-mono text-[11.5px] break-all bg-cream border border-border px-2 py-1">
                {setup.secret}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                placeholder="000000"
                className="h-[36px] w-[130px] px-2 border border-border font-mono text-[15px] tracking-[.25em] text-center outline-none focus:border-ink"
              />
              <button
                onClick={confirm}
                disabled={busy || code.replace(/\s/g, "").length < 6}
                className="h-[36px] px-4 text-[12.5px] font-semibold bg-ink text-white disabled:opacity-40"
              >
                {busy ? "Checking…" : "Confirm & turn on"}
              </button>
              <button onClick={() => { setSetup(null); setCode(""); }} className="h-[36px] px-3 text-[12.5px] border border-border">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enabled state */}
      {status.enabled && !codes && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-muted">
            On since {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : "recently"} ·{" "}
            <span className={status.backupCodesRemaining <= 2 ? "text-amberText" : ""}>
              {status.backupCodesRemaining} backup code{status.backupCodesRemaining === 1 ? "" : "s"} left
            </span>
          </span>
          {disabling ? (
            <div className="flex gap-2 items-center">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && disable()}
                placeholder="Confirm your password"
                className="h-[34px] px-2 border border-border text-[13px] outline-none focus:border-ink"
              />
              <button
                onClick={disable}
                disabled={busy || !password}
                className="h-[34px] px-3 text-[12.5px] font-semibold bg-accent text-white disabled:opacity-40"
              >
                {busy ? "Turning off…" : "Turn off"}
              </button>
              <button onClick={() => { setDisabling(false); setPassword(""); }} className="h-[34px] px-3 text-[12.5px] border border-border">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDisabling(true)}
              className="self-start text-[12.5px] text-muted2 hover:text-accent underline underline-offset-2"
            >
              Turn off two-step verification
            </button>
          )}
        </div>
      )}
    </section>
  );
}
