type KirokuEvidence = { kind: 'url'; url: string; label?: string };

export type KirokuPublishResult =
  | { ok: true; receipt: string; url: string }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped?: false; error: string };

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 3)) + '...';
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function publishKirokuDrop(options: {
  text: string;
  idempotencyKey: string;
  evidence?: KirokuEvidence[];
}): Promise<KirokuPublishResult> {
  const publishUrl = asNonEmptyString(process.env.KIROKU_AGENT_PUBLISH_URL);
  const publishKey = asNonEmptyString(process.env.KIROKU_AGENT_PUBLISH_KEY);
  const author = asNonEmptyString(process.env.KIROKU_AGENT_AUTHOR);

  if (!publishUrl || !publishKey || !author) {
    return {
      ok: false,
      skipped: true,
      error: 'missing KIROKU_AGENT_PUBLISH_URL/KIROKU_AGENT_PUBLISH_KEY/KIROKU_AGENT_AUTHOR',
    };
  }

  let url: URL;
  try {
    url = new URL(publishUrl);
  } catch {
    return { ok: false, skipped: true, error: 'invalid KIROKU_AGENT_PUBLISH_URL' };
  }

  const payload = {
    author,
    text: clampText(options.text, 800),
    evidence: (options.evidence ?? []).filter((e) => e.url && e.kind === 'url'),
    idempotencyKey: options.idempotencyKey,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publishKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const bodyText = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        error: `kiroku_publish_failed:http_${res.status}:${clampText(bodyText || 'no body', 600)}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      return { ok: false, error: 'kiroku_publish_failed:invalid_json_response' };
    }

    const id = (parsed && typeof parsed === 'object') ? (parsed as { id?: unknown }).id : undefined;
    const dropId = asNonEmptyString(id);
    if (!dropId) return { ok: false, error: 'kiroku_publish_failed:missing_id' };

    const receipt = `server.${dropId}`;
    const origin = asNonEmptyString(process.env.KIROKU_RECEIPT_ORIGIN) ?? url.origin;
    const shareUrl = `${origin.replace(/\/$/, '')}/kiroku/drops/${encodeURIComponent(receipt)}`;

    return { ok: true, receipt, url: shareUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'kiroku_publish_failed' };
  } finally {
    clearTimeout(timeout);
  }
}
