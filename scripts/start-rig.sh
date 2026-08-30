#!/usr/bin/env bash
#
# Game-day launcher. Builds, then serves the dashboard on the LAN.
#
# Written to be run from a desktop shortcut, so it does two things a bare
# `npm start` does not: it clears a stale server off the port first (the usual
# reason a launch fails), and it holds the window open afterwards so the
# addresses — and any error — stay readable instead of vanishing on exit.

cd "$(dirname "$(readlink -f "$0")")/.." || {
  echo "Could not find the project directory."
  read -r -p "Press Enter to close. "
  exit 1
}

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
