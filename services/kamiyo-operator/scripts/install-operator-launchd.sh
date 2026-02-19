#!/usr/bin/env bash
set -euo pipefail

LABEL="ai.kamiyo.operator"
UID_VALUE="$(id -u)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$SCRIPT_DIR/run-operator.sh"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$SERVICE_DIR/../../output/kamiyo-operator"

mkdir -p "$PLIST_DIR" "$LOG_DIR"
chmod +x "$RUNNER"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SERVICE_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"

launchctl bootout "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID_VALUE" "$PLIST_PATH" >/dev/null 2>&1 || true

if ! launchctl bootstrap "gui/$UID_VALUE" "$PLIST_PATH"; then
  if launchctl print "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1; then
    echo "service already registered, continuing"
  else
    echo "failed to bootstrap $LABEL" >&2
    exit 1
  fi
fi
launchctl enable "gui/$UID_VALUE/$LABEL"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

echo "installed and started: $LABEL"
echo "plist: $PLIST_PATH"
echo "logs: $LOG_DIR/launchd.out.log and $LOG_DIR/launchd.err.log"
