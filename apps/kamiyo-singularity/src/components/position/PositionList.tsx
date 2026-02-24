'use client';

import Link from 'next/link';
import { Button, LoadingScreen } from '@/components/ui';
import { usePositions } from '@/hooks';
import { PositionCard } from './PositionCard';

export function PositionList() {
  const { data: positionsData, isLoading } = usePositions();
  const positions = positionsData?.data || [];

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary mb-4">No active positions</p>
        <Link href="/markets">
          <Button variant="primary">Browse Markets</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((position) => (
        <PositionCard key={position.marketId} position={position} />
      ))}
    </div>
  );
}
