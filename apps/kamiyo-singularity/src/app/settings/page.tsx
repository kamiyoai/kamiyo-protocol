'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { PageShell } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { truncateAddress } from '@/lib/utils';
import { RPC_ENDPOINT } from '@/lib/constants';

export default function SettingsPage() {
  const { publicKey, disconnect, connected } = useWallet();

  return (
    <PageShell>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {connected && publicKey && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-4">Wallet</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-text-secondary text-sm">Connected Address</div>
              <div className="font-mono">{truncateAddress(publicKey.toBase58())}</div>
            </div>
            <Button variant="danger" size="sm" onClick={() => disconnect()}>
              Disconnect
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="font-semibold mb-4">Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Dark Mode</div>
              <div className="text-text-secondary text-sm">Always enabled</div>
            </div>
            <div className="w-12 h-6 bg-accent rounded-full relative">
              <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Push Notifications</div>
              <div className="text-text-secondary text-sm">Price alerts and updates</div>
            </div>
            <div className="w-12 h-6 bg-bg-tertiary rounded-full relative">
              <div className="absolute left-1 top-1 w-4 h-4 bg-text-muted rounded-full" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold mb-4">Network</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <span>Solana Devnet</span>
            <span className="w-2 h-2 bg-accent rounded-full" />
          </div>
          <div className="text-text-secondary text-sm break-all">
            RPC: {RPC_ENDPOINT}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">About</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Version</span>
            <span>1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Build</span>
            <span>dev</span>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
