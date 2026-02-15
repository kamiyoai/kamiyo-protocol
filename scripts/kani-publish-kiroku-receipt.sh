#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

out_dir="${KANI_OUT_DIR:-kani-results}"
summary_path="${out_dir}/summary.md"
log_path="${out_dir}/kani.log"

publish_url="${KIROKU_AGENT_PUBLISH_URL:-}"
publish_key="${KIROKU_AGENT_PUBLISH_KEY:-}"
author="${KIROKU_AGENT_AUTHOR:-}"

if [ -z "${publish_url}" ] || [ -z "${publish_key}" ] || [ -z "${author}" ]; then
  echo "[kiroku] publish skipped (missing KIROKU_AGENT_PUBLISH_URL/KIROKU_AGENT_PUBLISH_KEY/KIROKU_AGENT_AUTHOR)" >&2
  exit 0
fi

if [ ! -f "${summary_path}" ] || [ ! -f "${log_path}" ]; then
  echo "[kiroku] publish skipped (missing ${summary_path} or ${log_path})" >&2
  exit 0
fi

run_url=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

sha="${GITHUB_SHA:-}"
if [ -z "${sha}" ]; then
  sha="$(git rev-parse HEAD 2>/dev/null || true)"
fi
short_sha="${sha:0:10}"

mode="default"
if [ "${KANI_FULL:-}" = "1" ]; then
  mode="full"
fi

status="failed"
audit_expect_covers="${KANI_EXPECT_COVERS:-}"
if [ -z "${audit_expect_covers}" ] && [ "${KANI_FULL:-}" = "1" ]; then
  audit_expect_covers="1"
fi

audit_env=()
if [ "${audit_expect_covers}" = "1" ]; then
  audit_env+=(KANI_EXPECT_COVERS=1)
fi

if "${audit_env[@]}" ./scripts/kani-audit.sh "${log_path}" >/dev/null 2>&1; then
  status="verified"
fi

started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

summary_sha256=""
log_sha256=""
if command -v sha256sum >/dev/null 2>&1; then
  summary_sha256="$(sha256sum "${summary_path}" | awk '{print $1}')"
  log_sha256="$(sha256sum "${log_path}" | awk '{print $1}')"
fi

covers=""
cover_files=("${log_path}")
dir="$(dirname "${log_path}")"
shopt -s nullglob
pkg_logs=("${dir}"/kani-*.log)
shopt -u nullglob

if [ "${#pkg_logs[@]}" -gt 0 ] && { [ "${audit_expect_covers}" = "1" ] || [ "${KANI_AUDIT_PER_PACKAGE:-}" = "1" ]; }; then
  cover_files=()
  for f in "${pkg_logs[@]}"; do
    if [ "$(basename "${f}")" = "kani.log" ]; then
      continue
    fi
    cover_files+=("${f}")
  done
fi

cover_lines="$(grep -hE '\\*\\* [0-9]+ of [0-9]+ cover properties satisfied' "${cover_files[@]}" || true)"
if [ -n "${cover_lines}" ]; then
  read -r satisfied total _unsatisfied <<<"$(
    printf '%s\n' "${cover_lines}" |
      awk '{s+=$2; t+=$4; if ($2 != $4) u+=($4-$2)} END {print s, t, u}'
  )"
  if [ "${total:-0}" -gt 0 ]; then
    covers="${satisfied}/${total}"
  fi
fi

commit_url=""
kani_docs_url=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${sha}" ]; then
  commit_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/commit/${sha}"
  kani_docs_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${sha}/KANI.md"
fi

idempotency_key=""
if [ -n "${GITHUB_RUN_ID:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  idempotency_key="kani:${GITHUB_REPOSITORY}:${GITHUB_RUN_ID}"
elif [ -n "${sha}" ]; then
  idempotency_key="kani:${sha}"
else
  idempotency_key="kani:${started_utc}"
fi

text="$(
  printf 'Kani (%s) %s\n' "${mode}" "${status}"
  [ -n "${short_sha}" ] && printf 'commit: %s\n' "${short_sha}"
  [ -n "${run_url}" ] && printf 'run: %s\n' "${run_url}"
  [ -n "${covers}" ] && printf 'covers: %s\n' "${covers}"
  [ -n "${summary_sha256}" ] && printf 'summary_sha256: %s\n' "${summary_sha256}"
  [ -n "${log_sha256}" ] && printf 'log_sha256: %s\n' "${log_sha256}"
)"

if [ "${#text}" -gt 800 ]; then
  text="${text:0:797}..."
fi

payload="$(
  python3 - "${author}" "${text}" "${idempotency_key}" "${run_url}" "${commit_url}" "${kani_docs_url}" <<'PY'
import json
import sys

author, text, idempotency_key, run_url, commit_url, kani_docs_url = sys.argv[1:]

evidence = []
def add_url(url: str, label: str) -> None:
  url = (url or "").strip()
  if not url:
    return
  evidence.append({"kind": "url", "url": url, "label": label})

add_url(run_url, "github run")
add_url(commit_url, "commit")
add_url(kani_docs_url, "how to verify")

payload = {
  "author": author,
  "text": text,
  "evidence": evidence,
  "idempotencyKey": idempotency_key,
}

print(json.dumps(payload, separators=(",", ":")))
PY
)"

resp_and_code="$(
  curl -sS \
    --retry 3 \
    --retry-delay 2 \
    --retry-connrefused \
    --max-time 30 \
    -w $'\n%{http_code}' \
    -X POST "${publish_url}" \
    -H "Authorization: Bearer ${publish_key}" \
    -H "Content-Type: application/json" \
    --data "${payload}"
)"

http_code="${resp_and_code##*$'\n'}"
resp="${resp_and_code%$'\n'*}"

if ! [[ "${http_code}" =~ ^[0-9]{3}$ ]] || [ "${http_code}" -lt 200 ] || [ "${http_code}" -ge 300 ]; then
  echo "[kiroku] publish failed (http ${http_code})" >&2
  if [ -n "${resp}" ]; then
    echo "[kiroku] response: ${resp:0:600}" >&2
  fi
  exit 1
fi

drop_id="$(
  python3 - "${resp}" <<'PY'
import json
import sys

raw = sys.argv[1]
try:
  body = json.loads(raw)
except Exception:
  raise SystemExit("invalid json response")

drop_id = body.get("id")
if not isinstance(drop_id, str) or not drop_id.strip():
  raise SystemExit("missing id in response")

print(drop_id.strip())
PY
)"

receipt="server.${drop_id}"

origin="${KIROKU_RECEIPT_ORIGIN:-}"
if [ -z "${origin}" ]; then
  origin="$(
    python3 - "${publish_url}" <<'PY'
import sys
from urllib.parse import urlsplit

u = urlsplit(sys.argv[1])
if not u.scheme or not u.netloc:
  raise SystemExit("invalid KIROKU_AGENT_PUBLISH_URL")
print(f"{u.scheme}://{u.netloc}")
PY
  )"
fi

share_url="$(
  python3 - "${origin}" "${receipt}" <<'PY'
import sys
from urllib.parse import quote

origin, receipt = sys.argv[1], sys.argv[2]
origin = origin.rstrip("/")
print(f"{origin}/kiroku/drops/{quote(receipt, safe='')}")
PY
)"

receipt_json_path="${out_dir}/kiroku-receipt.json"
python3 - \
  "${receipt_json_path}" \
  "${receipt}" \
  "${share_url}" \
  "${started_utc}" \
  "${mode}" \
  "${status}" \
  "${sha}" \
  "${run_url}" \
  "${summary_sha256}" \
  "${log_sha256}" \
  "${covers}" <<'PY'
import json
import sys

(
  path,
  receipt,
  url,
  published_at_utc,
  mode,
  status,
  commit,
  run_url,
  summary_sha256,
  log_sha256,
  covers,
) = sys.argv[1:]

body = {
  "receipt": receipt or None,
  "url": url or None,
  "publishedAtUtc": published_at_utc or None,
  "mode": mode or None,
  "status": status or None,
  "commit": commit or None,
  "runUrl": run_url or None,
  "summarySha256": summary_sha256 or None,
  "logSha256": log_sha256 or None,
  "covers": covers or None,
}

with open(path, "w", encoding="utf-8") as f:
  json.dump(body, f, indent=2, sort_keys=True)
  f.write("\n")
PY

{
  echo "### Kiroku proof receipt"
  echo
  echo "- receipt: \`${receipt}\`"
  echo "- url: ${share_url}"
  if [ -n "${run_url}" ]; then
    echo "- run: ${run_url}"
  fi
  if [ -n "${covers}" ]; then
    echo "- covers: \`${covers}\`"
  fi
  if [ -n "${summary_sha256}" ]; then
    echo "- summary sha256: \`${summary_sha256}\`"
  fi
  if [ -n "${log_sha256}" ]; then
    echo "- log sha256: \`${log_sha256}\`"
  fi
} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "[kiroku] published: ${share_url}"
