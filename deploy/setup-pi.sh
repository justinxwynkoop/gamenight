#!/usr/bin/env bash
# One-time setup for a Raspberry Pi (Raspberry Pi OS with desktop). Run once from a terminal:
#   git clone https://github.com/justinxwynkoop/gamenight.git ~/gamenight && ~/gamenight/deploy/setup-pi.sh
# It installs what Game Night needs, sets the host PIN, and puts icons on the desktop.
# Safe to run again. After this, you start everything from the desktop icons.
set -eu

DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$DIR"

echo "== Game Night setup =="

node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! node_ok; then
  echo "-- Installing Node.js (needs your Pi password) --"
  sudo apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v git >/dev/null 2>&1 || sudo apt-get install -y git

echo "-- Installing Game Night's parts --"
npm install --omit=dev

mkdir -p data
PIN="${HOST_PIN:-}"
if [ -z "$PIN" ] && [ -t 0 ]; then
  printf 'Choose a host PIN (4 or more digits) or press Enter for a random one: '
  read -r PIN || PIN=""
fi
if [ -n "$PIN" ]; then
  case "$PIN" in
    *[!0-9]*|"") echo "A PIN is digits only; keeping the existing/random one."; PIN="" ;;
    *) if [ "${#PIN}" -lt 4 ]; then echo "PIN too short; keeping the existing/random one."; PIN=""; fi ;;
  esac
fi
if [ -n "$PIN" ]; then printf '{"pin":"%s"}\n' "$PIN" >data/config.json; echo "Host PIN set."; fi

chmod +x deploy/gamenight.sh

DESKTOP="${GAMENIGHT_DESKTOP:-$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")}"
mkdir -p "$DESKTOP"
make_icon() { # file, name, comment, action
  cat >"$DESKTOP/$1.desktop" <<ICON
[Desktop Entry]
Type=Application
Name=$2
Comment=$3
Exec="$DIR/deploy/gamenight.sh" $4
Icon=$DIR/deploy/gamenight.svg
Terminal=false
Categories=Game;
ICON
  chmod +x "$DESKTOP/$1.desktop"
}
make_icon "game-night" "Game Night" "Start Game Night and show the board on this screen" tv
make_icon "game-night-host-info" "Game Night Host Info" "Show the host address and PIN" info
make_icon "game-night-stop" "Game Night Stop" "Stop Game Night" stop
make_icon "game-night-update" "Game Night Update" "Download the newest version" update

echo
echo "Done. Icons are on the desktop in: $DESKTOP"
echo "  Game Night            starts everything and shows the board full screen"
echo "  Game Night Host Info  shows the host address and PIN for your phone"
echo "  Game Night Stop       stops the game server"
echo "  Game Night Update     downloads the newest version"
echo "The first time you double-click an icon, the Pi may ask whether to run it. Choose Execute."
echo "To leave the full-screen board, press Alt+F4."
