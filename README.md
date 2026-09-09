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
