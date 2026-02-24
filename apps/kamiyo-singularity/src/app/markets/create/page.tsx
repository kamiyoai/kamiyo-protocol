import { Metadata } from 'next';
import { CreateMarketForm } from '@/components/market';

export const metadata: Metadata = {
  title: 'Create Market | KAMIYO Singularity',
  description: 'Create a new prediction market on KAMIYO Singularity',
};

export default function CreateMarketPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <CreateMarketForm />
    </div>
  );
}
