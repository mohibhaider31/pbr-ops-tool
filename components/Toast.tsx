"use client";

export default function Toast({ message }: { message: string }) {
  return (
    <div className="fixed left-1/2 bottom-[26px] -translate-x-1/2 z-[60] bg-ink text-paper px-[17px] py-[11px] flex items-center gap-[10px] animate-riseIn">
      <span className="w-[6px] h-[6px] rounded-full bg-goodLight inline-block" />
      <span className="text-[13px]">{message}</span>
    </div>
  );
}
