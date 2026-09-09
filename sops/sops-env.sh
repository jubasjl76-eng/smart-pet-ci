#!/usr/bin/env bash
# Decrypt a SOPS file into the environment for one command. No plaintext hits disk.
#   ./sops-env.sh config/dev.enc.yaml npm run dev
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <enc-file> <cmd> [args...]" >&2; exit 2; }
FILE="$1"; shift
exec sops exec-env "$FILE" "$*"
