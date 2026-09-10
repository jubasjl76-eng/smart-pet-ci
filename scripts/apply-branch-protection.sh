#!/usr/bin/env bash
#
# Apply a baseline branch-protection ruleset to every Smart Pet repo's
# integration branch. Idempotent — safe to re-run. Hardening Phase 11
# (SMART-PET-HARDENING-PLAN.md A7, smart-pet-docs/REPOSITORIES.md rule 5).
#
# Baseline (tuned for a solo maintainer + Renovate automerge):
#   - no direct pushes: a PR is required to land on the integration branch
#   - required_approving_review_count = 0  (a solo account can't self-approve;
#     CI is the gate, not a human review)
#   - dismiss stale approvals on new commits
#   - required status checks must pass and the branch must be up to date
#   - conversation resolution required
#   - force-push and branch deletion blocked
#   - enforce_admins = false  (lets you land an emergency fix without a green CI)
#
# Requires: gh (authenticated with admin rights on the repos), jq.
# Usage:    ./scripts/apply-branch-protection.sh [--dry-run] [repo[:branch] ...]
#           no args → the full list below.

set -euo pipefail

OWNER="jubasjl76-eng"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && { DRY_RUN=true; shift; }

# repo:branch:comma-separated required check contexts
#
# The node repos all run smart-pet-ci/node-ci.yml → the check context is "ci / ci"
# (verified). terraform requires "fmt" (the non-matrix job). The pio repos
# (sdk, firmware) run a per-environment build matrix whose context names
# ("ci / device (feeder)", "build / device (esp32dev)", …) shift with the
# matrix, so no check is hard-required there — the ruleset still forces
# "PR required + branch up to date". To require one, read the exact context from
# `gh pr checks <n> --repo jubasjl76-eng/<repo>` and add it here, then re-run.
DEFAULT_TARGETS=(
  "smart-pet-backend:development:ci / ci"
  "pet-iot-edge-gateway:development:ci / ci"
  "pet-iot-sensors-service:development:ci / ci"
  "pet-iot-camera-service:development:ci / ci"
  "backoffice-dashboard:development:ci / ci"
  "smart-pet-website:development:"
  "smart-pet-mqtt:main:ci / ci"
  "smart-pet-shared:main:ci / ci"
  "smart-pet-api-client:main:ci / ci"
  "smart-pet-simulator:main:ci / ci"
  "smart-pet-dev:main:"
  "smart-pet-docs:main:ci / ci"
  "smart-pet-ci:main:"
  "smart-pet-device-sdk:main:"
  "smart-pet-terraform:main:fmt"
  "smart-feeder:main:"
  "smart-water-dispenser:main:"
  "gps-dog-collar:main:"
)

if [[ $# -gt 0 ]]; then
  TARGETS=()
  for a in "$@"; do
    if [[ "$a" == *:* ]]; then TARGETS+=("$a:"); else
      for d in "${DEFAULT_TARGETS[@]}"; do [[ "$d" == "$a:"* ]] && TARGETS+=("$d"); done
    fi
  done
else
  TARGETS=("${DEFAULT_TARGETS[@]}")
fi

build_payload() {
  local checks_csv="$1" contexts_json="[]"
  if [[ -n "$checks_csv" ]]; then
    contexts_json=$(printf '%s' "$checks_csv" | jq -R 'split(",")')
  fi
  jq -nc --argjson contexts "$contexts_json" '{
    required_status_checks: { strict: true, contexts: $contexts },
    enforce_admins: false,
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false
    },
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false,
    restrictions: null,
    required_linear_history: false
  }'
}

rc=0
for t in "${TARGETS[@]}"; do
  repo="${t%%:*}"; rest="${t#*:}"; branch="${rest%%:*}"; checks="${rest#*:}"
  payload=$(build_payload "$checks")
  echo "── ${repo}@${branch}  checks=[${checks:-none}]"
  if $DRY_RUN; then
    echo "$payload" | jq .
    continue
  fi
  if echo "$payload" | gh api -X PUT \
      -H "Accept: application/vnd.github+json" \
      "repos/${OWNER}/${repo}/branches/${branch}/protection" \
      --input - >/dev/null 2>err.log; then
    echo "   ✓ applied"
  else
    echo "   ✗ failed:"; sed 's/^/     /' err.log; rc=1
  fi
  rm -f err.log
done

exit $rc
