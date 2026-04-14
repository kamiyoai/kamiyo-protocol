// JSON-LD schemas and Zod validation for Reality Fork Knowledge Assets

import { z } from 'zod';
import type {
  RealityForkReportAsset,
  RealityForkEntityAsset,
  RealityForkSimulationAsset,
} from './types';

// JSON-LD context constants

const SCHEMA_ORG = 'https://schema.org/';

const REALITY_FORK_CONTEXT = {
  '@version': 1.1,
  '@vocab': 'https://schema.org/',
  projectId: 'https://kamiyo.ai/reality-fork/projectId',
  hypothesisId: 'https://kamiyo.ai/reality-fork/hypothesisId',
  probability: 'https://kamiyo.ai/reality-fork/probability',
  impactScore: 'https://kamiyo.ai/reality-fork/impactScore',
  laneId: 'https://kamiyo.ai/reality-fork/laneId',
  simulationRounds: 'https://kamiyo.ai/reality-fork/simulationRounds',
  evidenceHash: 'https://kamiyo.ai/reality-fork/evidenceHash',
  reportHash: 'https://kamiyo.ai/reality-fork/reportHash',
  winnerHypothesisId: 'https://kamiyo.ai/reality-fork/winnerHypothesisId',
  evidenceCount: 'https://kamiyo.ai/reality-fork/evidenceCount',
  laneCount: 'https://kamiyo.ai/reality-fork/laneCount',
} as const;

export const SCHEMA_VERSION = '1.0.0';

// Zod schemas for input validation

export const RealityForkReportSchema = z.object({
  projectId: z.string().min(1).max(128),
  projectName: z.string().min(1).max(256),
  description: z.string().min(1).max(2000),
  hypothesisCount: z.number().int().min(1),
  laneCount: z.number().int().min(1),
  simulationRounds: z.number().int().min(0),
  winnerHypothesisId: z.string().min(1).max(128),
  probability: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(100),
  evidenceCount: z.number().int().min(0),
  reportHash: z.string().min(8).max(128),
  createdAt: z.string().datetime(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const RealityForkEntitySchema = z.object({
  entityId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128),
  entityName: z.string().min(1).max(256),
  entityType: z.string().min(1).max(64),
  description: z.string().min(1).max(2000),
  hypothesisId: z.string().min(1).max(128),
  laneId: z.string().min(1).max(128),
  probability: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(100),
  evidenceHash: z.string().min(8).max(128),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RealityForkSimulationSchema = z.object({
  simulationId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128),
  hypothesisId: z.string().min(1).max(128),
  laneId: z.string().min(1).max(128),
  simulationRounds: z.number().int().min(1),
  probability: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(100),
  evidenceHash: z.string().min(8).max(128),
  createdAt: z.string().datetime(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

// JSON-LD builder functions

export function buildReportAsset(data: RealityForkReportAsset): object {
  return {
    '@context': [SCHEMA_ORG, REALITY_FORK_CONTEXT],
    '@type': 'Report',
    '@id': `urn:kamiyo:rf:report:${data.projectId}`,
    name: 'RealityForkReport',
    version: SCHEMA_VERSION,
    description: data.description,
    dateCreated: data.createdAt,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'projectId', value: data.projectId },
      { '@type': 'PropertyValue', name: 'projectName', value: data.projectName },
      { '@type': 'PropertyValue', name: 'hypothesisCount', value: data.hypothesisCount },
      { '@type': 'PropertyValue', name: 'laneCount', value: data.laneCount },
      { '@type': 'PropertyValue', name: 'simulationRounds', value: data.simulationRounds },
      { '@type': 'PropertyValue', name: 'winnerHypothesisId', value: data.winnerHypothesisId },
      { '@type': 'PropertyValue', name: 'probability', value: data.probability },
      { '@type': 'PropertyValue', name: 'impactScore', value: data.impactScore },
      { '@type': 'PropertyValue', name: 'evidenceCount', value: data.evidenceCount },
      { '@type': 'PropertyValue', name: 'reportHash', value: data.reportHash },
      ...(data.tags?.length
        ? [{ '@type': 'PropertyValue', name: 'tags', value: data.tags.join(',') }]
        : []),
    ],
  };
}

export function buildEntityAsset(data: RealityForkEntityAsset): object {
  const metadata = data.metadata || {};

  return {
    '@context': [SCHEMA_ORG, REALITY_FORK_CONTEXT],
    '@type': 'Thing',
    '@id': `urn:kamiyo:rf:entity:${data.projectId}:${data.entityId}`,
    name: data.entityName,
    version: SCHEMA_VERSION,
    description: data.description,
    dateCreated: data.createdAt,
    additionalType: data.entityType,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'projectId', value: data.projectId },
      { '@type': 'PropertyValue', name: 'entityId', value: data.entityId },
      { '@type': 'PropertyValue', name: 'hypothesisId', value: data.hypothesisId },
      { '@type': 'PropertyValue', name: 'laneId', value: data.laneId },
      { '@type': 'PropertyValue', name: 'probability', value: data.probability },
      { '@type': 'PropertyValue', name: 'impactScore', value: data.impactScore },
      { '@type': 'PropertyValue', name: 'evidenceHash', value: data.evidenceHash },
      ...(Object.keys(metadata).length
        ? [{ '@type': 'PropertyValue', name: 'metadata', value: JSON.stringify(metadata) }]
        : []),
    ],
  };
}

export function buildSimulationAsset(data: RealityForkSimulationAsset): object {
  const params = data.parameters || {};

  return {
    '@context': [SCHEMA_ORG, REALITY_FORK_CONTEXT],
    '@type': 'Dataset',
    '@id': `urn:kamiyo:rf:simulation:${data.projectId}:${data.simulationId}`,
    name: `RealityForkSimulation:${data.simulationId}`,
    version: SCHEMA_VERSION,
    dateCreated: data.createdAt,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'projectId', value: data.projectId },
      { '@type': 'PropertyValue', name: 'simulationId', value: data.simulationId },
      { '@type': 'PropertyValue', name: 'hypothesisId', value: data.hypothesisId },
      { '@type': 'PropertyValue', name: 'laneId', value: data.laneId },
      { '@type': 'PropertyValue', name: 'simulationRounds', value: data.simulationRounds },
      { '@type': 'PropertyValue', name: 'probability', value: data.probability },
      { '@type': 'PropertyValue', name: 'impactScore', value: data.impactScore },
      { '@type': 'PropertyValue', name: 'evidenceHash', value: data.evidenceHash },
      ...(Object.keys(params).length
        ? [{ '@type': 'PropertyValue', name: 'parameters', value: JSON.stringify(params) }]
        : []),
    ],
  };
}
