import { Skeleton } from "@/components/ui/card";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-line-subtle px-4 py-5 lg:px-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-px px-4 py-4 lg:px-6">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex gap-2 py-1">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
