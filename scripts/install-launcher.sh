#!/usr/bin/env bash
#
# Installs a desktop shortcut that starts the rig.
#
# The paths have to be absolute in a .desktop file, so the entry is generated
# here from wherever the repo actually lives rather than shipped as a fixed
# file that only works for one person.

set -e

REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
DEST="$HOME/.local/share/applications"
FILE="$DEST/cfb-saturday.desktop"

mkdir -p "$DEST"
cat > "$FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=CFB Saturday
Comment=Build and serve the game-day dashboard on the LAN
Exec=$REPO/scripts/start-rig.sh
Icon=$REPO/assets/icon.svg
Terminal=true
Categories=AudioVideo;Network;
DESKTOP

chmod +x "$FILE" "$REPO/scripts/start-rig.sh"

# Cinnamon and GNOME both cache the menu; without this the entry can take a
# few minutes to show up, which reads as a failed install.
command -v update-desktop-database >/dev/null 2>&1 &&
  update-desktop-database "$DEST" >/dev/null 2>&1 || true

echo "Installed: $FILE"
echo
echo "Find \"CFB Saturday\" in the menu. Right-click it there to add it to"
echo "the panel or the desktop."
