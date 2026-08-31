// Skeleton primitives used by the per-route loading.tsx files.
//
// These render from the CLIENT bundle, so Next.js can paint them the instant a
// navigation starts — before any server work, database query, or cold start
// has happened. That is what makes a click feel acknowledged even when the
// route behind it takes a second to resolve.

export function Bar({ w = "100%", h = 10 }: { w?: string | number; h?: number }) {
  return (
    <div
      className="bg-borderLight animate-pulse"
      style={{ width: typeof w === "number" ? `${w}px` : w, height: h }}
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
      <div className="flex flex-col gap-[9px]">
        <Bar w={210} h={20} />
        <Bar w={320} h={10} />
      </div>
      <Bar w={120} h={30} />
    </header>
  );
}

export function StatCardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div
      className="grid gap-px bg-border border-b border-border"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-paper px-[30px] pt-[14px] pb-[15px] flex flex-col gap-[7px]">
          <Bar w={70} h={9} />
          <Bar w={40} h={20} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex-1 overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid px-[30px] items-center h-[46px] border-b border-borderLight"
          style={{ gridTemplateColumns: "46px 64px minmax(160px,1fr) 34px 130px" }}
        >
          <Bar w={16} h={11} />
          <Bar w={46} h={11} />
          <Bar w={`${45 + ((i * 7) % 40)}%`} h={11} />
          <Bar w={16} h={11} />
          <div className="ml-auto"><Bar w={70} h={11} /></div>
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ groups = 3 }: { groups?: number }) {
  return (
    <div className="p-[30px] flex flex-col gap-7">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="flex flex-col gap-3">
          <Bar w={150} h={11} />
          <div className="border border-borderLight">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-[13px] border-b border-borderFaint last:border-b-0 flex flex-col gap-2">
                <Bar w={90} h={10} />
                <Bar w={`${55 + ((i * 9) % 30)}%`} h={11} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
