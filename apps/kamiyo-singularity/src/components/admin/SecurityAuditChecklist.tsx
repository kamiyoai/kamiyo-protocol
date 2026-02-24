'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: 'complete' | 'in_progress' | 'pending' | 'na';
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  notes?: string;
}

interface ChecklistCategory {
  name: string;
  items: ChecklistItem[];
}

const CHECKLIST: ChecklistCategory[] = [
  {
    name: 'Smart Contract Security',
    items: [
      {
        id: 'sc-1',
        title: 'Reentrancy Analysis',
        description: 'Review all cross-program invocations for reentrancy vulnerabilities',
        status: 'complete',
        priority: 'critical',
        category: 'Smart Contract Security',
        notes: 'All CPIs go to Token program (cannot callback). State updates after CPI.',
      },
      {
        id: 'sc-2',
        title: 'Arithmetic Overflow Protection',
        description: 'Verify all arithmetic operations use checked_* or saturating_* methods',
        status: 'complete',
        priority: 'critical',
        category: 'Smart Contract Security',
        notes: 'Using checked_add, checked_sub, checked_mul throughout.',
      },
      {
        id: 'sc-3',
        title: 'Account Ownership Verification',
        description: 'Ensure all accounts are properly verified using Anchor constraints',
        status: 'complete',
        priority: 'critical',
        category: 'Smart Contract Security',
      },
      {
        id: 'sc-4',
        title: 'PDA Derivation Security',
        description: 'Review PDA seeds and bump handling for collision resistance',
        status: 'complete',
        priority: 'high',
        category: 'Smart Contract Security',
      },
      {
        id: 'sc-5',
        title: 'Input Validation',
        description: 'All user inputs validated for bounds and format',
        status: 'in_progress',
        priority: 'high',
        category: 'Smart Contract Security',
        notes: 'Price bounds checked. Need to add MAX_ORDER_QUANTITY.',
      },
      {
        id: 'sc-6',
        title: 'Oracle Staleness Check',
        description: 'Implement price staleness validation for oracle data',
        status: 'pending',
        priority: 'medium',
        category: 'Smart Contract Security',
      },
      {
        id: 'sc-7',
        title: 'Fuzz Testing',
        description: 'libFuzzer setup for orderbook operations',
        status: 'complete',
        priority: 'high',
        category: 'Smart Contract Security',
        notes: 'Fuzz tests added in programs/orderbook/fuzz/',
      },
    ],
  },
  {
    name: 'Backend API Security',
    items: [
      {
        id: 'api-1',
        title: 'JWT Implementation',
        description: 'Secure JWT generation, validation, and rotation',
        status: 'complete',
        priority: 'critical',
        category: 'Backend API Security',
        notes: 'Key rotation mechanism implemented with kid support.',
      },
      {
        id: 'api-2',
        title: 'Rate Limiting',
        description: 'Per-endpoint rate limits on all mutating operations',
        status: 'complete',
        priority: 'critical',
        category: 'Backend API Security',
        notes: 'Orders: 10/min, Market creation: 1/hr, Claims: 5/min.',
      },
      {
        id: 'api-3',
        title: 'Security Headers',
        description: 'X-Content-Type-Options, X-Frame-Options, CSP, etc.',
        status: 'complete',
        priority: 'critical',
        category: 'Backend API Security',
      },
      {
        id: 'api-4',
        title: 'SQL Injection Prevention',
        description: 'Parameterized queries for all database operations',
        status: 'complete',
        priority: 'critical',
        category: 'Backend API Security',
      },
      {
        id: 'api-5',
        title: 'Input Validation',
        description: 'Request body size limits and schema validation',
        status: 'complete',
        priority: 'high',
        category: 'Backend API Security',
        notes: 'JSON body limit: 4KB.',
      },
      {
        id: 'api-6',
        title: 'WebSocket Authentication',
        description: 'Require authentication for WebSocket connections',
        status: 'pending',
        priority: 'high',
        category: 'Backend API Security',
      },
      {
        id: 'api-7',
        title: 'Request Tracing',
        description: 'X-Request-ID for all requests for audit trail',
        status: 'complete',
        priority: 'medium',
        category: 'Backend API Security',
      },
      {
        id: 'api-8',
        title: 'Idempotency Keys',
        description: 'Prevent duplicate order placement on network issues',
        status: 'complete',
        priority: 'medium',
        category: 'Backend API Security',
      },
    ],
  },
  {
    name: 'Frontend Security',
    items: [
      {
        id: 'fe-1',
        title: 'Token Storage',
        description: 'Access tokens in memory, refresh tokens in httpOnly cookies',
        status: 'complete',
        priority: 'critical',
        category: 'Frontend Security',
      },
      {
        id: 'fe-2',
        title: 'XSS Prevention',
        description: 'React auto-escaping, no dangerouslySetInnerHTML',
        status: 'complete',
        priority: 'critical',
        category: 'Frontend Security',
      },
      {
        id: 'fe-3',
        title: 'CSRF Protection',
        description: 'SameSite cookies for session management',
        status: 'complete',
        priority: 'critical',
        category: 'Frontend Security',
      },
      {
        id: 'fe-4',
        title: 'Error Boundaries',
        description: 'Graceful error handling without exposing internals',
        status: 'complete',
        priority: 'high',
        category: 'Frontend Security',
      },
      {
        id: 'fe-5',
        title: 'Dependency Audit',
        description: 'npm audit with no high/critical vulnerabilities',
        status: 'pending',
        priority: 'high',
        category: 'Frontend Security',
      },
    ],
  },
  {
    name: 'Infrastructure Security',
    items: [
      {
        id: 'infra-1',
        title: 'Secrets Management',
        description: 'External Secrets Operator for production secrets',
        status: 'complete',
        priority: 'critical',
        category: 'Infrastructure Security',
      },
      {
        id: 'infra-2',
        title: 'Database Encryption',
        description: 'Encryption at rest and in transit',
        status: 'pending',
        priority: 'critical',
        category: 'Infrastructure Security',
      },
      {
        id: 'infra-3',
        title: 'Network Segmentation',
        description: 'VPC configuration with proper security groups',
        status: 'pending',
        priority: 'high',
        category: 'Infrastructure Security',
      },
      {
        id: 'infra-4',
        title: 'Backup Automation',
        description: 'Automated database backups with tested restore',
        status: 'complete',
        priority: 'high',
        category: 'Infrastructure Security',
      },
      {
        id: 'infra-5',
        title: 'Geo-Blocking',
        description: 'Block restricted jurisdictions at CDN level',
        status: 'complete',
        priority: 'high',
        category: 'Infrastructure Security',
      },
      {
        id: 'infra-6',
        title: 'WAF Configuration',
        description: 'Web Application Firewall rules',
        status: 'pending',
        priority: 'medium',
        category: 'Infrastructure Security',
      },
    ],
  },
  {
    name: 'Operational Security',
    items: [
      {
        id: 'ops-1',
        title: 'Incident Response Plan',
        description: 'Documented procedures for security incidents',
        status: 'complete',
        priority: 'critical',
        category: 'Operational Security',
        notes: 'docs/runbooks/INCIDENT_RESPONSE.md',
      },
      {
        id: 'ops-2',
        title: 'Disaster Recovery Plan',
        description: 'Documented procedures for system recovery',
        status: 'complete',
        priority: 'critical',
        category: 'Operational Security',
        notes: 'docs/runbooks/DISASTER_RECOVERY.md',
      },
      {
        id: 'ops-3',
        title: 'Alerting Configuration',
        description: 'Prometheus/AlertManager rules for anomaly detection',
        status: 'complete',
        priority: 'high',
        category: 'Operational Security',
      },
      {
        id: 'ops-4',
        title: 'Access Control',
        description: 'Role-based access for admin functions',
        status: 'pending',
        priority: 'high',
        category: 'Operational Security',
      },
      {
        id: 'ops-5',
        title: 'Audit Logging',
        description: 'Comprehensive logging of security-relevant events',
        status: 'in_progress',
        priority: 'high',
        category: 'Operational Security',
      },
    ],
  },
];

const STATUS_CONFIG = {
  complete: { label: 'Complete', variant: 'success' as const },
  in_progress: { label: 'In Progress', variant: 'warning' as const },
  pending: { label: 'Pending', variant: 'default' as const },
  na: { label: 'N/A', variant: 'default' as const },
};

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-ask' },
  high: { label: 'High', color: 'text-yellow-500' },
  medium: { label: 'Medium', color: 'text-accent' },
  low: { label: 'Low', color: 'text-text-secondary' },
};

export function SecurityAuditChecklist() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    CHECKLIST[0].name
  );

  // Calculate stats
  const allItems = CHECKLIST.flatMap((c) => c.items);
  const stats = {
    total: allItems.length,
    complete: allItems.filter((i) => i.status === 'complete').length,
    inProgress: allItems.filter((i) => i.status === 'in_progress').length,
    pending: allItems.filter((i) => i.status === 'pending').length,
    criticalPending: allItems.filter(
      (i) => i.priority === 'critical' && i.status !== 'complete'
    ).length,
  };

  const completionPercent = Math.round((stats.complete / stats.total) * 100);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-text-primary">{completionPercent}%</p>
            <p className="text-sm text-text-secondary">Complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-bid">{stats.complete}</p>
            <p className="text-sm text-text-secondary">Done</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{stats.inProgress}</p>
            <p className="text-sm text-text-secondary">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-text-secondary">{stats.pending}</p>
            <p className="text-sm text-text-secondary">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-ask">{stats.criticalPending}</p>
            <p className="text-sm text-text-secondary">Critical Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Overall Progress</span>
            <span className="text-sm font-medium text-text-primary">
              {stats.complete}/{stats.total} items
            </span>
          </div>
          <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-bid rounded-full transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      {CHECKLIST.map((category) => {
        const isExpanded = expandedCategory === category.name;
        const categoryComplete = category.items.filter(
          (i) => i.status === 'complete'
        ).length;
        const categoryTotal = category.items.length;

        return (
          <Card key={category.name}>
            <button
              type="button"
              onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
              className="w-full text-left cursor-pointer"
            >
              <CardHeader className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                    <span className="text-sm text-text-secondary">
                      {categoryComplete}/{categoryTotal}
                    </span>
                  </div>
                  <svg
                    className={cn(
                      'w-5 h-5 text-text-secondary transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </CardHeader>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 pb-4">
                <div className="space-y-3">
                  {category.items.map((item) => {
                    const statusConfig = STATUS_CONFIG[item.status];
                    const priorityConfig = PRIORITY_CONFIG[item.priority];

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg bg-bg-secondary"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-text-primary">
                                {item.title}
                              </span>
                              <Badge variant={statusConfig.variant}>
                                {statusConfig.label}
                              </Badge>
                              <span
                                className={cn('text-xs', priorityConfig.color)}
                              >
                                {priorityConfig.label}
                              </span>
                            </div>
                            <p className="text-sm text-text-secondary">
                              {item.description}
                            </p>
                            {item.notes && (
                              <p className="text-xs text-accent mt-2">
                                Note: {item.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {item.status === 'complete' ? (
                              <svg
                                className="w-5 h-5 text-bid"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : item.status === 'in_progress' ? (
                              <svg
                                className="w-5 h-5 text-yellow-500 animate-pulse"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-5 h-5 text-text-secondary"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Audit Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Pre-Audit Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex items-start gap-2">
              <span className="text-accent">1.</span>
              <span>
                Smart contract audit should be completed by a reputable firm before mainnet
                deployment. Recommended: Halborn, Trail of Bits, or Zellic.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">2.</span>
              <span>
                All critical and high priority items should be complete before engaging external
                auditors.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">3.</span>
              <span>
                Prepare audit documentation: architecture diagrams, threat model, and scope
                definition.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">4.</span>
              <span>
                Run npm audit, cargo audit, and anchor verify before submitting for audit.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">5.</span>
              <span>
                Ensure all test suites pass and coverage is documented.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
