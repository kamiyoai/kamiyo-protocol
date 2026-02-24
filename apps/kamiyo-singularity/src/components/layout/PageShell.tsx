import { ReactNode } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <main className="container-app py-6 pb-24 md:pb-6">{children}</main>
      <BottomNav />
    </div>
  );
}
