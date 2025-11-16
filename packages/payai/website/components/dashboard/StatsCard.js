// components/dashboard/StatsCard.js
export default function StatsCard({ label, value, loading = false }) {
    return (
        <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 transition-all duration-300 card hover:-translate-y-1">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                {label}
            </div>
            <div className="text-3xl font-light">
                {loading ? (
                    <span className="gradient-text">-</span>
                ) : (
                    <span className="gradient-text">{value}</span>
                )}
            </div>
        </div>
    );
}
