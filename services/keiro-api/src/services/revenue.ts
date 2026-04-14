type RevenueEventInput = {
  eventId?: string;
  source: string;
  kind: string;
  agentId?: string | null;
  workId?: string | null;
  gross: number;
  fees?: number;
  net?: number;
  token: string;
  chain: string;
  status: string;
  receiptId?: string | null;
  settlementRef?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

function getRevenueUrl(): string {
  const baseUrl =
    process.env.KEIRO_COMPANION_INTERNAL_URL?.trim() ||
    process.env.COMPANION_INTERNAL_URL?.trim() ||
    process.env.COMPANION_API_URL?.trim() ||
    '';

  if (!baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}/api/internal/revenue-events`;
}

function getRevenueToken(): string {
  return (
    process.env.KEIRO_REVENUE_INTERNAL_TOKEN?.trim() ||
    process.env.REVENUE_INTERNAL_TOKEN?.trim() ||
    process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
    ''
  );
}

export async function emitRevenueEvent(event: RevenueEventInput): Promise<void> {
  const url = getRevenueUrl();
  const token = getRevenueToken();
  if (!url || !token) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `revenue_http_${response.status}`);
    }
  } catch (error) {
    console.error('Failed to emit revenue event', {
      kind: event.kind,
      workId: event.workId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
