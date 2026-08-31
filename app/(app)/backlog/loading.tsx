import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton rows={12} />
    </div>
  );
}
