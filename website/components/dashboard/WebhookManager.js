// components/dashboard/WebhookManager.js
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ScrambleButton } from '../ScrambleButton';

export default function WebhookManager() {
    const { data: session } = useSession();
    const [webhooks, setWebhooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [error, setError] = useState(null);
    const [newSecret, setNewSecret] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        url: '',
        min_amount_usd: '',
        chains: '',
        protocols: ''
    });

    useEffect(() => {
        loadWebhooks();
    }, []);

    const loadWebhooks = async () => {
        try {
            const res = await fetch('/api/v1/user-webhooks', {
                headers: {
                    'Authorization': `Bearer ${session?.user?.apiKey || ''}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setWebhooks(data.webhooks || []);
            } else {
                const errorData = await res.json();
                setError(errorData.detail || 'Failed to load webhooks');
            }
        } catch (err) {
            setError('Network error loading webhooks');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError(null);

        try {
            const payload = {
                name: formData.name,
                url: formData.url,
                min_amount_usd: formData.min_amount_usd ? parseFloat(formData.min_amount_usd) : null,
                chains: formData.chains ? formData.chains.split(',').map(c => c.trim()) : null,
                protocols: formData.protocols ? formData.protocols.split(',').map(p => p.trim()) : null
            };

            const res = await fetch('/api/v1/user-webhooks', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.user?.apiKey || ''}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                setNewSecret(data.secret);
                setWebhooks([...webhooks, data]);
                setShowCreateForm(false);
                setFormData({ name: '', url: '', min_amount_usd: '', chains: '', protocols: '' });
            } else {
                const errorData = await res.json();
                setError(errorData.detail || 'Failed to create webhook');
            }
        } catch (err) {
            setError('Network error creating webhook');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this webhook? This action cannot be undone.')) return;

        try {
            const res = await fetch(`/api/v1/user-webhooks/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session?.user?.apiKey || ''}`
                }
            });

            if (res.ok) {
                setWebhooks(webhooks.filter(w => w.id !== id));
            } else {
                const errorData = await res.json();
                alert(errorData.detail || 'Failed to delete webhook');
            }
        } catch (err) {
            alert('Network error deleting webhook');
        }
    };

    const handleTest = async (id) => {
        try {
            const res = await fetch(`/api/v1/user-webhooks/${id}/test`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.user?.apiKey || ''}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                alert(`✅ Test successful!\nStatus: ${data.status_code}\nLatency: ${data.latency_ms}ms`);
            } else {
                const errorData = await res.json();
                alert(`❌ Test failed: ${errorData.detail}`);
            }
        } catch (err) {
            alert('Network error testing webhook');
        }
    };

    if (loading) {
        return <div className="text-gray-400">Loading webhooks...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-light">Webhook Endpoints</h2>
                <ScrambleButton
                    text={showCreateForm ? 'Cancel' : 'Create Webhook'}
                    onClick={() => setShowCreateForm(!showCreateForm)}
                />
            </div>

            {error && (
                <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 p-4 rounded text-sm">
                    {error}
                </div>
            )}

            {newSecret && (
                <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 p-4 rounded">
                    <h3 className="text-yellow-500 font-semibold mb-2">⚠️ Save Your Secret</h3>
                    <p className="text-gray-300 text-sm mb-2">This secret will only be shown once. Copy it now:</p>
                    <code className="block bg-black p-2 rounded text-xs text-cyan break-all">{newSecret}</code>
                    <button
                        onClick={() => setNewSecret(null)}
                        className="mt-2 text-yellow-500 text-xs hover:underline"
                    >
                        I've saved it, close this
                    </button>
                </div>
            )}

            {showCreateForm && (
                <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-500 border-opacity-25 p-6 rounded-lg space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full bg-black border border-gray-500 border-opacity-50 rounded px-3 py-2 text-white text-sm"
                            placeholder="Production Alerts"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">HTTPS URL</label>
                        <input
                            type="url"
                            value={formData.url}
                            onChange={(e) => setFormData({...formData, url: e.target.value})}
                            className="w-full bg-black border border-gray-500 border-opacity-50 rounded px-3 py-2 text-white text-sm"
                            placeholder="https://your-domain.com/webhooks/kamiyo"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Minimum Amount (USD) - Optional</label>
                        <input
                            type="number"
                            value={formData.min_amount_usd}
                            onChange={(e) => setFormData({...formData, min_amount_usd: e.target.value})}
                            className="w-full bg-black border border-gray-500 border-opacity-50 rounded px-3 py-2 text-white text-sm"
                            placeholder="100000"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Chains (comma-separated) - Optional</label>
                        <input
                            type="text"
                            value={formData.chains}
                            onChange={(e) => setFormData({...formData, chains: e.target.value})}
                            className="w-full bg-black border border-gray-500 border-opacity-50 rounded px-3 py-2 text-white text-sm"
                            placeholder="ethereum, arbitrum, base"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Protocols (comma-separated) - Optional</label>
                        <input
                            type="text"
                            value={formData.protocols}
                            onChange={(e) => setFormData({...formData, protocols: e.target.value})}
                            className="w-full bg-black border border-gray-500 border-opacity-50 rounded px-3 py-2 text-white text-sm"
                            placeholder="uniswap, aave, compound"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={creating}
                        className="w-full bg-transparent"
                    >
                        <div className="flex justify-center">
                            <ScrambleButton
                                text={creating ? 'Creating...' : 'Create Webhook'}
                                enabled={!creating}
                                loading={creating}
                            />
                        </div>
                    </button>
                </form>
            )}

            {webhooks.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                    <p>No webhooks configured</p>
                    <p className="text-sm mt-2">Create your first webhook to receive real-time alerts</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {webhooks.map((webhook) => (
                        <div key={webhook.id} className="bg-gray-900 border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-light text-white">{webhook.name}</h3>
                                    <p className="text-xs text-gray-500 break-all">{webhook.url}</p>
                                </div>
                                <div className="flex gap-2">
                                    <span className={`text-xs px-2 py-1 rounded ${webhook.is_active ? 'bg-green-500 bg-opacity-20 text-green-500' : 'bg-red-500 bg-opacity-20 text-red-500'}`}>
                                        {webhook.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-xs">
                                <div>
                                    <span className="text-gray-500">Total Sent:</span>
                                    <span className="text-white ml-1">{webhook.total_sent}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Success:</span>
                                    <span className="text-green-500 ml-1">{webhook.total_success}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Failed:</span>
                                    <span className="text-red-500 ml-1">{webhook.total_failed}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Success Rate:</span>
                                    <span className="text-cyan ml-1">
                                        {webhook.total_sent > 0
                                            ? `${Math.round((webhook.total_success / webhook.total_sent) * 100)}%`
                                            : 'N/A'}
                                    </span>
                                </div>
                            </div>

                            {(webhook.min_amount_usd || webhook.chains || webhook.protocols) && (
                                <div className="mb-4 text-xs">
                                    <span className="text-gray-500">Filters:</span>
                                    {webhook.min_amount_usd && <span className="ml-2 text-gray-400">≥${webhook.min_amount_usd.toLocaleString()}</span>}
                                    {webhook.chains && <span className="ml-2 text-gray-400">{webhook.chains.join(', ')}</span>}
                                    {webhook.protocols && <span className="ml-2 text-gray-400">{webhook.protocols.join(', ')}</span>}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleTest(webhook.id)}
                                    className="px-3 py-1 bg-cyan bg-opacity-20 text-cyan text-xs rounded hover:bg-opacity-30 transition-colors"
                                >
                                    Test
                                </button>
                                <button
                                    onClick={() => handleDelete(webhook.id)}
                                    className="px-3 py-1 bg-red-500 bg-opacity-20 text-red-500 text-xs rounded hover:bg-opacity-30 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="text-xs text-gray-500 mt-8">
                <p>💡 <strong>Tip:</strong> Webhooks send POST requests with HMAC-SHA256 signatures in the X-Kamiyo-Signature header.</p>
                <p className="mt-1">📖 <a href="/api/v1/user-webhooks/docs" target="_blank" className="text-cyan hover:underline">View API Documentation</a></p>
            </div>
        </div>
    );
}
