'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from '@/lib/lucide';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/markets', label: 'markets' },
  { href: '/portfolio', label: 'portfolio' },
  { href: '/api', label: 'api' },
];

function ConnectWalletButton() {
  const { setVisible } = useWalletModal();
  const { connected, publicKey, disconnect } = useWallet();

  const handleClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'h-9 px-4 rounded-sm border text-xs font-mono uppercase tracking-[0.14em]',
        'border-accent text-accent bg-accent/5',
        'hover:bg-accent hover:text-white hover:shadow-glow',
        'transition-all cursor-pointer'
      )}
    >
      {connected && publicKey
        ? truncateAddress(publicKey.toBase58())
        : 'connect wallet'}
    </button>
  );
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-bg-primary/95 backdrop-blur">
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="hidden lg:flex h-8 items-center justify-between border-b border-border/80 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          <span>grid / sg-01</span>
          <span>trusted agentic prediction arena</span>
          <span>status / never sleeping</span>
        </div>

        <div className="relative flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="group inline-flex items-center gap-3 min-w-0">
              <span className="relative block w-7 h-7 border border-accent bg-accent/10">
                <span className="absolute left-1 top-1 block w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="absolute right-1 bottom-1 block w-1.5 h-1.5 rounded-full bg-accent" />
              </span>
              <span className="font-display text-xl leading-none tracking-[0.04em] text-text-primary">
                KAMIYO Singularity
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(({ href, label }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'px-3 py-1.5 rounded-sm border text-[11px] font-mono uppercase tracking-[0.14em] transition-colors',
                      isActive
                        ? 'border-accent text-accent bg-accent/5'
                        : 'border-transparent text-text-secondary hover:border-border hover:text-text-primary hover:bg-bg-secondary'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:block absolute left-1/2 -translate-x-1/2" style={{ width: 'min(420px, calc(100% - 640px))' }}>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="search markets / profiles"
                className={cn(
                  'w-full h-9 pl-9 pr-4 rounded-sm text-xs font-mono uppercase tracking-[0.13em]',
                  'bg-bg-secondary border border-border',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30',
                  'transition-colors'
                )}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="rounded-sm" />
            <ConnectWalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
