import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import Head from 'next/head';
import { DEFAULT_STATS, fetchProtocolStats, getOracleSystem } from '../lib/oracle';

const PROGRAM_ID = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
const EXPLORER_URL = `https://explorer.solana.com/address/${PROGRAM_ID}`;

// Sample transactions for fallback
const SAMPLE_TRANSACTIONS = [
    { id: '4f8a2c1e', qualityScore: 82, refund: 0.018 },
    { id: '7b3d9e0f', qualityScore: 71, refund: 0.029 }
];

export default function Protocol() {
    const [activeTab, setActiveTab] = useState('protocol');
    const [walletConnected, setWalletConnected] = useState(false);
    const [walletAddress, setWalletAddress] = useState('');
    const [walletProvider, setWalletProvider] = useState(null);
    const [stats, setStats] = useState(DEFAULT_STATS);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState('0.1');
    const [statusMessage, setStatusMessage] = useState(null);
    const [chartLoaded, setChartLoaded] = useState(false);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    // Show status message
    const showStatus = useCallback((message, type = 'info') => {
        setStatusMessage({ message, type });
        setTimeout(() => setStatusMessage(null), 5000);
    }, []);

    // Get wallet provider
    const getProvider = useCallback(() => {
        if (typeof window === 'undefined') return null;
        if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
        if (window.solana?.isPhantom) return window.solana;
        if (window.solana?.isSolflare || window.solana?.publicKey) return window.solana;
        if (window.solflare) return window.solflare;
        return null;
    }, []);

    // Connect wallet
    const connectWallet = useCallback(async () => {
        const provider = getProvider();

        if (!provider) {
            showStatus('No Solana wallet detected. Install Phantom or Solflare.', 'error');
            setTimeout(() => window.open('https://phantom.app/', '_blank'), 1000);
            return;
        }

        showStatus('Connecting to wallet...', 'info');

        try {
            // Always disconnect first to clear stale state
            try { await provider.disconnect(); } catch (_) {}

            const resp = await provider.connect();
            const publicKey = resp.publicKey;

            setWalletProvider(provider);
            setWalletAddress(publicKey.toString());
            setWalletConnected(true);

            const shortAddress = publicKey.toString().substring(0, 4) + '...' +
                publicKey.toString().substring(publicKey.toString().length - 4);
            const walletName = provider.isPhantom ? 'Phantom' : provider.isSolflare ? 'Solflare' : 'Wallet';

            showStatus(`${walletName} connected: ${shortAddress}`, 'success');
        } catch (err) {
            console.error('Wallet connection failed:', err);
            if (err.message?.includes('User rejected') || err.message?.includes('rejected') || err.message?.includes('User cancelled')) {
                showStatus('Connection rejected by user', 'error');
            } else if (err.code === 4001) {
                showStatus('Connection rejected by user', 'error');
            } else if (err.message?.includes('Unexpected error')) {
                showStatus('Unlock Phantom or restart your browser', 'error');
            } else {
                showStatus('Connection failed. Refresh page and try again.', 'error');
            }
            setWalletConnected(false);
            setWalletAddress('');
            setWalletProvider(null);
        }
    }, [getProvider, showStatus]);

    // Load analytics data
    const loadAnalytics = useCallback(async () => {
        if (typeof window === 'undefined') return;

        try {
            const fetchedStats = await fetchProtocolStats();
            setStats(fetchedStats);

            // Try to get recent transactions
            try {
                const oracle = await getOracleSystem();
                const disputes = await oracle.fetchRecentDisputes(10);

                if (disputes && disputes.length > 0) {
                    const txList = disputes.map(dispute => {
                        const qualityLog = dispute.logs.find(l => l.includes('Quality Score:'));
                        const refundLog = dispute.logs.find(l => l.includes('Refund to Agent:'));
                        const qualityScore = qualityLog ? parseInt(qualityLog.match(/Quality Score: (\d+)/)?.[1] || '0') : 0;
                        const refundAmount = refundLog ? parseFloat(refundLog.match(/Refund to Agent: ([\d.]+)/)?.[1] || '0') : 0;

                        return {
                            signature: dispute.signature,
                            qualityScore,
                            refund: refundAmount
                        };
                    });
                    setTransactions(txList);
                }
            } catch (txError) {
                console.error('Failed to load transactions:', txError);
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
            setStats(DEFAULT_STATS);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initialize chart
    const initChart = useCallback(() => {
        if (!chartRef.current || typeof window === 'undefined' || !window.Chart) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        gradient.addColorStop(0, '#ff44f5');
        gradient.addColorStop(1, '#4fe9ea');

        const fillGradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        fillGradient.addColorStop(0, 'rgba(255, 68, 245, 0.1)');
        fillGradient.addColorStop(1, 'rgba(79, 233, 234, 0.1)');

        chartInstance.current = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: ['0-20', '20-40', '40-60', '60-80', '80-100'],
                datasets: [{
                    label: 'Quality Score Distribution',
                    data: stats.distribution || DEFAULT_STATS.distribution,
                    borderColor: gradient,
                    backgroundColor: fillGradient,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#222' }, ticks: { color: '#888' } },
                    y: { grid: { color: '#222' }, ticks: { color: '#888' } }
                }
            }
        });
    }, [stats.distribution]);

    // Load analytics on mount
    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // Initialize chart when tab changes
    useEffect(() => {
        if (activeTab === 'analytics' && chartLoaded) {
            setTimeout(initChart, 100);
        }
    }, [activeTab, chartLoaded, initChart]);

    const shortAddress = walletAddress
        ? `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`
        : '';

    return (
        <div className="min-h-screen bg-black text-white">
            <Head>
                <title>KAMIYO Protocol | Trust Infrastructure for Autonomous Agents</title>
                <meta name="description" content="Live dispute resolution on Solana Mainnet with oracle-verified quality assessment. Real escrow transactions with decentralized oracle consensus." />
                <link rel="canonical" href="https://kamiyo.ai/protocol" />
            </Head>

            {/* Chart.js for analytics */}
            <Script
                src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
                strategy="afterInteractive"
                onLoad={() => setChartLoaded(true)}
            />

            {/* Status Message */}
            {statusMessage && (
                <div
                    className={`fixed top-20 right-5 px-5 py-3 rounded-lg font-semibold z-50 shadow-lg animate-pulse ${
                        statusMessage.type === 'error' ? 'bg-red-500' :
                        statusMessage.type === 'success' ? 'bg-emerald-500' : 'bg-cyan'
                    } text-white`}
                >
                    {statusMessage.message}
                </div>
            )}

            <section className="py-8 px-5 mx-auto max-w-[1400px]">
                {/* Header */}
                <div className="flex justify-between items-center mb-10">
                    <a href="https://kamiyo.ai" className="inline-block">
                        <img src="/media/KAMIYO_logomark.png" alt="KAMIYO" className="h-7" />
                    </a>
                    <button
                        onClick={connectWallet}
                        className={`flex items-center gap-3 px-5 py-3 rounded-full transition-all font-medium text-sm tracking-wide ${
                            walletConnected
                                ? 'bg-[#AB9FF2] text-black'
                                : 'bg-[#AB9FF2] hover:bg-[#9B8FE2] text-black'
                        }`}
                    >
                        <img src="/media/phantom-logo.svg" alt="Phantom" className="w-5 h-5" />
                        {walletConnected ? shortAddress : 'CONNECT WALLET'}
                    </button>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap justify-center gap-8 mb-8">
                    <span className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Live on Mainnet
                    </span>
                    <a
                        href={EXPLORER_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Program: <span className="text-emerald-400">✓</span> Deployed
                    </a>
                    <span className="text-sm text-gray-400">
                        Oracle: <span className="text-emerald-400">✓</span> Ready
                    </span>
                </div>

                {/* Tabs */}
                <div className="relative mb-8">
                    <div className="flex">
                        {['protocol', 'analytics', 'sdk'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 px-6 py-4 text-sm uppercase tracking-wider transition-all ${
                                    activeTab === tab
                                        ? 'text-white'
                                        : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                {tab === 'protocol' ? 'Protocol' : tab === 'analytics' ? 'Live Analytics' : 'SDK Integration'}
                            </button>
                        ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-[#222]"></div>
                    <div
                        className="absolute bottom-0 h-0.5 bg-cyan transition-all duration-300"
                        style={{
                            left: activeTab === 'protocol' ? '0%' : activeTab === 'analytics' ? '33.33%' : '66.66%',
                            width: '33.33%'
                        }}
                    ></div>
                </div>

                {/* Tab Content */}
                {activeTab === 'protocol' && (
                    <ProtocolTab
                        transactions={transactions}
                        amount={amount}
                        setAmount={setAmount}
                        walletConnected={walletConnected}
                        showStatus={showStatus}
                    />
                )}

                {activeTab === 'analytics' && (
                    <AnalyticsTab
                        stats={stats}
                        transactions={transactions}
                        loading={loading}
                        chartRef={chartRef}
                    />
                )}

                {activeTab === 'sdk' && <SDKTab />}
            </section>

            {/* Footer */}
            <footer className="border-t border-[#1a1a1a] mt-16 py-16 px-5 bg-[#0a0a0a]">
                <div className="max-w-[1400px] mx-auto text-center">
                    <a href="https://kamiyo.ai" className="inline-block mb-4">
                        <img src="/media/KAMIYO_logomark.png" alt="KAMIYO" className="h-12 mx-auto mb-2" />
                    </a>
                    <p className="text-gray-400 text-sm mb-2">Escrow and Dispute Resolution</p>
                    <p className="text-gray-600 text-sm max-w-2xl mx-auto mb-6">
                        Escrow protection with multi-oracle dispute resolution. Quality-based settlement for agent transactions.
                    </p>
                    <div className="flex justify-center gap-6">
                        <a href="https://kamiyo.ai" className="text-cyan hover:text-cyan/80 text-sm transition-colors">Visit KAMIYO</a>
                        <a href="https://github.com/kamiyo-ai/kamiyo" className="text-cyan hover:text-cyan/80 text-sm transition-colors">GitHub</a>
                        <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="text-cyan hover:text-cyan/80 text-sm transition-colors">Solana Explorer</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

// Protocol Tab Component
function ProtocolTab({ transactions, amount, setAmount, walletConnected, showStatus }) {
    const displayTransactions = transactions.length > 0 ? transactions.slice(0, 3) : SAMPLE_TRANSACTIONS;
    const isSample = transactions.length === 0;

    return (
        <div className="space-y-6">
            {/* Main Container - Live Dispute Resolution */}
            <div className="border border-[#333] rounded-lg p-8">
                <h2 className="text-xl font-light mb-4">Live Dispute Resolution</h2>

                {/* Cyan Banner */}
                <div className="bg-gradient-to-r from-cyan/20 to-cyan/5 border border-cyan/30 rounded px-4 py-3 mb-8">
                    <p className="text-cyan text-sm">
                        Real escrow transactions on Solana Mainnet with oracle-verified quality assessment.
                    </p>
                </div>

                {/* Recent Assessments Section */}
                <div className="border border-[#333] rounded-lg p-6 mb-6">
                    <h3 className="text-base font-light mb-4">Recent On-Chain Oracle Assessments</h3>

                    {displayTransactions.length > 0 ? (
                        <div className="space-y-4 mb-4">
                            {displayTransactions.map((tx, idx) => (
                                <div key={tx.signature || tx.id} className={`pb-4 ${idx < displayTransactions.length - 1 ? 'border-b border-[#333]' : ''}`}>
                                    <div className="text-cyan text-sm mb-2">Assessment {(tx.signature || tx.id).substring(0, 8)}...</div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-500">Quality Score:</span>
                                        <span className="gradient-text">{tx.qualityScore}/100</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Refund:</span>
                                        <span className="text-cyan">{tx.refund.toFixed(3)} SOL</span>
                                    </div>
                                </div>
                            ))}
                            {isSample && (
                                <p className="text-center text-gray-600 text-xs">
                                    Sample data shown - connect wallet for live transactions
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                            <p>No recent oracle assessments found.</p>
                            <p className="text-gray-600 mt-1">Connect your wallet and run the quality assessment below to create your first on-chain transaction!</p>
                        </div>
                    )}

                    <div className="border-t border-[#333] pt-4">
                        <a
                            href={`https://explorer.solana.com/address/${PROGRAM_ID}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-cyan hover:text-cyan/80"
                        >
                            View All Program Transactions →
                        </a>
                    </div>
                </div>

                {/* Transaction Input */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">Transaction Value (SOL)</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        step="0.01"
                        min="0.01"
                        className="w-full bg-[#111] border border-[#333] rounded px-4 py-3 text-white focus:border-cyan focus:outline-none"
                    />
                </div>
                <p className="text-xs text-gray-500 mb-6">Transactions &gt; 1 SOL require 3-oracle consensus</p>

                {/* Button */}
                <button
                    onClick={() => {
                        if (!walletConnected) {
                            showStatus('Please connect your wallet first', 'error');
                            return;
                        }
                        showStatus('Quality assessment feature coming soon', 'info');
                    }}
                    className="group relative inline-block py-3 px-8 text-white font-medium uppercase tracking-wider text-sm"
                >
                    <span className="absolute inset-0 border-2 border-dashed border-magenta rounded-sm transform -skew-x-3 group-hover:skew-x-0 transition-transform"></span>
                    <span className="relative">Run on-chain quality assessment</span>
                </button>
            </div>

            {/* Cost Comparison Container */}
            <div className="border border-[#333] rounded-lg p-8">
                <h2 className="text-xl font-light mb-6">Cost Comparison</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="border border-[#333] rounded-lg p-6 text-center">
                        <div className="text-gray-500 text-xs uppercase tracking-wider mb-3">Traditional Processors</div>
                        <div className="text-3xl font-light text-white mb-1">$35</div>
                        <div className="text-gray-600 text-xs mb-4">Per Dispute</div>
                        <div className="text-2xl font-light text-white mb-1">90 days</div>
                        <div className="text-gray-600 text-xs">Resolution Time</div>
                    </div>
                    <div className="border border-magenta/50 rounded-lg p-6 text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-magenta/10 to-transparent pointer-events-none"></div>
                        <div className="text-cyan text-xs uppercase tracking-wider mb-3 relative">KAMIYO</div>
                        <div className="text-3xl font-light gradient-text mb-1 relative">$0.02</div>
                        <div className="text-gray-600 text-xs mb-4 relative">Per Dispute</div>
                        <div className="text-2xl font-light gradient-text mb-1 relative">48 hours</div>
                        <div className="text-gray-600 text-xs relative">Resolution Time</div>
                    </div>
                </div>
                <div className="text-center text-sm">
                    <p className="text-gray-400 mb-1">84-94% cost reduction • 97-99% faster</p>
                    <p className="text-gray-600">Powered by Solana blockchain + decentralized oracles</p>
                </div>
            </div>
        </div>
    );
}

// Analytics Tab Component
function AnalyticsTab({ stats, transactions, loading, chartRef }) {
    const displayTransactions = transactions.length > 0 ? transactions : SAMPLE_TRANSACTIONS;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Chart */}
            <div className="lg:col-span-1">
                <h2 className="text-xl font-light mb-4">Quality Distribution</h2>
                <div className="bg-[#0a0a0a] rounded-lg border border-[#222] p-6 h-64">
                    <canvas ref={chartRef}></canvas>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="lg:col-span-2">
                <h2 className="text-xl font-light mb-4">Program Analytics</h2>
                {loading ? (
                    <div className="text-center py-12 text-gray-500">Loading analytics...</div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-[#222]">
                                <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Total Assessments</div>
                                <div className="text-3xl font-light gradient-text">{stats.totalAssessments}</div>
                            </div>
                            <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-[#222]">
                                <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Completed</div>
                                <div className="text-3xl font-light gradient-text">{stats.completed}</div>
                            </div>
                            <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-[#222]">
                                <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Avg Quality</div>
                                <div className="text-3xl font-light gradient-text">{stats.avgQuality}</div>
                            </div>
                            <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-[#222]">
                                <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Total Refunded</div>
                                <div className="text-3xl font-light gradient-text">{stats.totalRefunded} SOL</div>
                            </div>
                        </div>

                        {/* Recent Transactions */}
                        <h3 className="text-lg font-light mb-4">Recent Transactions</h3>
                        <div className="bg-[#0a0a0a] rounded-lg border border-[#222] p-6">
                            {displayTransactions.length > 0 ? (
                                <div className="space-y-3">
                                    {displayTransactions.slice(0, 5).map((tx, idx) => (
                                        <div key={tx.signature || tx.id} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">{(tx.signature || tx.id).substring(0, 12)}...</span>
                                            <span className="text-cyan">{tx.qualityScore}/100</span>
                                            <span className={tx.refund > 0 ? 'text-emerald-400' : 'text-gray-600'}>
                                                {tx.refund > 0 ? `${tx.refund.toFixed(3)} SOL` : '-'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500">No recent transactions found.</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// SDK Tab Component
function SDKTab() {
    const [copied, setCopied] = useState(null);

    const copyCode = (code, id) => {
        navigator.clipboard.writeText(code);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const tsCode = `import { EscrowClient, KamiyoClient } from '@kamiyo/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';

// Initialize connection and wallet
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate();
const provider = new AnchorProvider(connection, wallet, {});

// Initialize escrow client
const escrowClient = new EscrowClient(provider);
const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

// Create escrow payment
const escrowId = 'tx_' + Date.now();
const apiWallet = new PublicKey('...');
const amount = 0.01; // SOL

const tx = await escrowClient.initializeEscrow(
    escrowId,
    apiWallet,
    amount,
    provider.wallet.publicKey
);
console.log('Escrow created:', tx);`;

    const pyCode = `from multi_oracle import MultiOracleSystem, OracleAssessment
import secrets

# Initialize multi-oracle system
system = MultiOracleSystem()

# Register oracles (10 SOL minimum stake)
for i in range(5):
    key = SigningKey.generate()
    system.register_oracle(key.verify_key, 10.0 + i, key)

# High-value transaction (>1 SOL) requires multi-oracle
transaction_value = 1.5
required, count = system.requires_multi_oracle(transaction_value)

if required:
    # Select 3 oracles randomly
    seed = secrets.token_bytes(32)
    selected = system.select_oracles(count, seed)

    # Calculate consensus from assessments
    consensus = system.calculate_consensus(assessments)
    print(f"Median Score: {consensus.median_score}/100")
    print(f"Confidence: {consensus.confidence}%")`;

    const rustCode = `use anchor_lang::prelude::*;

#[program]
pub mod mitama {
    use super::*;

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        quality_score: u8,
        refund_percentage: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        // Verify Ed25519 signature from oracle
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            &ctx.accounts.verifier.key(),
            &message
        )?;

        // Calculate refund based on quality score
        let refund = calculate_refund(
            escrow.amount,
            quality_score,
            refund_percentage
        );

        // Execute refund
        escrow.transfer_refund(refund)?;

        Ok(())
    }
}`;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* TypeScript */}
            <div className="bg-[#0a0a0a] rounded-lg border border-[#222] p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-light">TypeScript SDK</h2>
                    <button
                        onClick={() => copyCode(tsCode, 'ts')}
                        className="text-xs text-gray-500 hover:text-cyan transition-colors"
                    >
                        {copied === 'ts' ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono bg-black/50 p-4 rounded-lg">
                    {tsCode}
                </pre>
            </div>

            {/* Python */}
            <div className="bg-[#0a0a0a] rounded-lg border border-[#222] p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-light">Python Verifier</h2>
                    <button
                        onClick={() => copyCode(pyCode, 'py')}
                        className="text-xs text-gray-500 hover:text-cyan transition-colors"
                    >
                        {copied === 'py' ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono bg-black/50 p-4 rounded-lg">
                    {pyCode}
                </pre>
            </div>

            {/* Rust */}
            <div className="bg-[#0a0a0a] rounded-lg border border-[#222] p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-light">Rust Smart Contract</h2>
                    <button
                        onClick={() => copyCode(rustCode, 'rust')}
                        className="text-xs text-gray-500 hover:text-cyan transition-colors"
                    >
                        {copied === 'rust' ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono bg-black/50 p-4 rounded-lg">
                    {rustCode}
                </pre>
            </div>
        </div>
    );
}

// Use custom layout (bypass default Layout wrapper)
Protocol.getLayout = function getLayout(page) {
    return page;
};
