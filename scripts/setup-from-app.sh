#!/bin/bash
# Runs detached from the 清图 button in Claude Desktop.
#
# The plugin starts this with perl fork + setsid, so it runs exactly once and
# quitting Claude cannot kill it. It quits the app first, then elevates with
# the native admin dialog, installs the managed copy, and reopens Claude.
#
# Usage: setup-from-app.sh <plugin-root> <user>

set -u

ROOT="${1:-}"
USER_NAME="${2:-}"
LOG=/tmp/token-speed-setup.log
STATUS_FILE=/tmp/token-speed-setup.status
LOCK=/tmp/token-speed-setup.lock
MANAGED_JSON="/Library/Application Support/ClaudeCode/token-speed-market/plugin/.claude-plugin/plugin.json"

exec >>"$LOG" 2>&1
echo "=== $(date '+%F %T') setup from app"
echo "root=$ROOT user=$USER_NAME"

status() {
  echo "$1:$(date +%s):$2" > "$STATUS_FILE"
}

if [ -z "$ROOT" ] || [ -z "$USER_NAME" ] || [ ! -f "$ROOT/scripts/install-managed.sh" ]; then
  echo "Missing the plugin root or its installer."
  status failed "安装器缺失，请在终端重新运行一键安装命令"
  exit 2
fi

# One run at a time; a lock left behind by a crash expires after ten minutes.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null || true
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    echo "Another setup run is in progress; nothing to do."
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

version_of() {
  /usr/bin/sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -n 1
}

# Never quit the app to install a copy that is already there: a repeated press
# must be a no-op, not another restart.
if [ -f "$MANAGED_JSON" ]; then
  MANAGED_VERSION="$(version_of "$MANAGED_JSON")"
  SOURCE_VERSION="$(version_of "$ROOT/.claude-plugin/plugin.json")"
  if [ -n "$MANAGED_VERSION" ] && [ "$MANAGED_VERSION" = "$SOURCE_VERSION" ]; then
    echo "The managed copy $MANAGED_VERSION is already installed."
    status ok ""
    exit 0
  fi
fi

WAS_RUNNING=0
if /usr/bin/pgrep -x Claude >/dev/null 2>&1; then
  WAS_RUNNING=1
fi

# Let the plugin's toast land, then quit so nothing in the app is holding the
# plugin files or the settings while the install runs.
sleep 2
if [ "$WAS_RUNNING" -eq 1 ]; then
  /usr/bin/osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
  sleep 3
fi

# Fixed paths keep the AppleScript free of quoting; the root helper carries the
# real arguments, shell-quoted here.
RUN=/tmp/token-speed-root-install.sh
{
  echo '#!/bin/bash'
  echo "exec /bin/bash $(printf '%q' "$ROOT/scripts/install-managed.sh") --source $(printf '%q' "$ROOT") --user $(printf '%q' "$USER_NAME") --no-restart"
} > "$RUN"
chmod 755 "$RUN"

OUT="$(/usr/bin/osascript -e "do shell script \"/bin/bash $RUN \" with administrator privileges" 2>&1)"
STATUS=$?
echo "$OUT"

if [ "$STATUS" -eq 0 ]; then
  status ok ""
elif echo "$OUT" | grep -qi 'cancel\|取消\|(-128)'; then
  echo "The admin dialog was dismissed."
  status canceled ""
else
  status failed "安装失败（退出码 $STATUS），详见 /tmp/token-speed-setup.log"
fi

rm -f "$RUN"
if [ "$WAS_RUNNING" -eq 1 ]; then
  sleep 1
  /usr/bin/open -a Claude || true
fi
exit "$STATUS"
