#!/usr/bin/env bash
#
# Launch the full FocusQuote dev environment in a single tmux session:
#   - left pane:  backend API   (npm run dev:server   → http://localhost:3000)
#   - right pane: extension HMR  (npm run dev:extension)
#
# Usage:
#   ./dev.sh            # create (or re-attach to) the session
#   ./dev.sh kill       # stop the session and all dev servers
#
# Requires tmux (macOS: `brew install tmux`).
set -euo pipefail

SESSION="focusquote"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed. Install it with:  brew install tmux" >&2
  exit 1
fi

# `./dev.sh kill` tears everything down.
if [[ "${1:-}" == "kill" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "Stopped '$SESSION'." || echo "No '$SESSION' session running."
  exit 0
fi

# If the session already exists, just attach to it instead of starting twice.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Attaching to existing '$SESSION' session…"
  exec tmux attach-session -t "$SESSION"
fi

# Create a detached session whose first pane runs the server.
tmux new-session -d -s "$SESSION" -c "$ROOT" -n dev
tmux send-keys -t "$SESSION:dev" "npm run dev:server" C-m

# Split horizontally for the extension's HMR build.
tmux split-window -h -t "$SESSION:dev" -c "$ROOT"
tmux send-keys -t "$SESSION:dev" "npm run dev:extension" C-m

# Even split, focus the server pane.
tmux select-layout -t "$SESSION:dev" even-horizontal
tmux select-pane -t "$SESSION:dev.0"

exec tmux attach-session -t "$SESSION"
