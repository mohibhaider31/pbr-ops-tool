import { PageHeaderSkeleton, TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
