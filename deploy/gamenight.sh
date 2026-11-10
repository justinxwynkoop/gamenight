#!/usr/bin/env bash
# Game Night launcher. The desktop icons call this; you can also run it by hand:
#   gamenight.sh tv      start the server if needed, show the board full screen (the main icon)
#   gamenight.sh info    start the server if needed, show the host address and PIN
#   gamenight.sh stop    stop the server
#   gamenight.sh update  download the newest version
#   gamenight.sh start   start the server only
# Closing the TV window leaves the server (and the game in progress) running.
set -u

DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PORT="${PORT:-3000}"
export PORT
LOG="$DIR/data/server.log"
PIDFILE="$DIR/data/server.pid"
URL="http://localhost:$PORT"
mkdir -p "$DIR/data"

say() { echo "$*" >>"$LOG"; notify-send "Game Night" "$*" 2>/dev/null || true; }

is_up() { curl -fsS --max-time 2 "$URL/api/info" >/dev/null 2>&1; }

start_server() {
  if is_up; then return 0; fi
  cd "$DIR" || return 1
  if ! command -v node >/dev/null 2>&1; then
    say "Node.js is not installed. Run deploy/setup-pi.sh first."; return 1
  fi
  if [ ! -d node_modules ]; then npm install --omit=dev >>"$LOG" 2>&1; fi
  nohup node server.js >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in $(seq 1 60); do
    if is_up; then return 0; fi
    sleep 0.5
  done
  say "Game Night did not start. Details are in $LOG"
  return 1
}

browser() {
  if [ -n "${GAMENIGHT_BROWSER:-}" ]; then echo "$GAMENIGHT_BROWSER"; return; fi
  command -v chromium-browser || command -v chromium || command -v google-chrome || true
}

case "${1:-tv}" in
  start)
    start_server ;;
  tv)
    start_server || exit 1
    B="$(browser)"
    if [ -z "$B" ]; then say "No Chromium browser found."; exit 1; fi
    # Full screen, no "restore pages?" bubble, and sound allowed without a click.
    # --password-store=basic stops Chromium asking to create a password keyring; in full screen that
    # prompt hides behind the page and leaves a white screen.
    exec "$B" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run \
      --password-store=basic --autoplay-policy=no-user-gesture-required "$URL/tv" ;;
  info)
    start_server || exit 1
    B="$(browser)"
    if [ -z "$B" ]; then say "No Chromium browser found."; exit 1; fi
    exec "$B" --no-first-run --password-store=basic --app="$URL/host-info" --window-size=620,820 ;;
  stop)
    if [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; then
      rm -f "$PIDFILE"; say "Game Night stopped."
    else
      rm -f "$PIDFILE"; say "Game Night was not running."
    fi ;;
  update)
    cd "$DIR" || exit 1
    say "Updating Game Night..."
    if git pull --ff-only >>"$LOG" 2>&1 && npm install --omit=dev >>"$LOG" 2>&1; then
      say "Updated. Stop and start Game Night to use the new version."
    else
      say "Update failed (is the Pi online?). Details are in $LOG"; exit 1
    fi ;;
  *)
    echo "Usage: $0 {tv|info|start|stop|update}" >&2; exit 2 ;;
esac
