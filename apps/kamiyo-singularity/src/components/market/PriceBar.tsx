import { cn } from '@/lib/utils';

export interface PriceBarProps {
  yesPrice: number;
  noPrice: number;
  className?: string;
}

export function PriceBar({ yesPrice, noPrice, className }: PriceBarProps) {
  const yesPercent = Math.round(yesPrice * 100);
  const noPercent = Math.round(noPrice * 100);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-bid">Yes {yesPercent}%</span>
        <span className="text-ask">No {noPercent}%</span>
      </div>
      <div className="h-2 bg-bg-secondary rounded-full overflow-hidden flex">
        <div
          className="bg-bid h-full transition-all"
          style={{ width: `${yesPercent}%` }}
        />
        <div
          className="bg-ask h-full transition-all"
          style={{ width: `${noPercent}%` }}
        />
      </div>
    </div>
  );
}
