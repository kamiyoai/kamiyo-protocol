import type {
  CompanionControlRoomCaseEvent,
  CompanionControlRoomEventType,
  ReplayScenarioOptions,
  RealityForkReplayEvent,
  RealityForkReplayPhase,
} from './types';

function phaseForEvent(eventType: CompanionControlRoomEventType): RealityForkReplayPhase {
  switch (eventType) {
    case 'case_created':
    case 'snapshot_captured':
      return 'capture';
    case 'branch_planned':
      return 'planning';
    case 'branch_started':
    case 'node_reused':
    case 'branch_completed':
      return 'execution';
    case 'scoring_completed':
      return 'scoring';
    case 'adjudication_started':
    case 'adjudication_completed':
      return 'adjudication';
    case 'promotion_started':
    case 'promotion_completed':
      return 'promotion';
    case 'case_failed':
      return 'terminal';
  }
}

function toneForEvent(eventType: CompanionControlRoomEventType): RealityForkReplayEvent['tone'] {
  switch (eventType) {
    case 'case_failed':
      return 'critical';
    case 'adjudication_completed':
    case 'promotion_completed':
    case 'branch_completed':
      return 'success';
    case 'node_reused':
      return 'warning';
    default:
      return 'neutral';
  }
}

function describeEvent(
  event: CompanionControlRoomCaseEvent,
  branchLabel: string | null
): {
  title: string;
  description: string;
} {
  switch (event.eventType) {
    case 'case_created':
      return {
        title: 'Case opened',
        description: `Mission captured for ${event.payload?.mission ?? 'a new scenario'}.`,
      };
    case 'snapshot_captured':
      return {
        title: 'Snapshot locked',
        description: `Immutable snapshot ${String(event.payload?.snapshotHash ?? '').slice(0, 12)} was captured.`,
      };
    case 'branch_planned':
      return {
        title: `${branchLabel ?? 'Branch'} planned`,
        description: `${branchLabel ?? 'Branch'} was derived with ${event.payload?.nodeCount ?? 'unknown'} nodes.`,
      };
    case 'branch_started':
      return {
        title: `${branchLabel ?? 'Branch'} started`,
        description: `${branchLabel ?? 'Branch'} began readonly execution.`,
      };
    case 'node_reused':
      return {
        title: 'Evidence reused',
        description: `Node ${String(event.payload?.nodeId ?? 'unknown')} reused prior readonly work.`,
      };
    case 'branch_completed':
      return {
        title: `${branchLabel ?? 'Branch'} finished`,
        description: `${branchLabel ?? 'Branch'} ended with status ${String(event.payload?.status ?? 'unknown')}.`,
      };
    case 'scoring_completed':
      return {
        title: 'Scoring finished',
        description:
          'All branches received deterministic evidence, risk, latency, and cost scores.',
      };
    case 'adjudication_started':
      return {
        title: 'Adjudication started',
        description: `Decision mode: ${String(event.payload?.decisionMode ?? 'unknown')}.`,
      };
    case 'adjudication_completed':
      return {
        title: 'Winner selected',
        description: `Winning branch: ${String(event.payload?.winnerBranchId ?? 'unknown')}.`,
      };
    case 'promotion_started':
      return {
        title: 'Promotion started',
        description: `${branchLabel ?? 'Branch'} entered ${String(event.payload?.mode ?? 'execute')} promotion.`,
      };
    case 'promotion_completed':
      return {
        title: 'Promotion completed',
        description: `${branchLabel ?? 'Branch'} was promoted to ${String(event.payload?.promotedRunId ?? 'manual handoff')}.`,
      };
    case 'case_failed':
      return {
        title: 'Case failed',
        description: String(event.payload?.error ?? 'Unknown control-room failure.'),
      };
  }
  return {
    title: 'Event',
    description: 'Control-room event emitted.',
  };
}

export function replayScenarioEvents(
  events: CompanionControlRoomCaseEvent[],
  branchLabels: Record<string, string>,
  options: ReplayScenarioOptions = {}
): RealityForkReplayEvent[] {
  const stepMs = options.stepMs ?? 1400;
  const ordered = events
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));

  return ordered.map((event, index) => {
    const branchLabel = event.branchId ? (branchLabels[event.branchId] ?? null) : null;
    const description = describeEvent(event, branchLabel);
    return {
      id: event.id,
      eventType: event.eventType,
      phase: phaseForEvent(event.eventType),
      title: description.title,
      description: description.description,
      branchId: event.branchId,
      branchLabel,
      createdAt: event.createdAt,
      offsetMs: index * stepMs,
      tone: toneForEvent(event.eventType),
    };
  });
}
