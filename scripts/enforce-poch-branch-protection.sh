#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:-kamiyo-ai}"
REPO="${2:-kamiyo-protocol}"
BRANCH="${3:-main}"

read -r -d '' PAYLOAD <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["noir", "evm", "typescript", "poch_release_gate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false
}
JSON

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
  --input - <<<"${PAYLOAD}" >/dev/null

echo "Updated branch protection for ${OWNER}/${REPO}:${BRANCH}"
