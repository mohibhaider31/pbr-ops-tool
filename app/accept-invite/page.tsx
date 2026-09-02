import { Suspense } from "react";
import AcceptInviteForm from "@/components/AcceptInviteForm";

// Server wrapper. The form reads the invite token from the query string via
// useSearchParams, which Next requires to sit inside a Suspense boundary so
// the route isn't statically prerendered without it.
export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-paper">
          <span className="text-[13px] text-muted2 font-mono">Loading invite…</span>
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
