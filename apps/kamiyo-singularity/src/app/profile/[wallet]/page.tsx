import { Metadata } from 'next';
import {
  ProfileHeader,
  ProfileStats,
  ProfileActivity,
  ProfilePositions,
} from '@/components/profile';

interface ProfilePageProps {
  params: Promise<{ wallet: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { wallet } = await params;
  const truncated = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

  return {
    title: `${truncated} | KAMIYO Singularity`,
    description: `View trading profile for ${truncated} on KAMIYO Singularity`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { wallet } = await params;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <ProfileHeader wallet={wallet} />

      <ProfileStats wallet={wallet} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProfilePositions wallet={wallet} />
        <ProfileActivity wallet={wallet} />
      </div>
    </div>
  );
}
