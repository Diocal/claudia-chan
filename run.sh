#!/bin/sh
# Starts the floating avatar. CLAUDIA_CHAN_STAY=1 keeps it open without Claude Code.
cd "$(dirname "$0")" || exit 1
exec setsid nohup node_modules/electron/dist/electron . --no-sandbox >/dev/null 2>&1
