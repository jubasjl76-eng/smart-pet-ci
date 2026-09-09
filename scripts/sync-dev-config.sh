#!/usr/bin/env bash
#
# Copy the shared dev-config into a target repo (hardening Phase 13, A9).
# Idempotent. Picks the file set from what the repo looks like.
#
#   ./scripts/sync-dev-config.sh ../smart-pet-backend
#   ./scripts/sync-dev-config.sh ../smart-feeder --firmware
#
# JS/TS repos also need devDeps + `lefthook install` — see the printed hint.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/config"
DEST="${1:?usage: sync-dev-config.sh <repo-dir> [--firmware|--python|--js]}"
KIND="${2:-}"
[ -d "$DEST" ] || { echo "no such dir: $DEST" >&2; exit 1; }

cp "$SRC/.editorconfig" "$DEST/.editorconfig"
cp "$SRC/.markdownlint.jsonc" "$DEST/.markdownlint.jsonc"

is_js=false; is_fw=false; is_py=false
case "$KIND" in
  --js) is_js=true ;;
  --firmware) is_fw=true ;;
  --python) is_py=true ;;
  *)
    [ -f "$DEST/package.json" ] && is_js=true
    [ -f "$DEST/platformio.ini" ] && is_fw=true
    ls "$DEST"/*.tf "$DEST"/**/*.tf >/dev/null 2>&1 && KIND="tf"
    ;;
esac

if $is_js; then
  cp "$SRC/prettier.config.mjs" "$DEST/prettier.config.mjs"
  cp "$SRC/commitlint.config.mjs" "$DEST/commitlint.config.mjs"
  cp "$SRC/lefthook.yml" "$DEST/lefthook.yml"
  # eslint flat config: a repo's own eslint.config.mjs re-exports the shared one
  cp "$SRC/eslint.config.mjs" "$DEST/eslint.shared.mjs"
  [ -f "$DEST/eslint.config.mjs" ] || printf "export { default } from './eslint.shared.mjs';\n" > "$DEST/eslint.config.mjs"
  echo "  js repo: add devDeps + run lefthook install:"
  echo "    npm i -D lefthook prettier eslint typescript-eslint @eslint/js globals \\"
  echo "             @commitlint/cli @commitlint/config-conventional && npx lefthook install"
fi

if $is_fw; then
  cp "$SRC/.clang-format" "$DEST/.clang-format"
  cp "$SRC/lefthook.yml" "$DEST/lefthook.yml"
  echo "  firmware repo: install lefthook + clang-format, then: lefthook install"
fi

if $is_py; then
  cp "$SRC/ruff.toml" "$DEST/ruff.toml"
fi

echo "synced dev-config → $DEST"
