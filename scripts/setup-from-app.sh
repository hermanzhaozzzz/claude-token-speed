#!/bin/bash
# Runs detached from the 清图 button in Claude Desktop.
#
# The plugin starts this through `launchctl submit`, so quitting Claude cannot
# kill it. It quits the app first, then elevates with the native admin dialog,
# installs the managed copy, and reopens Claude.
#
# Usage: setup-from-app.sh <plugin-root> <user>

set -u

ROOT="${1:-}"
USER_NAME="${2:-}"
LOG=/tmp/token-speed-setup.log
STATUS_FILE=/tmp/token-speed-setup.status

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

# Let the plugin's toast land, then quit so nothing in the app is holding the
# plugin files or the settings while the install runs.
sleep 2
/usr/bin/osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
sleep 3

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
elif echo "$OUT" | grep -qi 'cancel'; then
  echo "The admin dialog was dismissed."
  status canceled ""
else
  status failed "安装失败（退出码 $STATUS），详见 /tmp/token-speed-setup.log"
fi

rm -f "$RUN"
sleep 1
/usr/bin/open -a Claude || true
exit "$STATUS"
