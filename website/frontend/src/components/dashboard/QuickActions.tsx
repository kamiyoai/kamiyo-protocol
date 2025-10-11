/**
 * QuickActions Component
 * Provides quick access to common dashboard actions
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Key,
  Bell,
  Download,
  LifeBuoy,
  Settings,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useNotifications } from '@/store/appStore';
import { apiClient } from '@/api/client';
import Modal from '@/components/common/Modal';

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addNotification } = useNotifications();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateApiKey = async () => {
    try {
      setIsGenerating(true);
      const response = await apiClient.post('/auth/api-key/generate');
      setApiKey(response.data.api_key);
      addNotification({
        type: 'success',
        message: 'API key generated successfully',
      });
    } catch (error) {
      addNotification({
        type: 'error',
        message: 'Failed to generate API key',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    addNotification({
      type: 'success',
      message: 'API key copied to clipboard',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = async () => {
    try {
      const response = await apiClient.get('/reports/monthly', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kamiyo-report-${new Date().toISOString()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addNotification({
        type: 'success',
        message: 'Report downloaded successfully',
      });
    } catch (error) {
      addNotification({
        type: 'error',
        message: 'Failed to download report',
      });
    }
  };

  const actions = [
    {
      icon: <CreditCard size={24} />,
      label: 'Upgrade Plan',
      description: 'Get more features and higher limits',
      color: 'blue',
      onClick: () => navigate('/pricing'),
      show: user?.tier !== 'ENTERPRISE',
    },
    {
      icon: <Key size={24} />,
      label: 'Generate API Key',
      description: 'Create a new API key for integration',
      color: 'green',
      onClick: () => setShowApiKeyModal(true),
      show: true,
    },
    {
      icon: <Bell size={24} />,
      label: 'Configure Alerts',
      description: 'Set up notifications for new exploits',
      color: 'purple',
      onClick: () => navigate('/settings/alerts'),
      show: true,
    },
    {
      icon: <Download size={24} />,
      label: 'Download Report',
      description: 'Export monthly usage and activity',
      color: 'orange',
      onClick: handleDownloadReport,
      show: true,
    },
    {
      icon: <Settings size={24} />,
      label: 'Account Settings',
      description: 'Manage your account and preferences',
      color: 'gray',
      onClick: () => navigate('/settings'),
      show: true,
    },
    {
      icon: <LifeBuoy size={24} />,
      label: 'Contact Support',
      description: 'Get help from our support team',
      color: 'red',
      onClick: () => window.open('mailto:support@kamiyo.io', '_blank'),
      show: true,
    },
  ];

  const visibleActions = actions.filter((action) => action.show);

  return (
    <div className="quick-actions">
      <div className="actions-header">
        <Zap size={24} />
        <h2>Quick Actions</h2>
      </div>

      <div className="actions-grid">
        {visibleActions.map((action, index) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`action-card action-${action.color}`}
            onClick={action.onClick}
          >
            <div className="action-icon">{action.icon}</div>
            <div className="action-content">
              <h3 className="action-label">{action.label}</h3>
              <p className="action-description">{action.description}</p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* API Key Modal */}
      <Modal
        isOpen={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false);
          setApiKey('');
        }}
        title="Generate API Key"
        size="md"
      >
        <div className="api-key-modal">
          {!apiKey ? (
            <>
              <p className="modal-description">
                Generate a new API key to access the Kamiyo API. Keep this key secure
                and never share it publicly.
              </p>
              <div className="modal-warning">
                <AlertCircle size={20} />
                <p>
                  Generating a new key will invalidate your previous key. Make sure to
                  update all integrations.
                </p>
              </div>
              <button
                className="generate-btn"
                onClick={handleGenerateApiKey}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate New Key'}
              </button>
            </>
          ) : (
            <>
              <p className="modal-description">
                Your new API key has been generated. Copy it now - you won't be able to
                see it again.
              </p>
              <div className="api-key-display">
                <code className="api-key-code">{apiKey}</code>
                <button
                  className="copy-btn"
                  onClick={handleCopyApiKey}
                  aria-label="Copy API key"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <button
                className="close-btn"
                onClick={() => {
                  setShowApiKeyModal(false);
                  setApiKey('');
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default QuickActions;
