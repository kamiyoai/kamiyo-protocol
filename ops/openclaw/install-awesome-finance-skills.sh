#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/RKiding/Awesome-finance-skills.git}"
REF="${REF:-main}"
SCOPE="${SCOPE:-workspace}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME}"
TARGET_DIR="${TARGET_DIR:-}"
SKILLS_CSV="${SKILLS_CSV:-alphaear-news,alphaear-stock,alphaear-sentiment,alphaear-predictor,alphaear-signal-tracker,alphaear-search,alphaear-reporter,alphaear-logic-visualizer}"
OUTPUT_PATH="${OUTPUT_PATH:-$OPENCLAW_HOME/.openclaw/workspace/runtime/state/awesome-finance-skills.json}"

usage() {
  cat <<'EOF'
Usage:
  install-awesome-finance-skills.sh [options]

Options:
  --scope workspace|managed|both     install target scope (default: workspace)
  --target <dir>                      explicit target dir (overrides --scope)
  --skills <csv>                      comma-separated skill directories to install
  --repo-url <url>                    source repo URL
  --ref <branch-or-tag>               git ref to clone (default: main)
  --output <path>                     install summary JSON path
  -h, --help                          show help
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope)
      [ "$#" -lt 2 ] && { echo "missing value for --scope" >&2; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    --target)
      [ "$#" -lt 2 ] && { echo "missing value for --target" >&2; exit 1; }
      TARGET_DIR="$2"
      shift 2
      ;;
    --skills)
      [ "$#" -lt 2 ] && { echo "missing value for --skills" >&2; exit 1; }
      SKILLS_CSV="$2"
      shift 2
      ;;
    --repo-url)
      [ "$#" -lt 2 ] && { echo "missing value for --repo-url" >&2; exit 1; }
      REPO_URL="$2"
      shift 2
      ;;
    --ref)
      [ "$#" -lt 2 ] && { echo "missing value for --ref" >&2; exit 1; }
      REF="$2"
      shift 2
      ;;
    --output)
      [ "$#" -lt 2 ] && { echo "missing value for --output" >&2; exit 1; }
      OUTPUT_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd git
require_cmd jq
require_cmd cp
require_cmd mktemp

declare -a targets=()
if [ -n "$TARGET_DIR" ]; then
  targets+=("$TARGET_DIR")
else
  case "$SCOPE" in
    workspace)
      targets+=("$OPENCLAW_HOME/.openclaw/workspace/skills")
      ;;
    managed)
      targets+=("$OPENCLAW_HOME/.openclaw/skills")
      ;;
    both)
      targets+=("$OPENCLAW_HOME/.openclaw/workspace/skills")
      targets+=("$OPENCLAW_HOME/.openclaw/skills")
      ;;
    *)
      echo "invalid --scope: $SCOPE (expected workspace|managed|both)" >&2
      exit 1
      ;;
  esac
fi

declare -a skills=()
IFS=',' read -r -a raw_skills <<< "$SKILLS_CSV"
for raw in "${raw_skills[@]}"; do
  skill="$(trim "$raw")"
  if [ -n "$skill" ]; then
    skills+=("$skill")
  fi
done

if [ "${#skills[@]}" -eq 0 ]; then
  echo "no skills requested; SKILLS_CSV is empty after parsing" >&2
  exit 1
fi

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/awesome-finance-skills.XXXXXX")"
clone_dir="$tmp_root/repo"

git clone --depth 1 --branch "$REF" "$REPO_URL" "$clone_dir" >/dev/null
commit_sha="$(git -C "$clone_dir" rev-parse HEAD)"
skills_root="$clone_dir/skills"

if [ ! -d "$skills_root" ]; then
  echo "source repo missing skills directory: $skills_root" >&2
  exit 1
fi

for skill in "${skills[@]}"; do
  src="$skills_root/$skill"
  if [ ! -d "$src" ]; then
    echo "missing skill in source repo: $skill" >&2
    exit 1
  fi
  if [ ! -f "$src/SKILL.md" ]; then
    echo "invalid skill (missing SKILL.md): $skill" >&2
    exit 1
  fi
done

for target in "${targets[@]}"; do
  mkdir -p "$target"
  chmod 700 "$target"
  for skill in "${skills[@]}"; do
    src="$skills_root/$skill"
    dst="$target/$skill"
    mkdir -p "$dst"
    cp -R "$src"/. "$dst"/
  done
done

mkdir -p "$(dirname "$OUTPUT_PATH")"

targets_json="$(printf '%s\n' "${targets[@]}" | jq -R . | jq -s .)"
skills_json="$(printf '%s\n' "${skills[@]}" | jq -R . | jq -s .)"

jq -n \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repoUrl "$REPO_URL" \
  --arg ref "$REF" \
  --arg commit "$commit_sha" \
  --arg scope "$SCOPE" \
  --arg tmpClone "$clone_dir" \
  --argjson targets "$targets_json" \
  --argjson skills "$skills_json" \
  '{
    ok: true,
    at: $at,
    repoUrl: $repoUrl,
    ref: $ref,
    commit: $commit,
    scope: $scope,
    targets: $targets,
    skills: $skills,
    skillCount: ($skills | length),
    clonePath: $tmpClone
  }' >"$OUTPUT_PATH"

chmod 600 "$OUTPUT_PATH"

echo "installed skills: ${#skills[@]}"
echo "targets:"
printf '  - %s\n' "${targets[@]}"
echo "summary: $OUTPUT_PATH"

