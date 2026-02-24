'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

// Admin wallet addresses (replace with actual admin pubkeys)
const ADMIN_WALLETS = new Set([
  '11111111111111111111111111111111', // Placeholder - replace with real admin wallet
]);

interface Stats {
  totalMarkets: number;
  activeMarkets: number;
  totalVolume: number;
  totalUsers: number;
  pendingDisputes: number;
  revenue24h: number;
}

interface PendingMarket {
  id: string;
  question: string;
  creator: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminDashboard() {
  const { publicKey } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingMarkets, setPendingMarkets] = useState<PendingMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (publicKey) {
      const walletAddress = publicKey.toBase58();
      setIsAdmin(ADMIN_WALLETS.has(walletAddress));
    } else {
      setIsAdmin(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  const fetchAdminData = async () => {
    setLoading(true);
    // Mock data - replace with actual API calls
    setStats({
      totalMarkets: 42,
      activeMarkets: 28,
      totalVolume: 125000,
      totalUsers: 1847,
      pendingDisputes: 3,
      revenue24h: 450,
    });

    setPendingMarkets([
      {
        id: '1',
        question: 'Will ETH hit $5000 by March 2025?',
        creator: 'GhXr...4kJp',
        createdAt: '2025-01-29T10:00:00Z',
        status: 'pending',
      },
      {
        id: '2',
        question: 'Will Tesla release a new model in Q1?',
        creator: 'Hp2Q...9rNm',
        createdAt: '2025-01-29T09:30:00Z',
        status: 'pending',
      },
    ]);

    setLoading(false);
  };

  if (!publicKey) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <p className="text-text-secondary">Connect your wallet to access admin dashboard</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <p className="text-ask font-medium">Access Denied</p>
            <p className="text-text-secondary mt-2">You are not authorized to access this page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-bg-secondary rounded w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-bg-secondary rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>
        <Badge variant="accent">Admin Mode</Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard
          label="Total Markets"
          value={stats?.totalMarkets || 0}
        />
        <StatCard
          label="Active Markets"
          value={stats?.activeMarkets || 0}
        />
        <StatCard
          label="Total Volume"
          value={`$${((stats?.totalVolume || 0) / 1000).toFixed(0)}k`}
        />
        <StatCard
          label="Users"
          value={stats?.totalUsers || 0}
        />
        <StatCard
          label="Disputes"
          value={stats?.pendingDisputes || 0}
          highlight={(stats?.pendingDisputes ?? 0) > 0}
        />
        <StatCard
          label="Revenue (24h)"
          value={`$${stats?.revenue24h || 0}`}
        />
      </div>

      {/* Pending Markets */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Market Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingMarkets.length === 0 ? (
            <p className="text-text-secondary text-center py-8">No pending markets</p>
          ) : (
            <div className="space-y-4">
              {pendingMarkets.map((market) => (
                <div
                  key={market.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary"
                >
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">{market.question}</p>
                    <p className="text-sm text-text-secondary mt-1">
                      Creator: {market.creator} | {new Date(market.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleApprove(market.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(market.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="secondary" className="w-full">
              View All Markets
            </Button>
            <Button variant="secondary" className="w-full">
              Manage Users
            </Button>
            <Button variant="secondary" className="w-full">
              View Disputes
            </Button>
            <Button variant="secondary" className="w-full">
              System Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  function handleApprove(marketId: string) {
    setPendingMarkets((prev) =>
      prev.filter((m) => m.id !== marketId)
    );
    // TODO: Call API to approve market
  }

  function handleReject(marketId: string) {
    setPendingMarkets((prev) =>
      prev.filter((m) => m.id !== marketId)
    );
    // TODO: Call API to reject market
  }
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-text-secondary">{label}</p>
        <p
          className={`text-2xl font-semibold mt-1 ${
            highlight ? 'text-ask' : 'text-text-primary'
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
