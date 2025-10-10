/**
 * DashboardPage Component
 * Main dashboard with overview, recent exploits, usage stats, and quick actions
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Activity,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/store/appStore';
import { apiClient } from '@/api/client';
import { Stats } from '@/types';
import RecentExploits from '@/components/dashboard/RecentExploits';
import UsageStats from '@/components/dashboard/UsageStats';
import QuickActions from '@/components/dashboard/QuickActions';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get('/stats', {
        params: { days: 7 },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toString();
  };

  const formatCurrency = (num: number): string => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <LoadingSpinner size="lg" text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Welcome Header */}
      <div className="dashboard-header">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="welcome-section"
        >
          <h1 className="welcome-title">
            Welcome back, {user?.name || user?.email}
          </h1>
          <p className="welcome-subtitle">
            Here's what's happening with your Kamiyo account
          </p>
        </motion.div>

        <div className="tier-badge">
          <Shield size={20} />
          <span>{user?.tier} Plan</span>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="stats-overview">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="stat-card"
        >
          <div className="stat-icon stat-icon-blue">
            <Activity size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Exploits (7d)</span>
            <span className="stat-value">
              {stats ? formatNumber(stats.total_exploits) : '-'}
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="stat-card"
        >
          <div className="stat-icon stat-icon-red">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Loss (7d)</span>
            <span className="stat-value">
              {stats ? formatCurrency(stats.total_loss_usd) : '-'}
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="stat-card"
        >
          <div className="stat-icon stat-icon-green">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Affected Chains</span>
            <span className="stat-value">
              {stats ? stats.affected_chains : '-'}
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="stat-card"
        >
          <div className="stat-icon stat-icon-orange">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Affected Protocols</span>
            <span className="stat-value">
              {stats ? stats.affected_protocols : '-'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Left Column - Recent Exploits */}
        <div className="grid-column grid-main">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="dashboard-card"
          >
            <RecentExploits />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="dashboard-card"
          >
            <UsageStats />
          </motion.div>
        </div>

        {/* Right Column - Quick Actions & Activity */}
        <div className="grid-column grid-sidebar">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="dashboard-card"
          >
            <QuickActions />
          </motion.div>

          {/* Top Chains Widget */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="dashboard-card"
          >
            <h3 className="widget-title">Top Affected Chains (7d)</h3>
            {stats?.top_chains && stats.top_chains.length > 0 ? (
              <div className="top-chains-list">
                {stats.top_chains.slice(0, 5).map((chain, index) => (
                  <div key={chain.chain} className="chain-item">
                    <div className="chain-info">
                      <span className="chain-rank">#{index + 1}</span>
                      <span className="chain-name">{chain.chain}</span>
                    </div>
                    <div className="chain-stats">
                      <span className="chain-count">
                        {chain.exploit_count} exploits
                      </span>
                      <span className="chain-loss">
                        {formatCurrency(chain.total_loss)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No data available</p>
            )}
          </motion.div>

          {/* Top Protocols Widget */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="dashboard-card"
          >
            <h3 className="widget-title">Top Affected Protocols (7d)</h3>
            {stats?.top_protocols && stats.top_protocols.length > 0 ? (
              <div className="top-protocols-list">
                {stats.top_protocols.slice(0, 5).map((protocol, index) => (
                  <div key={protocol.protocol} className="protocol-item">
                    <div className="protocol-info">
                      <span className="protocol-rank">#{index + 1}</span>
                      <span className="protocol-name">{protocol.protocol}</span>
                    </div>
                    <div className="protocol-stats">
                      <span className="protocol-count">
                        {protocol.exploit_count} exploits
                      </span>
                      <span className="protocol-loss">
                        {formatCurrency(protocol.total_loss)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No data available</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
