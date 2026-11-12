#!/bin/sh
# Starts the floating avatar. CLAUDIA_CHAN_STAY=1 keeps it open without Claude Code.
cd "$(dirname "$0")" || exit 1
exec $(command -v setsid) nohup "node_modules/electron/dist/$(cat node_modules/electron/path.txt)" . --no-sandbox --wake >/dev/null 2>&1
