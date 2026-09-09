#!/usr/bin/env bash
# Drop a caller workflow into another repo.
#
#   ./install.sh <path-to-repo> <node|pio|terraform>
#
# Writes <repo>/.github/workflows/ci.yml. Commit it from that repo with a client
# that has the `workflow` OAuth scope (plain git / the GitHub web UI).
set -euo pipefail

target="${1:?usage: ./install.sh <path-to-repo> <node|pio|terraform>}"
kind="${2:?usage: ./install.sh <path-to-repo> <node|pio|terraform>}"
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/callers/$kind.yml"

[ -f "$src" ] || { echo "unknown kind: $kind (node|pio|terraform)"; exit 1; }
[ -d "$target/.git" ] || { echo "not a git repo: $target"; exit 1; }

mkdir -p "$target/.github/workflows"
cp "$src" "$target/.github/workflows/ci.yml"
echo "wrote $target/.github/workflows/ci.yml (from callers/$kind.yml)"
echo "next: cd $target && git add .github/workflows/ci.yml && git commit && git push"
