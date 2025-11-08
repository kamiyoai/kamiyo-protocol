// components/dashboard/UsageCharts.js
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#00f0ff', '#ff44f5', '#00d4ff', '#ff6b9d', '#33f3ff', '#ff88aa'];

export function VerificationsTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No verification data available yet" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-500/25 p-6">
      <h3 className="text-lg font-light text-white mb-4">Verifications Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="date"
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#000',
              border: '1px solid #00f0ff',
              borderRadius: '4px'
            }}
            labelStyle={{ color: '#00f0ff' }}
          />
          <Line
            type="monotone"
            dataKey="verifications"
            stroke="#00f0ff"
            strokeWidth={2}
            dot={{ fill: '#00f0ff', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VerificationsByChainChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No chain data available yet" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-500/25 p-6">
      <h3 className="text-lg font-light text-white mb-4">Verifications by Chain</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="chain"
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#000',
              border: '1px solid #00f0ff',
              borderRadius: '4px'
            }}
            labelStyle={{ color: '#00f0ff' }}
          />
          <Bar
            dataKey="count"
            fill="#00f0ff"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SuccessRateChart({ successRate, total }) {
  const data = [
    { name: 'Successful', value: Math.round((successRate / 100) * total) },
    { name: 'Failed', value: Math.round(((100 - successRate) / 100) * total) }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-500/25 p-6">
      <h3 className="text-lg font-light text-white mb-4">Success Rate</h3>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#00f0ff' : '#ff44f5'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#000',
                  border: '1px solid #00f0ff',
                  borderRadius: '4px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 ml-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-cyan mb-2">{successRate}%</div>
            <div className="text-sm text-gray-400">Success Rate</div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-cyan rounded-full mr-2"></div>
                <span className="text-gray-400">Successful</span>
              </div>
              <span className="text-white font-medium">{data[0].value}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#ff44f5' }}></div>
                <span className="text-gray-400">Failed</span>
              </div>
              <span className="text-white font-medium">{data[1].value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResponseTimeChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No response time data available yet" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-500/25 p-6">
      <h3 className="text-lg font-light text-white mb-4">Average Response Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="time"
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#666"
            style={{ fontSize: '12px' }}
            label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#000',
              border: '1px solid #00f0ff',
              borderRadius: '4px'
            }}
            labelStyle={{ color: '#00f0ff' }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#ff44f5"
            strokeWidth={2}
            dot={{ fill: '#ff44f5', r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 text-center text-sm text-gray-400">
        Target: {'<'} 500ms
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="bg-white rounded-lg border border-gray-500/25 p-6">
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="mt-4 text-sm text-gray-400">{message}</p>
        <p className="mt-2 text-xs text-gray-500">Start making verification requests to see analytics</p>
      </div>
    </div>
  );
}

// Mock data generator for testing
export function generateMockData() {
  const days = 30;
  const trendData = [];
  const chainData = [
    { chain: 'Solana', count: Math.floor(Math.random() * 1000) },
    { chain: 'Base', count: Math.floor(Math.random() * 800) },
    { chain: 'Ethereum', count: Math.floor(Math.random() * 600) },
    { chain: 'Polygon', count: Math.floor(Math.random() * 400) },
  ];

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trendData.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      verifications: Math.floor(Math.random() * 200) + 50,
    });
  }

  const responseTimeData = [];
  for (let i = 23; i >= 0; i--) {
    responseTimeData.push({
      time: `${23 - i}:00`,
      latency: Math.floor(Math.random() * 300) + 100,
    });
  }

  return {
    trendData,
    chainData,
    responseTimeData,
    successRate: 95.8,
    totalVerifications: chainData.reduce((sum, item) => sum + item.count, 0),
  };
}
