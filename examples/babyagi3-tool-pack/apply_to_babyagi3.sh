#!/usr/bin/env bash
set -euo pipefail

BABYAGI_DIR=${1:-}
if [[ -z "${BABYAGI_DIR}" ]]; then
  echo "Usage: $0 /path/to/babyagi3" >&2
  exit 2
fi

if [[ ! -d "${BABYAGI_DIR}/tools/optional" ]]; then
  echo "Error: ${BABYAGI_DIR}/tools/optional not found" >&2
  exit 1
fi

cp -f "$(dirname "$0")/tools/optional/kamiyo.py" "${BABYAGI_DIR}/tools/optional/kamiyo.py"

python3 - "${BABYAGI_DIR}" <<'PY'
from __future__ import annotations

from pathlib import Path
import sys

babyagi_dir = Path(sys.argv[1])
optional_init = babyagi_dir / "tools" / "optional" / "__init__.py"

text = optional_init.read_text(encoding="utf-8")
if '"tools.optional.kamiyo"' in text:
    print("Loader entry already present")
    raise SystemExit(0)

lines = text.splitlines(True)
insert_after = None
for i, line in enumerate(lines):
    if line.strip().startswith("_OPTIONAL_MODULES") and "{" in line:
        insert_after = i
        break

if insert_after is None:
    raise SystemExit("Could not find _OPTIONAL_MODULES mapping in tools/optional/__init__.py")

lines.insert(insert_after + 1, '    "tools.optional.kamiyo": ["KAMIYO_ENABLED"],\n')
optional_init.write_text("".join(lines), encoding="utf-8")
print("Added loader entry for tools.optional.kamiyo")
PY

echo "Applied KAMIYO BabyAGI tools."
