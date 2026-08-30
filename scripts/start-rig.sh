#!/usr/bin/env bash
#
# Game-day launcher. Builds, then serves the dashboard on the LAN.
#
# Written to be run from a desktop shortcut, so it does three things a bare
# `npm start` does not: it finds Node when the desktop environment has not, it
# clears a stale server off the port first, and it holds the window open
# afterwards so the addresses — and any error — stay readable.

cd "$(dirname "$(readlink -f "$0")")/.." || {
  echo "Could not find the project directory."
  read -r -p "Press Enter to close. "
  exit 1
}

# A shortcut launches from a minimal environment that never sources ~/.bashrc,
# so a Node installed by nvm or fnm is simply absent from PATH: the launcher
# dies with "npm: command not found" while the very same command works in a
# terminal. Load the version manager the way a login shell would have.
if ! command -v npm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use --silent default >/dev/null 2>&1
fi

if ! command -v npm >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env 2>/dev/null)" >/dev/null 2>&1
fi

if ! command -v npm >/dev/null 2>&1; then
  for dir in /usr/local/bin /usr/bin /snap/bin "$HOME/.local/bin"; do
    if [ -x "$dir/npm" ]; then
      PATH="$dir:$PATH"
      break
    fi
  done
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not on this launcher's PATH, and no nvm or fnm install was found."
  echo
  echo "In a terminal, run:  command -v npm"
  echo "Then add that directory to PATH near the top of:"
  echo "  $(readlink -f "$0")"
  echo
  read -r -p "Press Enter to close. "
  exit 127
fi

echo "node $(node -v 2>/dev/null)  ·  npm $(command -v npm)"
echo

npm run stop >/dev/null 2>&1

npm start
status=$?

echo
if [ $status -eq 0 ]; then
  echo "Server stopped."
else
  echo "Server exited with status $status — the error above says why."
fi
read -r -p "Press Enter to close. "
