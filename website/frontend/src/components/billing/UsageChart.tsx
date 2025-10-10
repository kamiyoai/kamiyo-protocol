/**
 * Usage Chart Component
 * Displays API usage over time with rate limit indicators
 */

import React, { useState, useEffect } from 'react';
import { useUsageStats } from '../../hooks/useBilling';
import '../../styles/billing.css';

type TimeRange = 'day' | 'week' | 'month';

interface UsageChartProps {
  height?: number;
}

const UsageChart: React.FC<UsageChartProps> = ({ height = 400 }) => {
  const { usage, loading, error } = useUsageStats();
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [chartData, setChartData] = useState<Array<{ label: string; value: number }>>([]);

  // Generate mock historical data based on current usage
  // In production, this should come from the API
  useEffect(() => {
    if (!usage) return;

    const generateChartData = () => {
      const data: Array<{ label: string; value: number }> = [];
      const now = new Date();

      switch (timeRange) {
        case 'day':
          // Last 24 hours
          for (let i = 23; i >= 0; i--) {
            const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
            data.push({
              label: hour.getHours().toString().padStart(2, '0') + ':00',
              value: Math.floor(Math.random() * usage.limit_hour),
            });
          }
          break;

        case 'week':
          // Last 7 days
          for (let i = 6; i >= 0; i--) {
            const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            data.push({
              label: day.toLocaleDateString('en-US', { weekday: 'short' }),
              value: Math.floor(Math.random() * usage.limit_day),
            });
          }
          break;

        case 'month':
          // Last 30 days
          for (let i = 29; i >= 0; i--) {
            const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            data.push({
              label: day.getDate().toString(),
              value: Math.floor(Math.random() * usage.limit_day),
            });
          }
          break;
      }

      setChartData(data);
    };

    generateChartData();
  }, [usage, timeRange]);

  if (loading) {
    return (
      <div className="usage-chart">
        <div className="loading-skeleton">
          <div className="skeleton-chart" style={{ height }}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-chart">
        <div className="error-state">
          <h3>Failed to load usage data</h3>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="usage-chart">
        <div className="empty-state">No usage data available</div>
      </div>
    );
  }

  // Calculate max value for scaling
  const maxValue = Math.max(...chartData.map((d) => d.value), 1);
  const limit = timeRange === 'day' ? usage.limit_hour : usage.limit_day;

  return (
    <div className="usage-chart">
      <div className="chart-header">
        <h2>API Usage Over Time</h2>
        <div className="chart-controls">
          <button
            className={`btn-tab ${timeRange === 'day' ? 'active' : ''}`}
            onClick={() => setTimeRange('day')}
            aria-label="View daily usage"
          >
            Day
          </button>
          <button
            className={`btn-tab ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => setTimeRange('week')}
            aria-label="View weekly usage"
          >
            Week
          </button>
          <button
            className={`btn-tab ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => setTimeRange('month')}
            aria-label="View monthly usage"
          >
            Month
          </button>
        </div>
      </div>

      <div className="chart-stats">
        <div className="stat-card">
          <div className="stat-label">Current Usage</div>
          <div className="stat-value">
            {timeRange === 'day'
              ? usage.usage_current_day.toLocaleString()
              : usage.usage_current_day.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rate Limit</div>
          <div className="stat-value">
            {timeRange === 'day'
              ? usage.limit_day.toLocaleString()
              : usage.limit_day.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-value">
            {timeRange === 'day'
              ? usage.remaining_day.toLocaleString()
              : usage.remaining_day.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="chart-container" style={{ height }}>
        {/* Rate limit line */}
        <div
          className="chart-limit-line"
          style={{
            bottom: `${(limit / maxValue) * 100}%`,
          }}
        >
          <span className="limit-label">Rate Limit</span>
        </div>

        {/* Bar chart */}
        <div className="chart-bars">
          {chartData.map((point, index) => (
            <div key={index} className="chart-bar-wrapper">
              <div
                className="chart-bar"
                style={{
                  height: `${(point.value / maxValue) * 100}%`,
                  backgroundColor: point.value > limit ? '#ef4444' : '#3b82f6',
                }}
                title={`${point.label}: ${point.value.toLocaleString()} requests`}
              >
                <div className="bar-value">{point.value > 0 ? point.value : ''}</div>
              </div>
              <div className="chart-label">{point.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Endpoint Breakdown */}
      {usage.endpoint_breakdown && Object.keys(usage.endpoint_breakdown).length > 0 && (
        <div className="endpoint-breakdown">
          <h3>Endpoint Breakdown</h3>
          <div className="breakdown-list">
            {Object.entries(usage.endpoint_breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([endpoint, count]) => (
                <div key={endpoint} className="breakdown-item">
                  <span className="endpoint-name">{endpoint}</span>
                  <div className="endpoint-bar-container">
                    <div
                      className="endpoint-bar"
                      style={{
                        width: `${(count / Math.max(...Object.values(usage.endpoint_breakdown))) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="endpoint-count">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {usage.last_activity && (
        <div className="chart-footer">
          <small>Last activity: {new Date(usage.last_activity).toLocaleString()}</small>
        </div>
      )}
    </div>
  );
};

export default UsageChart;
