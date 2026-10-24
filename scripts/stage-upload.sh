#!/usr/bin/env bash
# Stage files for the browser uploader: copies each path to a flat folder with
# "/" encoded as "__SL__", and prints the staged paths as JSON.
set -euo pipefail
out=/home/claude/stage
rm -rf "$out" && mkdir -p "$out"
for f in "$@"; do cp "$f" "$out/$(echo "$f" | sed 's#/#__SL__#g')"; done
ls -1A "$out" | sed "s#^#$out/#" | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin]))"
