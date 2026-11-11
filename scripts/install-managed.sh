#!/bin/bash
set -euo pipefail

# One-command desktop setup for token-speed.
#
# Installs the machine-level managed copy, removes the user-scope plugin and its
# marketplace (the app would otherwise load a same-name --plugin-dir copy that
# the managed lock rejects), and restarts Claude.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hermanzhaozzzz/claude-token-speed/main/scripts/install-managed.sh | sudo bash
#
# Re-run the same command to update the managed copy.
#
# Options (used by the 清图 button in the desktop app):
#   --source DIR   install from this directory instead of cloning (skips the network)
#   --user NAME    the desktop user; defaults to $SUDO_USER
#   --no-restart   do not quit and reopen Claude afterwards

SOURCE=""
USER_NAME=""
RESTART=1

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --no-restart) RESTART=0; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run this with sudo, from your own account." >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/hermanzhaozzzz/claude-token-speed/main/scripts/install-managed.sh | sudo bash" >&2
  exit 1
fi

[ -n "$USER_NAME" ] || USER_NAME="${SUDO_USER:-}"
if [ -z "$USER_NAME" ] || [ "$USER_NAME" = "root" ]; then
  echo "Run this with sudo from your own account, not as root." >&2
  exit 1
fi

run_as_user() {
  sudo -u "$USER_NAME" -H bash -lc "$1"
}

USER_HOME="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[ -n "$USER_HOME" ] || USER_HOME="/Users/$USER_NAME"

CLAUDE_BIN="$(run_as_user 'command -v claude' 2>/dev/null | tail -n 1 || true)"
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  for candidate in "$USER_HOME/.local/bin/claude" "/opt/homebrew/bin/claude" "/usr/local/bin/claude"; do
    if [ -x "$candidate" ]; then
      CLAUDE_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "claude CLI not found for $USER_NAME." >&2
  exit 1
fi

if [ -n "$SOURCE" ]; then
  SRC="$SOURCE"
  echo "Using the plugin at $SRC…"
  if [ ! -f "$SRC/.claude-plugin/plugin.json" ]; then
    echo "The plugin manifest is missing from $SRC." >&2
    exit 1
  fi
else
  WORK="/tmp/token-speed-managed.$$"
  trap 'rm -rf "$WORK"' EXIT
  echo "Fetching the plugin…"
  run_as_user "rm -rf '$WORK' && mkdir -p '$WORK' && git clone --depth 1 https://github.com/hermanzhaozzzz/claude-token-speed.git '$WORK/src'"
  SRC="$WORK/src"
  if [ ! -f "$SRC/.claude-plugin/plugin.json" ]; then
    echo "The plugin manifest is missing from the clone." >&2
    exit 1
  fi
fi

BASE="/Library/Application Support/ClaudeCode"
MARKET="$BASE/token-speed-market"
PLUGIN="$MARKET/plugin"
SETTINGS="$BASE/managed-settings.json"

if [ -f "$SETTINGS" ] && ! grep -q '"token-speed-local"' "$SETTINGS"; then
  echo "Refusing to overwrite existing managed settings: $SETTINGS" >&2
  echo "Merge the token-speed-local entries by hand instead." >&2
  exit 2
fi

echo "Installing the managed copy…"
mkdir -p "$MARKET/.claude-plugin" "$PLUGIN"
rsync -a --delete \
  --exclude '.git' \
  --exclude '.in_use' \
  --exclude 'node_modules' \
  --exclude 'tests' \
  --exclude 'scripts' \
  --exclude 'dist' \
  --exclude 'build' \
  "$SRC/" "$PLUGIN/"

cat > "$MARKET/.claude-plugin/marketplace.json" <<'JSON'
{
  "name": "token-speed-local",
  "owner": { "name": "Huanan Herman Zhao" },
  "plugins": [{ "name": "token-speed", "source": "./plugin" }]
}
JSON

cat > "$SETTINGS" <<'JSON'
{
  "parentSettingsBehavior": "merge",
  "extraKnownMarketplaces": {
    "token-speed-local": {
      "source": {
        "source": "directory",
        "path": "/Library/Application Support/ClaudeCode/token-speed-market"
      }
    }
  },
  "enabledPlugins": {
    "token-speed@token-speed-local": true
  },
  "prependPlugins": ["token-speed@token-speed-local", "sec-default@builtin"]
}
JSON

chmod 755 "$BASE" "$MARKET" "$PLUGIN"
chmod 644 "$SETTINGS" "$MARKET/.claude-plugin/marketplace.json"

echo "Cleaning up any user-scope copy…"
INSTALLED_JSON="$USER_HOME/.claude/plugins/installed_plugins.json"
KNOWN_JSON="$USER_HOME/.claude/plugins/known_marketplaces.json"
REMOVED=0

# Only call the CLI when there is something to remove: a failed uninstall is
# otherwise reported as an error even though nothing was installed.
if [ -f "$INSTALLED_JSON" ] && grep -q 'token-speed@claude-token-speed' "$INSTALLED_JSON"; then
  run_as_user "'$CLAUDE_BIN' plugin uninstall token-speed@claude-token-speed" || true
  REMOVED=1
fi
if [ -f "$KNOWN_JSON" ] && grep -q '"claude-token-speed"' "$KNOWN_JSON"; then
  run_as_user "'$CLAUDE_BIN' plugin marketplace remove claude-token-speed" || true
  REMOVED=1
fi

if [ "$RESTART" -eq 1 ]; then
  echo "Restarting Claude…"
  run_as_user "osascript -e 'tell application \"Claude\" to quit'" || true
  sleep 2
  run_as_user "open -a 'Claude'" || true
else
  echo "Skipping the Claude restart (--no-restart)."
fi

echo
echo "Done. token-speed now runs as a managed plugin."
if [ "$REMOVED" -eq 1 ]; then
  echo "The user-scope plugin and marketplace were removed."
else
  echo "No user-scope plugin or marketplace was installed."
fi
echo "Click 清图 in Claude Desktop. Re-run this command to update the managed copy."
