'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, TrendingUp, Briefcase, Settings } from '@/lib/lucide';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/markets', label: 'Markets', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-sticky glass border-t border-border md:hidden safe-area-inset">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full gap-1',
                'transition-all duration-fast',
                isActive
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-transform duration-fast',
                  isActive && 'scale-110'
                )}
              />
              <span className={cn(
                'text-xs',
                isActive ? 'font-medium' : 'font-normal'
              )}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
