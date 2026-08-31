import { PageHeaderSkeleton, CardListSkeleton } from "@/components/Skeletons";

// My Work (the app index).
export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeaderSkeleton />
      <CardListSkeleton groups={3} />
    </div>
  );
}
