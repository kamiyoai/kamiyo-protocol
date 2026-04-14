// RealityForkPublisher - publishes Reality Fork Knowledge Assets to DKG

import type {
  DKGClient,
  RealityForkReportAsset,
  RealityForkEntityAsset,
  RealityForkSimulationAsset,
  RealityForkPublishResult,
  RealityForkFullPublishResult,
} from './types';
import {
  RealityForkReportSchema,
  RealityForkEntitySchema,
  RealityForkSimulationSchema,
  buildReportAsset,
  buildEntityAsset,
  buildSimulationAsset,
} from './schemas';

export class RealityForkPublisher {
  private dkg: DKGClient;
  private paranetUAL: string;
  private epochs: number;

  constructor(dkg: DKGClient, config: { paranetUAL: string; epochs: number }) {
    this.dkg = dkg;
    this.paranetUAL = config.paranetUAL;
    this.epochs = config.epochs;
  }

  async publishReport(data: RealityForkReportAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkReportSchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildReportAsset(data);

    try {
      console.log('[dkg-publisher] creating asset with', {
        epochs: this.epochs,
        paranetUAL: this.paranetUAL,
      });
      const result = await this.dkg.asset.create(
        { public: asset },
        { epochsNum: this.epochs, paranetUAL: this.paranetUAL }
      );
      console.log('[dkg-publisher] create result:', JSON.stringify(result, null, 2));
      if (!result.UAL) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fullResult = result as any;
        return {
          success: false,
          error: `DKG create completed but no UAL returned. Full result: ${JSON.stringify(fullResult)}`,
        };
      }
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing report failed',
      };
    }
  }

  async publishEntity(data: RealityForkEntityAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkEntitySchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildEntityAsset(data);

    try {
      const result = await this.dkg.asset.create(
        { public: asset },
        { epochsNum: this.epochs, paranetUAL: this.paranetUAL }
      );
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing entity failed',
      };
    }
  }

  async publishSimulation(data: RealityForkSimulationAsset): Promise<RealityForkPublishResult> {
    const validation = RealityForkSimulationSchema.safeParse(data);
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((i: { message: string }) => i.message)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMsg}` };
    }

    const asset = buildSimulationAsset(data);

    try {
      const result = await this.dkg.asset.create(
        { public: asset },
        { epochsNum: this.epochs, paranetUAL: this.paranetUAL }
      );
      return { success: true, ual: result.UAL };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing simulation failed',
      };
    }
  }

  async publishEntities(
    projectId: string,
    entities: RealityForkEntityAsset[]
  ): Promise<RealityForkPublishResult[]> {
    const results: RealityForkPublishResult[] = [];
    for (const entity of entities) {
      if (entity.projectId !== projectId) {
        results.push({
          success: false,
          error: `Entity projectId "${entity.projectId}" does not match "${projectId}"`,
        });
        continue;
      }
      const result = await this.publishEntity(entity);
      results.push(result);
    }
    return results;
  }

  async publishSimulations(
    projectId: string,
    sims: RealityForkSimulationAsset[]
  ): Promise<RealityForkPublishResult[]> {
    const results: RealityForkPublishResult[] = [];
    for (const sim of sims) {
      if (sim.projectId !== projectId) {
        results.push({
          success: false,
          error: `Simulation projectId "${sim.projectId}" does not match "${projectId}"`,
        });
        continue;
      }
      const result = await this.publishSimulation(sim);
      results.push(result);
    }
    return results;
  }

  async publishFullProject(data: {
    report: RealityForkReportAsset;
    entities: RealityForkEntityAsset[];
    simulations: RealityForkSimulationAsset[];
  }): Promise<RealityForkFullPublishResult> {
    const projectId = data.report.projectId;

    // Publish report first
    const reportResult = await this.publishReport(data.report);
    if (!reportResult.success || !reportResult.ual) {
      throw new Error(`Failed to publish report: ${reportResult.error}`);
    }

    // Publish entities
    const entityResults = await this.publishEntities(projectId, data.entities);
    const failedEntities = entityResults.filter(r => !r.success);
    if (failedEntities.length > 0) {
      const errors = failedEntities.map(r => r.error).join('; ');
      throw new Error(
        `Published report (${reportResult.ual}) but ${failedEntities.length} entity publish(es) failed: ${errors}`
      );
    }

    // Publish simulations
    const simResults = await this.publishSimulations(projectId, data.simulations);
    const failedSims = simResults.filter(r => !r.success);
    if (failedSims.length > 0) {
      const errors = failedSims.map(r => r.error).join('; ');
      throw new Error(
        `Published report + entities but ${failedSims.length} simulation publish(es) failed: ${errors}`
      );
    }

    return {
      reportUAL: reportResult.ual,
      entityUALs: entityResults.map(r => r.ual!),
      simulationUALs: simResults.map(r => r.ual!),
    };
  }
}
