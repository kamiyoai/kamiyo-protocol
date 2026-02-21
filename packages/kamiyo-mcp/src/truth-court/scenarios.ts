export interface TruthCourtScenarioPreset {
  missionTag: string;
  qualityScore: number;
  refundPercentage: number;
  evidence: Record<string, unknown>;
  featureVector: Record<string, number>;
  context: string;
}

export const TRUTH_COURT_SCENARIOS: Record<string, TruthCourtScenarioPreset> = {
  'habitat-power': {
    missionTag: 'mars_ops_habitat_power',
    qualityScore: 34,
    refundPercentage: 72,
    evidence: {
      telemetry: {
        habitatPowerDeficitKw: 18.4,
        batteryReserveMinutes: 11,
        commsLatencyMs: 2400,
      },
      executionLog: [
        'fallback_controller_triggered',
        'priority_load_shedding_enabled',
        'manual_override_requested',
      ],
    },
    featureVector: {
      timeliness: 0.22,
      completeness: 0.48,
      reliability: 0.31,
      adversarialRisk: 0.61,
    },
    context:
      'Delayed relay near dust storm conditions. Task is grid stabilization with strict outage budget.',
  },
  'launch-anomaly': {
    missionTag: 'launch_ops_stage_separation_anomaly',
    qualityScore: 41,
    refundPercentage: 58,
    evidence: {
      telemetry: {
        stageSepDeltaMs: 170,
        navDriftMeters: 83,
        engineRelightSuccessRate: 0.67,
      },
      sensorDiffs: {
        imuVsStarTracker: 0.38,
        pressureVariance: 0.44,
      },
      executionLog: [
        'stage_sep_late_trigger',
        'guidance_correction_burn_executed',
        'payload_fairing_temp_spike',
      ],
    },
    featureVector: {
      timeliness: 0.39,
      completeness: 0.63,
      reliability: 0.42,
      anomalySeverity: 0.71,
      safetyMargin: 0.34,
    },
    context:
      'Launch reliability dispute where handoff timing and correction burn quality determine mission outcome.',
  },
  'surface-rover': {
    missionTag: 'mars_ops_surface_rover_nav',
    qualityScore: 53,
    refundPercentage: 36,
    evidence: {
      telemetry: {
        waypointDriftMeters: 14.2,
        terrainHazardAlerts: 3,
        mapSyncLagMs: 980,
      },
      executionLog: [
        'alt_route_selected',
        'sensor_fusion_recovered',
        'battery_saving_mode_enabled',
      ],
    },
    featureVector: {
      timeliness: 0.56,
      completeness: 0.72,
      reliability: 0.58,
      hazardResponse: 0.64,
    },
    context:
      'Rover navigation arbitration with uncertain terrain maps and strict battery limits.',
  },
};

export type TruthCourtScenarioName = keyof typeof TRUTH_COURT_SCENARIOS;

export function listTruthCourtScenarios(): TruthCourtScenarioName[] {
  return Object.keys(TRUTH_COURT_SCENARIOS).sort() as TruthCourtScenarioName[];
}

export function getTruthCourtScenario(
  name: string
): TruthCourtScenarioPreset | null {
  return TRUTH_COURT_SCENARIOS[name] ?? null;
}
