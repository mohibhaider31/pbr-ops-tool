import { PageHeaderSkeleton, StatCardsSkeleton, CardListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <CardListSkeleton groups={2} />
    </div>
  );
}
