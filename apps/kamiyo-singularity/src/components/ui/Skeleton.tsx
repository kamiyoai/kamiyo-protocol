import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-bg-secondary", className)}
      {...props}
    />
  )
}

function MarketCardSkeleton() {
  return (
    <div className="bg-bg-primary border border-[var(--color-border)] rounded-lg p-4">
      <Skeleton className="h-5 w-3/4 mb-3" />
      <Skeleton className="h-4 w-1/2 mb-4" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function MarketListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}

function OrderBookSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function PositionCardSkeleton() {
  return (
    <div className="bg-bg-primary border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-bg-primary border border-[var(--color-border)] rounded-lg p-4">
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

export {
  Skeleton,
  MarketCardSkeleton,
  MarketListSkeleton,
  OrderBookSkeleton,
  PositionCardSkeleton,
  StatCardSkeleton,
}
