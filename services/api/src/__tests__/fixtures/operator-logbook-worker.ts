import { maybeQueueKamiyoAgentOperatorLog } from '../../operator-logbook';

const nowMsRaw = process.env.KYO_TEST_NOW_MS;
const nowMs = Number.parseInt(nowMsRaw ?? '', 10);
const tickAt = Number.isFinite(nowMs) ? nowMs : Date.now();

const queued = maybeQueueKamiyoAgentOperatorLog(tickAt);

process.stdout.write(
  JSON.stringify({
    queued: queued
      ? {
          id: queued.id,
          kind: queued.kind,
          serial: queued.serial,
        }
      : null,
  })
);
