#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  kani-required-profiles.sh [--base <ref>] [--head <ref>] [--files <path>] [--run] [--ci]

Options:
  --base <ref>     Base git ref for diff (default: auto-detect)
  --head <ref>     Head git ref for diff (default: HEAD)
  --files <path>   Read changed files from newline-delimited file instead of git diff
  --run            Execute the computed scripts/kani.sh command
  --ci             Run CI-parity commands (kani-ci + kani-audit)
  --help           Show this help

Examples:
  ./kani-required-profiles.sh
  ./kani-required-profiles.sh --base main --head HEAD --run
  ./kani-required-profiles.sh --files /tmp/changed.txt --run --ci
USAGE
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! repo_root="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "failed to locate git repository root from: $script_dir" >&2
  exit 2
fi
cd "$repo_root"

BASE_REF=""
HEAD_REF="HEAD"
FILES_INPUT=""
RUN=0
CI=0

declare -a PACKAGES=()
declare -a CHANGED_FILES=()

add_changed_file() {
  local value="$1"
  local item
  [ -z "$value" ] && return 0
  for item in "${CHANGED_FILES[@]:-}"; do
    if [ "$item" = "$value" ]; then
      return 0
    fi
  done
  CHANGED_FILES+=("$value")
}

require_value() {
  local opt="$1"
  local val="${2-}"
  if [ -z "$val" ]; then
    echo "missing value for $opt" >&2
    usage
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      require_value "$1" "${2-}"
      BASE_REF="$2"
      shift 2
      ;;
    --head)
      require_value "$1" "${2-}"
      HEAD_REF="$2"
      shift 2
      ;;
    --files)
      require_value "$1" "${2-}"
      FILES_INPUT="$2"
      shift 2
      ;;
    --run)
      RUN=1
      shift
      ;;
    --ci)
      CI=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

ref_exists() {
  local ref="$1"
  git rev-parse --verify --quiet "$ref" >/dev/null
}

auto_base_ref() {
  local candidates=("origin/main" "main" "origin/master" "master")
  local c
  for c in "${candidates[@]}"; do
    if ref_exists "$c"; then
      printf '%s\n' "$c"
      return 0
    fi
  done

  if ref_exists "HEAD~1"; then
    printf '%s\n' "HEAD~1"
    return 0
  fi

  printf '%s\n' ""
}

add_unique() {
  local value="$1"
  local item
  for item in "${PACKAGES[@]:-}"; do
    if [ "$item" = "$value" ]; then
      return 0
    fi
  done
  PACKAGES+=("$value")
}

mark_default_packages() {
  add_unique "kani-solana"
  add_unique "kamiyo-trust-layer"
  add_unique "kamiyo"
  add_unique "hive"
  add_unique "kamiyo-staking"
}

if [ -n "$FILES_INPUT" ]; then
  if [ ! -f "$FILES_INPUT" ]; then
    echo "changed-files input not found: $FILES_INPUT" >&2
    exit 2
  fi
  while IFS= read -r line; do
    add_changed_file "$line"
  done < "$FILES_INPUT"
else
  if [ -z "$BASE_REF" ]; then
    BASE_REF="$(auto_base_ref)"
    if [ -z "$BASE_REF" ]; then
      echo "failed to auto-detect base ref" >&2
      echo "use --base <ref> explicitly" >&2
      exit 2
    fi
  elif ! ref_exists "$BASE_REF"; then
    echo "base ref not found: $BASE_REF" >&2
    exit 2
  fi

  if ! ref_exists "$HEAD_REF"; then
    echo "head ref not found: $HEAD_REF" >&2
    exit 2
  fi

  while IFS= read -r line; do
    add_changed_file "$line"
  done < <(git diff --name-only "$BASE_REF...$HEAD_REF")

  if [ "$HEAD_REF" = "HEAD" ]; then
    while IFS= read -r line; do
      add_changed_file "$line"
    done < <(git diff --name-only)

    while IFS= read -r line; do
      add_changed_file "$line"
    done < <(git diff --name-only --cached)

    while IFS= read -r line; do
      add_changed_file "$line"
    done < <(git ls-files --others --exclude-standard)
  fi
fi

if [ "${#CHANGED_FILES[@]}" -eq 0 ]; then
  echo "No changed files detected."
  echo "Recommended baseline command: ./scripts/kani.sh"
  exit 0
fi

REQUIRE_FULL=0
REQUIRE_AGENT=0
REQUIRE_ACCOUNT_INFO=0

for file in "${CHANGED_FILES[@]}"; do
  case "$file" in
    scripts/kani*.sh|.github/workflows/kani*.yml)
      mark_default_packages
      REQUIRE_FULL=1
      REQUIRE_AGENT=1
      REQUIRE_ACCOUNT_INFO=1
      ;;

    crates/kani-solana/src/agent/*|crates/kani-solana/tests/agent_verify.rs)
      add_unique "kani-solana"
      REQUIRE_FULL=1
      REQUIRE_AGENT=1
      ;;

    crates/kani-solana/src/account_info.rs|crates/kani-solana/tests/account_info_verify.rs)
      add_unique "kani-solana"
      REQUIRE_FULL=1
      REQUIRE_ACCOUNT_INFO=1
      ;;

    crates/kani-solana/*)
      add_unique "kani-solana"
      REQUIRE_FULL=1
      ;;

    crates/kamiyo-trust-layer/*)
      add_unique "kamiyo-trust-layer"
      REQUIRE_FULL=1
      ;;

    programs/kamiyo/*)
      add_unique "kamiyo"
      REQUIRE_FULL=1
      ;;

    programs/hive/*)
      add_unique "hive"
      REQUIRE_FULL=1
      ;;

    programs/kamiyo-staking/*)
      add_unique "kamiyo-staking"
      REQUIRE_FULL=1
      ;;

    packages/kamiyo-sdk/src/shield/*|packages/kamiyo-sdk/src/privacy/*|packages/kamiyo-solana-privacy/*)
      add_unique "kani-solana"
      add_unique "kamiyo-trust-layer"
      add_unique "kamiyo"
      REQUIRE_FULL=1
      REQUIRE_ACCOUNT_INFO=1
      ;;

    packages/kamiyo-sdk/src/escrow-dispute.ts|packages/kamiyo-sdk/src/quality-oracle.ts|packages/kamiyo-actions/*|packages/kamiyo-solana-inference/*)
      add_unique "kamiyo"
      add_unique "kamiyo-trust-layer"
      add_unique "kani-solana"
      REQUIRE_FULL=1
      ;;

    packages/kamiyo-sdk/src/staking.ts|packages/kamiyo-sdk/src/unified.ts)
      add_unique "kamiyo-staking"
      add_unique "kani-solana"
      REQUIRE_FULL=1
      ;;

    packages/kamiyo-sdk/*|packages/kamiyo-solana-reputation/*)
      mark_default_packages
      REQUIRE_FULL=1
      ;;
  esac
done

if [ "${#PACKAGES[@]}" -eq 0 ]; then
  mark_default_packages
fi

declare -a env_vars=()
if [ "$REQUIRE_FULL" -eq 1 ]; then
  env_vars+=("KANI_FULL=1")
fi
if [ "$REQUIRE_AGENT" -eq 1 ]; then
  env_vars+=("KANI_AGENT=1")
fi
if [ "$REQUIRE_ACCOUNT_INFO" -eq 1 ]; then
  env_vars+=("KANI_ACCOUNT_INFO=1")
fi

echo "Repo root: $repo_root"
if [ -n "$BASE_REF" ]; then
  echo "Diff range: $BASE_REF...$HEAD_REF"
fi
echo "Changed files:"
for file in "${CHANGED_FILES[@]}"; do
  echo "- $file"
done

echo
echo "Required packages: ${PACKAGES[*]}"
if [ "${#env_vars[@]}" -gt 0 ]; then
  echo "Required flags: ${env_vars[*]}"
else
  echo "Required flags: (none)"
fi
echo "Run command:"
echo "  ${env_vars[*]:-} ./scripts/kani.sh ${PACKAGES[*]}"

if [ "$RUN" -eq 1 ]; then
  echo
  echo "Executing kani profile"
  if [ "${#env_vars[@]}" -gt 0 ]; then
    env "${env_vars[@]}" ./scripts/kani.sh "${PACKAGES[@]}"
  else
    ./scripts/kani.sh "${PACKAGES[@]}"
  fi
fi

if [ "$CI" -eq 1 ]; then
  echo
  echo "Executing CI-parity checks"
  if [ "${#env_vars[@]}" -gt 0 ]; then
    env "${env_vars[@]}" KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh "${PACKAGES[@]}"
  else
    KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh "${PACKAGES[@]}"
  fi

  ./scripts/kani-audit.sh kani-results/kani.log
  if [ "$REQUIRE_FULL" -eq 1 ]; then
    KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log
  fi
fi
