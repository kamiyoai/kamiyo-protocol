/**
 * UsageStats Component
 * Displays API usage statistics with charts and progress bars
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Activity, Download, TrendingUp, AlertCircle } from 'lucide-react';
import { UsageData } from '@/types';
import { apiClient } from '@/api/client';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { format, parseISO } from 'date-fns';

type TimePeriod = '7' | '30';

export const UsageStats: React.FC = () => {
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7');

  useEffect(() => {
    fetchUsageData();
  }, [timePeriod]);

  const fetchUsageData = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get('/billing/usage', {
        params: { days: timePeriod },
      });
      setUsageData(response.data);
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!usageData) return;

    const csv = [
      ['Date', 'API Calls'],
      ...usageData.daily_usage.map((d) => [d.date, d.calls.toString()]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kamiyo-usage-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="usage-stats-loading">
        <LoadingSpinner size="lg" text="Loading usage data..." />
      </div>
    );
  }

  if (!usageData) {
    return (
      <div className="usage-stats-error">
        <AlertCircle size={40} />
        <p>Failed to load usage data</p>
        <button onClick={fetchUsageData} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  const usagePercentage = (usageData.api_calls / usageData.api_limit) * 100;
  const isNearLimit = usagePercentage >= 80;

  const chartData = usageData.daily_usage.map((d) => ({
    date: format(parseISO(d.date), 'MMM dd'),
    calls: d.calls,
  }));

  return (
    <div className="usage-stats">
      <div className="stats-header">
        <div className="header-title">
          <Activity size={24} />
          <h2>API Usage</h2>
        </div>

        <div className="header-controls">
          <div className="period-selector">
            <button
              className={`period-btn ${timePeriod === '7' ? 'active' : ''}`}
              onClick={() => setTimePeriod('7')}
            >
              Last 7 Days
            </button>
            <button
              className={`period-btn ${timePeriod === '30' ? 'active' : ''}`}
              onClick={() => setTimePeriod('30')}
            >
              Last 30 Days
            </button>
          </div>

          <button onClick={handleExportCSV} className="export-btn">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Current Period Summary */}
      <div className="usage-summary">
        <div className="summary-card">
          <div className="card-header">
            <h3>Current Period</h3>
            <span className="period-dates">
              {format(parseISO(usageData.current_period_start), 'MMM dd')} -{' '}
              {format(parseISO(usageData.current_period_end), 'MMM dd')}
            </span>
          </div>

          <div className="usage-progress">
            <div className="progress-header">
              <span className="progress-label">API Calls</span>
              <span className="progress-value">
                {usageData.api_calls.toLocaleString()} /{' '}
                {usageData.api_limit === -1
                  ? 'Unlimited'
                  : usageData.api_limit.toLocaleString()}
              </span>
            </div>

            {usageData.api_limit !== -1 && (
              <>
                <div className="progress-bar">
                  <motion.div
                    className={`progress-fill ${isNearLimit ? 'near-limit' : ''}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(usagePercentage, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>

                <div className="progress-footer">
                  <span className="progress-percentage">
                    {usagePercentage.toFixed(1)}% used
                  </span>
                  {isNearLimit && (
                    <span className="warning-badge">
                      <AlertCircle size={14} />
                      Near limit
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="summary-stats">
          <div className="stat-item">
            <div className="stat-icon">
              <TrendingUp size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Daily Average</span>
              <span className="stat-value">
                {Math.round(
                  usageData.daily_usage.reduce((sum, d) => sum + d.calls, 0) /
                    usageData.daily_usage.length
                ).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">
              <Activity size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Peak Day</span>
              <span className="stat-value">
                {Math.max(...usageData.daily_usage.map((d) => d.calls)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Chart */}
      <div className="usage-chart">
        <h3 className="chart-title">Daily API Calls</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="date" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="calls" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Usage Trend */}
      <div className="usage-trend">
        <h3 className="chart-title">Usage Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="date" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="calls"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default UsageStats;
