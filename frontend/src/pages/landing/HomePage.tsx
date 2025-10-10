/**
 * HomePage Landing Page Component
 *
 * Main landing page with:
 * - Hero section with value proposition
 * - Feature highlights
 * - Social proof (testimonials, stats)
 * - Recent exploit showcase
 * - Pricing teaser with CTA
 * - SEO optimized
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Zap,
  Bell,
  TrendingUp,
  Check,
  ArrowRight,
  AlertCircle,
  Database,
  Clock,
  DollarSign,
  Users,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { MetaTags } from '../../components/SEO/MetaTags';
import conversionTracker, { FunnelStep } from '../../analytics/conversions';
import analytics from '../../analytics/analytics';

interface Exploit {
  id: string;
  name: string;
  chain: string;
  amount_usd: number;
  date: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface Stats {
  totalExploits: number;
  totalValueLost: number;
  userCount: number;
  uptime: number;
  avgResponseTime: number;
}

const HomePage: React.FC = () => {
  const [recentExploits, setRecentExploits] = useState<Exploit[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalExploits: 1247,
    totalValueLost: 10500000000,
    userCount: 2834,
    uptime: 99.97,
    avgResponseTime: 45,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track landing page visit
    conversionTracker.trackStep(FunnelStep.LANDING);
    analytics.trackPageView('/');

    // Fetch recent exploits
    fetchRecentExploits();
  }, []);

  const fetchRecentExploits = async () => {
    try {
      const response = await fetch('/api/exploits?limit=5&sort=date_desc');
      if (response.ok) {
        const data = await response.json();
        setRecentExploits(data.exploits || []);
      }
    } catch (error) {
      console.error('Failed to fetch recent exploits', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    }
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-[#ff008d]';
      case 'high':
        return 'bg-[#cc11f0]';
      case 'medium':
        return 'bg-[#f96363]';
      case 'low':
        return 'bg-[#fee801]';
      default:
        return 'bg-gray-500';
    }
  };

  const trackCTAClick = (location: string) => {
    analytics.trackEvent('cta_clicked', {
      category: 'Conversion',
      label: location,
      customParams: { location },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900">
      {/* SEO Meta Tags */}
      <MetaTags
        title="Real-Time Exploit Intelligence for DeFi"
        description="Track confirmed exploits across all major blockchains. Get instant alerts when security incidents happen. Comprehensive database with $10B+ tracked exploits."
        keywords={[
          'DeFi security',
          'exploit tracker',
          'blockchain security',
          'smart contract exploits',
          'crypto hacks',
          'security alerts',
        ]}
        type="website"
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32 px-4 sm:px-6 lg:px-8">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 animate-pulse" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full filter blur-3xl animate-blob" />
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full filter blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-blue-500/20 rounded-full filter blur-3xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center px-4 py-2 bg-purple-500/20 backdrop-blur-sm border border-purple-500/30 rounded-full mb-8">
              <Zap className="w-4 h-4 text-purple-400 mr-2" />
              <span className="text-sm text-purple-300">
                Tracking $10B+ in exploits across 15+ chains
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight">
              Real-Time{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Exploit Intelligence
              </span>
              <br />
              for DeFi
            </h1>

            {/* Subheadline */}
            <p className="text-xl sm:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
              Stay ahead of security threats. Track confirmed exploits across all major
              blockchains and get instant alerts when incidents happen.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link
                to="/signup"
                onClick={() => trackCTAClick('hero_primary')}
                className="group inline-flex items-center px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg hover:shadow-purple-500/50"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/demo"
                onClick={() => trackCTAClick('hero_secondary')}
                className="inline-flex items-center px-8 py-4 bg-white/10 hover:bg-white/20 text-white text-lg font-semibold rounded-lg backdrop-blur-sm border border-white/20 transition-all"
              >
                View Live Demo
                <ChevronRight className="ml-2 w-5 h-5" />
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-400">
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-400 mr-2" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-400 mr-2" />
                <span>Free tier available</span>
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-400 mr-2" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-16 px-4 sm:px-6 lg:px-8 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Database className="w-6 h-6 text-purple-400 mr-2" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {stats.totalExploits.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Exploits Tracked</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <DollarSign className="w-6 h-6 text-purple-400 mr-2" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {formatCurrency(stats.totalValueLost)}
              </div>
              <div className="text-sm text-gray-400">Value Lost Tracked</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Users className="w-6 h-6 text-purple-400 mr-2" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {stats.userCount.toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Active Users</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Activity className="w-6 h-6 text-purple-400 mr-2" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {stats.uptime}%
              </div>
              <div className="text-sm text-gray-400">Uptime</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Clock className="w-6 h-6 text-purple-400 mr-2" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {stats.avgResponseTime}ms
              </div>
              <div className="text-sm text-gray-400">Avg Response</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              Everything You Need to Stay Secure
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Comprehensive exploit intelligence with real-time alerts, powerful API, and
              detailed analytics
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1: Real-Time Alerts */}
            <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-purple-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Bell className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Real-Time Alerts</h3>
                <p className="text-gray-400">
                  Get instant notifications via Discord, Telegram, or email when exploits
                  matching your criteria occur
                </p>
              </div>
            </div>

            {/* Feature 2: Comprehensive Database */}
            <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-purple-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Database className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Comprehensive Database
                </h3>
                <p className="text-gray-400">
                  Access detailed information on 1,200+ exploits across 15+ blockchain
                  networks
                </p>
              </div>
            </div>

            {/* Feature 3: Powerful API */}
            <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-purple-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Powerful API</h3>
                <p className="text-gray-400">
                  Integrate exploit intelligence into your applications with our fast,
                  reliable REST API
                </p>
              </div>
            </div>

            {/* Feature 4: Advanced Analytics */}
            <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-purple-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Advanced Analytics</h3>
                <p className="text-gray-400">
                  Visualize trends, patterns, and statistics with interactive charts and
                  dashboards
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Exploits Showcase */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-4xl font-bold text-white mb-2">Recent Exploits</h2>
              <p className="text-gray-400">
                Latest confirmed security incidents across all chains
              </p>
            </div>
            <Link
              to="/exploits"
              className="inline-flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all"
            >
              View All
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {recentExploits.slice(0, 5).map((exploit, index) => (
                <Link
                  key={exploit.id || index}
                  to={`/exploit/${exploit.id}`}
                  className="block bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div
                        className={`w-3 h-3 rounded-full ${getSeverityColor(
                          exploit.severity
                        )}`}
                      />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {exploit.name}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span className="flex items-center">
                            <Shield className="w-4 h-4 mr-1" />
                            {exploit.chain}
                          </span>
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {new Date(exploit.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-red-400">
                        {formatCurrency(exploit.amount_usd)}
                      </div>
                      <div className="text-sm text-gray-400">Lost</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-300">
              Choose the plan that's right for you
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
              <div className="text-4xl font-bold text-white mb-6">
                $0<span className="text-lg text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  View recent exploits
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Basic search & filtering
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Community support
                </li>
              </ul>
              <Link
                to="/signup"
                onClick={() => trackCTAClick('pricing_free')}
                className="block w-full text-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg border border-white/20 transition-all"
              >
                Get Started
              </Link>
            </div>

            {/* Pro Tier */}
            <div className="relative bg-gradient-to-br from-purple-600/20 to-pink-600/20 backdrop-blur-sm border-2 border-purple-500 rounded-2xl p-8">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-sm font-semibold text-white">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <div className="text-4xl font-bold text-white mb-6">
                $49<span className="text-lg text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Real-time alerts
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  API access (100k req/month)
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Advanced analytics
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Priority support
                </li>
              </ul>
              <Link
                to="/signup?tier=pro"
                onClick={() => trackCTAClick('pricing_pro')}
                className="block w-full text-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Enterprise Tier */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
              <div className="text-4xl font-bold text-white mb-6">Custom</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Unlimited API requests
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Custom integrations
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  Dedicated support
                </li>
                <li className="flex items-center text-gray-300">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" />
                  SLA guarantees
                </li>
              </ul>
              <Link
                to="/contact"
                onClick={() => trackCTAClick('pricing_enterprise')}
                className="block w-full text-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg border border-white/20 transition-all"
              >
                Contact Sales
              </Link>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/pricing"
              className="inline-flex items-center text-purple-400 hover:text-purple-300 font-semibold"
            >
              View detailed pricing comparison
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-sm border border-purple-500/50 rounded-3xl p-12">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              Ready to Stay Ahead of Exploits?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Join thousands of security professionals tracking exploits in real-time
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signup"
                onClick={() => trackCTAClick('cta_bottom')}
                className="inline-flex items-center px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold rounded-lg transition-all transform hover:scale-105"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center px-8 py-4 bg-white/10 hover:bg-white/20 text-white text-lg font-semibold rounded-lg backdrop-blur-sm border border-white/20 transition-all"
              >
                Schedule Demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
