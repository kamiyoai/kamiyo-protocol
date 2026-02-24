'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import type { PublicProfile } from '@/types';
import { cn } from '@/lib/utils';

interface ProfileHeaderProps {
  wallet: string;
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

const WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function ProfileHeader({ wallet }: ProfileHeaderProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!wallet || !WALLET_REGEX.test(wallet)) {
      setError('Invalid wallet address');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      try {
        setError(null);
        const data = await api.getPublicProfile(wallet);
        if (!cancelled) {
          setProfile(data);
        }
      } catch {
        if (!cancelled) {
          setError('Profile not found');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading profile...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="text-text-secondary">{error || 'Profile not found'}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center">
              {profile.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.username || 'Profile'}
                  width={80}
                  height={80}
                  className="w-full h-full rounded-full object-cover"
                  loading="eager"
                  priority={false}
                />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {(profile.username || wallet).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold text-text-primary">
                {profile.username || truncateAddress(wallet)}
              </h1>
              {profile.username && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast cursor-pointer flex items-center gap-1"
                >
                  {truncateAddress(wallet)}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {copied && <span className="text-bid">Copied!</span>}
                </button>
              )}
            </div>

            {profile.bio && (
              <p className="text-text-secondary mb-3">{profile.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
              <span>Joined {formatDate(profile.joinedAt)}</span>
              <span>{profile.stats.marketsTraded} markets traded</span>
              <span>{profile.stats.totalTrades} trades</span>
            </div>

            {/* Badges */}
            {profile.badges.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {profile.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-bg-tertiary rounded-full"
                    title={badge.description}
                  >
                    <span>{badge.icon}</span>
                    <span className="text-xs text-text-primary">{badge.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key stats */}
          <div className="flex-shrink-0 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-sm text-text-secondary">30D P&L</p>
              <p
                className={cn(
                  'text-xl font-bold',
                  profile.stats.pnl30d >= 0 ? 'text-bid' : 'text-ask'
                )}
              >
                {profile.stats.pnl30d >= 0 ? '+' : ''}
                ${Math.abs(profile.stats.pnl30d).toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-text-secondary">Win Rate</p>
              <p className="text-xl font-bold text-text-primary">
                {(profile.stats.winRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-text-secondary">Volume</p>
              <p className="text-xl font-bold text-text-primary">
                ${(profile.stats.totalVolume / 1000).toFixed(0)}K
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-text-secondary">Streak</p>
              <p className="text-xl font-bold text-accent">
                {profile.stats.currentStreak}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
