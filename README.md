# smart-pet-ci

Shared reusable GitHub Actions workflows for the Smart Pet repos. Each project
keeps a ~10-line `.github/workflows/ci.yml` that calls one of these; the logic
(Node version, cache keys, test steps, the PlatformIO matrix) lives here once.

## Workflows

| File | For | Key inputs |
|---|---|---|
| `.github/workflows/node-ci.yml` | backend, mqtt, simulator, gateway, dashboard | `node-version` (22), `working-directory` (.), `typecheck` (true → `tsc --noEmit`), `test-command` (`npm test`), `run-build` (false) |
| `.github/workflows/pio-ci.yml` | `smart-pet-device-sdk`, ported firmware repos | `environments` (`'["feeder","door","scale"]'`), `native-test-command` (`./test/run_native.sh`, `""` to skip) |
| `.github/workflows/terraform-ci.yml` | `smart-pet-terraform` (Phase 10) | `working-directory`, `terraform-version` (1.9.8), `run-plan` (false); AWS creds as `secrets:` when `run-plan` |
| `.github/workflows/deploy-ecs.yml` | app repos deploying to ECS (Phase 10) | `service`, `task-family`, `container-name`, `cluster`, `ecr-repo`, `aws-region`, `role-to-assume` (OIDC), `run-migrations`, `migration-command` |

## One-time setup for this repo

The reusable workflows must live at `.github/workflows/` to be callable, but the
OAuth token that scaffolded this repo cannot push there. From a client with the
`workflow` scope (plain git, or the GitHub web UI):

```bash
git mv workflows .github/workflows
git commit -m "activate reusable workflows"
git push
```

Then, because this repo is **private**: Settings → Actions → General →
"Access" → allow it to be used by the other repositories in the account.

## Adding CI to a repo

```bash
./install.sh ../smart-pet-backend node
# then, from that repo, with `workflow` scope:
cd ../smart-pet-backend
git add .github/workflows/ci.yml && git commit -m "ci: use smart-pet-ci/node-ci" && git push
```

Or copy the matching file from `callers/` by hand and uncomment the `with:` you
need.

## Renovate (shared dependency automation — hardening Phase 11)

`renovate/default.json` is the shared preset. Each repo drops a `renovate.json`:

```json
{ "extends": ["github>jubasjl76-eng/smart-pet-ci//renovate/default.json"] }
```

(`callers/renovate.json` is that file, ready to copy.) The preset:

- **Internal deps** (`@jubasjl76-eng/*` packages and `github:jubasjl76-eng/<repo>#<tag>`
  git-tag deps): grouped as "smart-pet internal", **automerged once CI is green**,
  no release-age delay.
- **External deps**: pinned exact, grouped per package manager, **human review**.
- **GitHub Actions**: pinned to SHA, digest/patch/minor automerged.
- **`platformio.ini`** platform/lib pins: PRs only (they are commit-pinned on
  purpose).
- Weekly schedule, lock-file maintenance, a dependency dashboard issue,
  vulnerability fixes automerged.

Enable the Renovate GitHub App on the account once; it picks up every repo's
`renovate.json`.

## Branch protection (`scripts/apply-branch-protection.sh`)

One idempotent script that applies the baseline ruleset to every repo's
integration branch (`development` for services, `main` for libs/infra/firmware):
PR required, `required_approving_review_count: 0` (a solo account can't
self-approve — CI is the gate), dismiss stale approvals, required status checks
must pass + branch up to date, conversation resolution required, no force-push,
no deletion, `enforce_admins: false` (emergency fixes can still land).

```bash
./scripts/apply-branch-protection.sh --dry-run          # print the payloads
./scripts/apply-branch-protection.sh                    # apply to all
./scripts/apply-branch-protection.sh smart-pet-backend  # one repo
```

Needs `gh` (with repo-admin rights) + `jq`. Node repos require the `ci / ci`
check; the pio/terraform repos are left with no hard-required check until you
read the real context name from a PR and fill it into `DEFAULT_TARGETS`.

## Environment strategy (hardening Phase 12, A8)

Four tiers: **Local** (compose) → **Dev** (`envs/dev`, auto on merge to
`development`) → **Staging** (`envs/staging`, on a `v*-rc.N` tag) → **Prod**
(`envs/prod`, on a `v*` tag, gated by required reviewers).

- **GitHub Environments** `dev` / `staging` / `prod` exist on each deploying repo
  (`smart-pet-backend`, `pet-iot-sensors-service`). `prod` has a required
  reviewer. `vars.DEPLOY_ROLE_ARN` / `vars.AWS_REGION` are set **per
  environment** (each tier's own OIDC deploy role from
  `smart-pet-terraform module.oidc`).
- `deploy-ecs.yml` takes an **`environment`** input; a caller's `deploy.yml`
  resolves dev/staging/prod from the git ref and passes it, so the job binds to
  that Environment's protection rules + scoped vars, and targets
  `smart-pet-<env>` / `smart-pet-<env>-<service>`.
- **SOPS + age** (`sops/`) for git-committed non-prod config (`*.enc.yaml`).
  `SOPS_AGE_KEY` is the only static CI secret. Runtime secrets stay in AWS
  Secrets Manager. See `sops/README.md`.

## Shared dev-config (`config/`, hardening Phase 13, A9)

One place for formatting/lint/hook config so every repo is consistent.

| File | Applies to |
|---|---|
| `.editorconfig` | all repos |
| `.markdownlint.jsonc` | all repos |
| `eslint.config.mjs` | TS repos (flat config; a repo's `eslint.config.mjs` re-exports it) |
| `prettier.config.mjs` | TS repos |
| `commitlint.config.mjs` | TS repos (conventional commits) |
| `lefthook.yml` | TS + firmware repos — pre-commit: prettier + eslint + clang-format + gitleaks + fast `tsc`; commit-msg: commitlint; pre-push: `npm test` |
| `.clang-format` | SDK + firmware repos (Google base, 2-space, 100 col) |
| `ruff.toml` | Python (HIL harness, scripts) |
| `.devcontainer/devcontainer.json` | base image — Node 22, Python 3.11, terraform, gh, pnpm, lefthook, PlatformIO, `age`, `mosquitto-clients`, `clang-format` |

```bash
./scripts/sync-dev-config.sh ../smart-pet-backend          # auto-detects the repo type
./scripts/sync-dev-config.sh ../smart-feeder --firmware
```

The script copies the right subset. TS repos then add the devDeps it prints and
run `npx lefthook install`. Keep pre-commit under ~5s or it gets bypassed; heavy
checks stay in CI.

## Planned wiring

| Repo | Caller | Notes |
|---|---|---|
| `smart-pet-backend` | `node` | `run-build: true` once a Docker image build is added in Phase 10 |
| `smart-pet-mqtt` | `node` | |
| `smart-pet-simulator` | `node` | |
| `pet-iot-edge-gateway` | `node` | |
| `backoffice-dashboard` | `node` | `test-command: "npm run build"` if there are no unit tests yet |
| `smart-pet-website` | none | Vercel runs its own build/preview CI |
| `smart-pet-device-sdk` | `pio` | replaces the inline `ci/github-ci.yml` in that repo |
| `smart-pet-terraform` | `terraform` | `run-plan: true` + AWS secrets once the backend exists |
