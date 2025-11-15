// API Keys Dashboard Page
// Allows users to view, create, and revoke their API keys

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { csrfFetch } from '../../utils/csrf'; // BLOCKER 1: CSRF Protection

export default function ApiKeysPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [apiKeys, setApiKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newKeyName, setNewKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState(null); // Store newly created key to display once
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/');
        }
    }, [status, router]);

    // Load API keys
    useEffect(() => {
        if (status === 'authenticated') {
            loadApiKeys();
        }
    }, [status]);

    async function loadApiKeys() {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`/api/user/api-keys?email=${encodeURIComponent(session.user.email)}`);

            if (!response.ok) {
                throw new Error('Failed to load API keys');
            }

            const data = await response.json();
            setApiKeys(data.apiKeys || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function createApiKey() {
        try {
            setError(null);

            // Use csrfFetch for CSRF-protected POST request (BLOCKER 1)
            const response = await csrfFetch('/api/user/api-keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: session.user.email,
                    name: newKeyName || undefined
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to create API key');
            }

            // Show the new key (only time it's visible!)
            setCreatedKey(data.apiKey);
            setNewKeyName('');
            setShowCreateForm(false);

            // Reload list
            await loadApiKeys();
        } catch (err) {
            setError(err.message);
        }
    }

    async function revokeApiKey(keyId) {
        if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
            return;
        }

        try {
            setError(null);

            // Use csrfFetch for CSRF-protected DELETE request (BLOCKER 1)
            const response = await csrfFetch('/api/user/api-keys', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: session.user.email,
                    keyId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to revoke API key');
            }

            // Reload list
            await loadApiKeys();
        } catch (err) {
            setError(err.message);
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    }

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white py-10 px-5">
            <div className="max-w-[1400px] mx-auto">
                {/* Navigation */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => router.push('/')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            ← Home
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/api-keys')}
                            className="text-white text-sm border-b border-cyan"
                        >
                            API Keys
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/usage')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Usage Analytics
                        </button>
                        <button
                            onClick={() => router.push('/pricing')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Pricing
                        </button>
                    </div>
                </div>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">API Keys</h1>
                    <p className="text-gray-400">
                        Manage your KAMIYO API keys for programmatic access
                    </p>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-900/20 border border-red-500 border-dotted p-4 mb-6">
                        <p className="text-red-400">Error: {error}</p>
                    </div>
                )}

                {/* New Key Created (show full key once) */}
                {createdKey && (
                    <div className="bg-cyan/10 border border-cyan border-dotted p-6 mb-6">
                        <h3 className="text-xl font-semibold mb-2 text-cyan">
                            API Key Created Successfully!
                        </h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Save this key securely. You won't be able to see it again.
                        </p>

                        <div className="bg-gray-900 border-dotted p-4 font-mono text-sm">
                            <div className="flex items-center justify-between">
                                <code className="text-cyan">{createdKey.key}</code>
                                <button
                                    onClick={() => copyToClipboard(createdKey.key)}
                                    className="ml-4 px-4 py-2 bg-cyan/20 hover:bg-cyan/30 border-dotted text-cyan transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setCreatedKey(null)}
                            className="mt-4 text-sm text-gray-400 hover:text-white"
                        >
                            I've saved this key
                        </button>
                    </div>
                )}

                {/* Create New Key Button/Form */}
                {!showCreateForm && (
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="mb-6 px-6 py-3 bg-cyan hover:bg-cyan/80 text-black font-semibold border-dotted transition"
                    >
                        + Create New API Key
                    </button>
                )}

                {showCreateForm && (
                    <div className="bg-gray-900 border border-kamiyo-border border-dotted p-6 mb-6">
                        <h3 className="text-xl font-semibold mb-4">Create New API Key</h3>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">
                                Key Name (optional)
                            </label>
                            <input
                                type="text"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="e.g., Production Server, Development, etc."
                                className="w-full px-4 py-2 bg-black border border-kamiyo-border border-dotted focus:border-cyan focus:outline-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={createApiKey}
                                className="px-6 py-2 bg-cyan hover:bg-cyan/80 text-black font-semibold border-dotted transition"
                            >
                                Generate Key
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateForm(false);
                                    setNewKeyName('');
                                }}
                                className="px-6 py-2 bg-transparent border border-kamiyo-border hover:border-gray-500 border-dotted transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* API Keys List */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold mb-4">Your API Keys</h2>

                    {apiKeys.length === 0 ? (
                        <div className="bg-gray-900 border border-kamiyo-border border-dotted py-10 px-5 text-center">
                            <p className="text-gray-400">No API keys yet. Create one to get started!</p>
                        </div>
                    ) : (
                        apiKeys.map((key) => (
                            <div
                                key={key.id}
                                className="bg-gray-900 border border-kamiyo-border border-dotted p-6 hover:border-cyan/30 transition"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold">
                                                {key.name || 'Unnamed Key'}
                                            </h3>
                                            <span
                                                className={`px-2 py-1 border-dotted text-xs font-medium ${
                                                    key.status === 'active'
                                                        ? 'bg-green-900/30 text-green-400'
                                                        : 'bg-red-900/30 text-red-400'
                                                }`}
                                            >
                                                {key.status === 'active' ? 'Active' : 'Revoked'}
                                            </span>
                                        </div>

                                        <div className="font-mono text-sm text-gray-400 mb-3">
                                            {key.key}
                                        </div>

                                        <div className="text-sm text-gray-500 space-y-1">
                                            <p>Created: {new Date(key.createdAt).toLocaleDateString()}</p>
                                            {key.lastUsedAt && (
                                                <p>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</p>
                                            )}
                                            {key.revokedAt && (
                                                <p>Revoked: {new Date(key.revokedAt).toLocaleDateString()}</p>
                                            )}
                                        </div>
                                    </div>

                                    {key.status === 'active' && (
                                        <button
                                            onClick={() => revokeApiKey(key.id)}
                                            className="ml-4 px-4 py-2 bg-red-900/20 hover:bg-red-900/30 border border-red-500/30 hover:border-red-500 text-red-400 border-dotted transition text-sm"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Documentation */}
                <div className="mt-12 bg-gray-900 border border-kamiyo-border border-dotted p-6">
                    <h3 className="text-xl font-semibold mb-4">Using Your API Key</h3>

                    <div className="space-y-4 text-sm text-gray-300">
                        <p>
                            Use your API key to authenticate requests to the KAMIYO API:
                        </p>

                        <div className="bg-black border-dotted p-4 font-mono text-xs overflow-x-auto">
                            <pre>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     https://api.kamiyo.ai/v2/exploits/recent`}</pre>
                        </div>

                        <div className="space-y-2">
                            <p className="font-semibold">Security Best Practices:</p>
                            <ul className="list-disc list-inside space-y-1 ml-4">
                                <li>Never share your API keys publicly</li>
                                <li>Use environment variables to store keys</li>
                                <li>Revoke keys immediately if compromised</li>
                                <li>Create separate keys for different applications</li>
                                <li>Rotate keys periodically for better security</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
