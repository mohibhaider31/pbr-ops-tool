import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeaderSkeleton />
      <StatCardsSkeleton n={3} />
      <TableSkeleton rows={10} />
    </div>
  );
}
