// components/dashboard/DashboardFilters.js
import { useState, useEffect } from "react";

export default function DashboardFilters({ onFiltersChange }) {
    const [chains, setChains] = useState([]);
    const [selectedChain, setSelectedChain] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [protocol, setProtocol] = useState('');

    useEffect(() => {
        loadChains();
    }, []);

    const loadChains = async () => {
        try {
            const response = await fetch('/api/chains');
            const data = await response.json();
            setChains(data.chains || []);
        } catch (error) {
            console.error('Error loading chains:', error);
        }
    };

    const applyFilters = () => {
        const filters = {};
        if (selectedChain) filters.chain = selectedChain;
        if (minAmount) filters.min_amount = minAmount;
        if (protocol) filters.protocol = protocol;
        onFiltersChange(filters);
    };

    return (
        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                {/* Chain Filter */}
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                        Chain
                    </label>
                    <select
                        value={selectedChain}
                        onChange={(e) => setSelectedChain(e.target.value)}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-cyan transition-colors"
                    >
                        <option value="">All Chains</option>
                        {chains.map((chain) => (
                            <option key={chain.chain} value={chain.chain}>
                                {chain.chain} ({chain.exploit_count})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Min Amount Filter */}
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                        Min Amount (USD)
                    </label>
                    <input
                        type="number"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        placeholder="e.g., 1000000"
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-cyan transition-colors"
                    />
                </div>

                {/* Protocol Filter */}
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                        Protocol
                    </label>
                    <input
                        type="text"
                        value={protocol}
                        onChange={(e) => setProtocol(e.target.value)}
                        placeholder="Search protocol..."
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-cyan transition-colors"
                    />
                </div>

                {/* Apply Button */}
                <div>
                    <button
                        onClick={applyFilters}
                        className="w-full px-4 py-2 text-xs uppercase tracking-wider bg-black border border-gray-500 border-opacity-25 rounded hover:border-magenta transition-colors"
                    >
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    );
}
