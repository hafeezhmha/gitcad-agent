#!/usr/bin/env sh
set -eu

INPUT="$(cat)"
PROMPT="$(printf '%s' "$INPUT" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const j = JSON.parse(s || "{}"); process.stdout.write(j.prompt || ""); } catch { process.stdout.write(""); } });')"

if [ -n "$PROMPT" ]; then
  npm run generate -- "$PROMPT"
else
  npm run generate
fi
