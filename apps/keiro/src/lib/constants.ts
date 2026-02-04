// Solana Network Configuration
export const SOLANA_NETWORK = process.env.EXPO_PUBLIC_SOLANA_NETWORK || 'devnet';

export const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// KAMIYO Protocol Program IDs
export const KAMIYO_PROGRAM_ID =
  process.env.EXPO_PUBLIC_KAMIYO_PROGRAM_ID ||
  '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';

export const KAMIYO_ESCROW_PROGRAM_ID =
  process.env.EXPO_PUBLIC_KAMIYO_ESCROW_PROGRAM_ID ||
  'FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u';

// API Configuration
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// App Configuration
export const APP_NAME = 'KEIRO';
export const APP_VERSION = '0.0.1';

// Credit Score Tiers
export const TIER_THRESHOLDS = {
  unverified: 0,
  bronze: 25,
  silver: 50,
  gold: 75,
  platinum: 90,
} as const;

// Tier Colors
export const TIER_COLORS = {
  unverified: '#6b7280',
  bronze: '#cd7f32',
  silver: '#9ca3af',
  gold: '#f59e0b',
  platinum: '#8b5cf6',
} as const;

// Task Types
export const TASK_TYPES = [
  'research',
  'code_review',
  'security_audit',
  'smart_contract_audit',
  'code_generation',
  'documentation',
  'data_analysis',
  'translation',
  'content_creation',
  'api_integration',
  'testing',
  'deployment',
  'monitoring',
] as const;

// Agent Personalities
export const AGENT_PERSONALITIES = {
  professional: {
    label: 'Professional',
    description: 'Formal, thorough, detail-oriented',
  },
  creative: {
    label: 'Creative',
    description: 'Imaginative, experimental, bold',
  },
  efficient: {
    label: 'Efficient',
    description: 'Fast, concise, practical',
  },
  balanced: {
    label: 'Balanced',
    description: 'Adaptable to any situation',
  },
} as const;

// Agent Skills
export const AGENT_SKILLS = {
  research: {
    label: 'Research & Analysis',
    description: 'Finding and synthesizing information',
  },
  writing: {
    label: 'Writing & Content',
    description: 'Creating written content and documentation',
  },
  code_review: {
    label: 'Code Review',
    description: 'Reviewing and improving code quality',
  },
  data_analysis: {
    label: 'Data Processing',
    description: 'Analyzing and transforming data',
  },
  translation: {
    label: 'Translation',
    description: 'Converting between languages',
  },
  general: {
    label: 'General Tasks',
    description: 'Versatile task handling',
  },
} as const;
