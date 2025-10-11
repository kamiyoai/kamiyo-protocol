/**
 * APIDocsPage Component
 * Interactive API documentation with code examples
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Code, Terminal, Book } from 'lucide-react';
import { useAuthStore, useNotifications } from '@/store/appStore';

interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  response: string;
  examples: {
    curl: string;
    python: string;
    javascript: string;
  };
}

const endpoints: APIEndpoint[] = [
  {
    method: 'GET',
    path: '/exploits',
    description: 'Get list of exploits with pagination and filtering',
    auth: false,
    parameters: [
      { name: 'page', type: 'number', required: false, description: 'Page number (default: 1)' },
      { name: 'page_size', type: 'number', required: false, description: 'Items per page (default: 100, max: 1000)' },
      { name: 'chain', type: 'string', required: false, description: 'Filter by blockchain' },
      { name: 'min_amount', type: 'number', required: false, description: 'Minimum loss amount (USD)' },
      { name: 'protocol', type: 'string', required: false, description: 'Filter by protocol name' },
    ],
    response: `{
  "data": [...],
  "total": 1234,
  "page": 1,
  "page_size": 100,
  "has_more": true
}`,
    examples: {
      curl: `curl -X GET "https://api.kamiyo.io/exploits?page=1&page_size=50&chain=Ethereum" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      python: `import requests

response = requests.get(
    "https://api.kamiyo.io/exploits",
    params={"page": 1, "page_size": 50, "chain": "Ethereum"},
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
data = response.json()`,
      javascript: `const response = await fetch('https://api.kamiyo.io/exploits?page=1&page_size=50&chain=Ethereum', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const data = await response.json();`,
    },
  },
  {
    method: 'GET',
    path: '/exploits/{tx_hash}',
    description: 'Get single exploit by transaction hash',
    auth: false,
    parameters: [
      { name: 'tx_hash', type: 'string', required: true, description: 'Transaction hash' },
    ],
    response: `{
  "tx_hash": "0x...",
  "protocol": "SomeProtocol",
  "chain": "Ethereum",
  "amount_usd": 1000000,
  "attack_type": "Reentrancy",
  "timestamp": "2024-01-15T10:30:00Z",
  "source": "BlockSec",
  "verified": true
}`,
    examples: {
      curl: `curl -X GET "https://api.kamiyo.io/exploits/0x123..." \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      python: `import requests

response = requests.get(
    "https://api.kamiyo.io/exploits/0x123...",
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
exploit = response.json()`,
      javascript: `const response = await fetch('https://api.kamiyo.io/exploits/0x123...', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const exploit = await response.json();`,
    },
  },
  {
    method: 'GET',
    path: '/stats',
    description: 'Get statistics for specified time period',
    auth: false,
    parameters: [
      { name: 'days', type: 'number', required: false, description: 'Time period in days (default: 1, max: 365)' },
    ],
    response: `{
  "total_exploits": 42,
  "total_loss_usd": 15000000,
  "affected_chains": 8,
  "affected_protocols": 25,
  "period_days": 7,
  "top_chains": [...],
  "top_protocols": [...]
}`,
    examples: {
      curl: `curl -X GET "https://api.kamiyo.io/stats?days=7" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      python: `import requests

response = requests.get(
    "https://api.kamiyo.io/stats",
    params={"days": 7},
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
stats = response.json()`,
      javascript: `const response = await fetch('https://api.kamiyo.io/stats?days=7', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const stats = await response.json();`,
    },
  },
];

type CodeLanguage = 'curl' | 'python' | 'javascript';

export const APIDocsPage: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<CodeLanguage>('curl');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { user } = useAuthStore();
  const { addNotification } = useNotifications();

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    addNotification({
      type: 'success',
      message: 'Code copied to clipboard',
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getMethodColor = (method: string): string => {
    const colors = {
      GET: 'bg-green-100 text-green-800',
      POST: 'bg-blue-100 text-blue-800',
      PUT: 'bg-yellow-100 text-yellow-800',
      DELETE: 'bg-red-100 text-red-800',
    };
    return colors[method as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="api-docs-page">
      {/* Header */}
      <section className="docs-header">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="header-content"
        >
          <div className="header-icon">
            <Book size={48} />
          </div>
          <h1 className="header-title">API Documentation</h1>
          <p className="header-subtitle">
            Complete reference for the Kamiyo Exploit Intelligence API
          </p>

          {user && (
            <div className="api-key-display">
              <label>Your API Key:</label>
              <code>{user.api_key || 'Generate an API key from your dashboard'}</code>
            </div>
          )}
        </motion.div>
      </section>

      {/* Authentication */}
      <section className="docs-section">
        <h2 className="section-title">Authentication</h2>
        <div className="section-content">
          <p>
            All API requests require authentication using your API key. Include your API
            key in the Authorization header:
          </p>
          <div className="code-block">
            <code>Authorization: Bearer YOUR_API_KEY</code>
          </div>
          <p className="note">
            Free tier users can access public endpoints without authentication, but with
            lower rate limits.
          </p>
        </div>
      </section>

      {/* Rate Limiting */}
      <section className="docs-section">
        <h2 className="section-title">Rate Limiting</h2>
        <div className="section-content">
          <table className="rate-limits-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Rate Limit</th>
                <th>Monthly Calls</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>10 req/min</td>
                <td>3,000</td>
              </tr>
              <tr>
                <td>Starter</td>
                <td>60 req/min</td>
                <td>10,000</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>300 req/min</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Enterprise</td>
                <td>Custom</td>
                <td>Unlimited</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Language Selector */}
      <div className="language-selector">
        <Terminal size={20} />
        <span>Code Examples:</span>
        <div className="selector-buttons">
          {(['curl', 'python', 'javascript'] as CodeLanguage[]).map((lang) => (
            <button
              key={lang}
              className={`lang-btn ${selectedLanguage === lang ? 'active' : ''}`}
              onClick={() => setSelectedLanguage(lang)}
            >
              {lang === 'curl' ? 'cURL' : lang.charAt(0).toUpperCase() + lang.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <section className="endpoints-section">
        <h2 className="section-title">Endpoints</h2>

        {endpoints.map((endpoint, index) => {
          const codeId = `${endpoint.method}-${endpoint.path}`;
          const code = endpoint.examples[selectedLanguage];

          return (
            <motion.div
              key={codeId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="endpoint-card"
            >
              <div className="endpoint-header">
                <span className={`method-badge ${getMethodColor(endpoint.method)}`}>
                  {endpoint.method}
                </span>
                <code className="endpoint-path">{endpoint.path}</code>
                {endpoint.auth && <span className="auth-badge">🔒 Auth Required</span>}
              </div>

              <p className="endpoint-description">{endpoint.description}</p>

              {/* Parameters */}
              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div className="parameters-section">
                  <h4>Parameters</h4>
                  <table className="parameters-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Required</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.parameters.map((param) => (
                        <tr key={param.name}>
                          <td>
                            <code>{param.name}</code>
                          </td>
                          <td>{param.type}</td>
                          <td>{param.required ? 'Yes' : 'No'}</td>
                          <td>{param.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Response */}
              <div className="response-section">
                <h4>Response Example</h4>
                <div className="code-block">
                  <pre>{endpoint.response}</pre>
                </div>
              </div>

              {/* Code Example */}
              <div className="example-section">
                <div className="example-header">
                  <Code size={16} />
                  <span>Example Request</span>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopyCode(code, codeId)}
                    aria-label="Copy code"
                  >
                    {copiedCode === codeId ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
                <div className="code-block">
                  <pre>{code}</pre>
                </div>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* Webhooks */}
      <section className="docs-section">
        <h2 className="section-title">Webhooks</h2>
        <div className="section-content">
          <p>
            Configure webhooks to receive real-time notifications when new exploits are
            detected.
          </p>
          <p>
            Webhook payload example:
          </p>
          <div className="code-block">
            <pre>{`{
  "event": "exploit.detected",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "tx_hash": "0x...",
    "protocol": "SomeProtocol",
    "chain": "Ethereum",
    "amount_usd": 1000000,
    "attack_type": "Reentrancy"
  }
}`}</pre>
          </div>
        </div>
      </section>

      {/* Support */}
      <section className="docs-cta">
        <h2>Need Help?</h2>
        <p>Our team is here to assist you with integration and support.</p>
        <a href="mailto:support@kamiyo.io" className="cta-button">
          Contact Support
        </a>
      </section>
    </div>
  );
};

export default APIDocsPage;
