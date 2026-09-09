# SOPS + age — git-committed non-prod config (hardening Phase 12, A8)

For config that is **not a runtime secret but not safe as plaintext either**:
`dev` / `staging` tunables, non-critical API bases, feature-flag seeds. Runtime
secrets (DB URL, JWT keyset, provider keys) stay in **AWS Secrets Manager** and
never go in git, encrypted or not.

## One-time

```bash
brew install sops age            # or: apt install age; go install …/sops
age-keygen -o ~/.config/smart-pet/age.key      # PRIVATE — never commit
age-keygen -y ~/.config/smart-pet/age.key      # the public recipient
```

Put the **public** key in a repo's `.sops.yaml` (copy `sops/.sops.yaml` here as a
template). The **private** key goes to two places only:

- each developer's `~/.config/smart-pet/age.key` (shared over a secure channel)
- a CI secret **`SOPS_AGE_KEY`** — the *only* static secret in CI; it unlocks
  the per-env `*.enc.yaml` during a build.

## Daily use

```bash
sops config/dev.enc.yaml                       # edit (opens $EDITOR, re-encrypts on save)
sops -e -i config/staging.enc.yaml             # encrypt in place
sops exec-env config/dev.enc.yaml 'npm run dev' # decrypt → env for one command
./sops/sops-env.sh config/dev.enc.yaml npm run dev   # wrapper
```

## In CI

```yaml
- run: |
    echo "$SOPS_AGE_KEY" > /tmp/age.key
    export SOPS_AGE_KEY_FILE=/tmp/age.key
    sops exec-env config/${{ inputs.environment }}.enc.yaml 'npm run build'
  env:
    SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
```

## Rules

- `*.enc.yaml` / `*.enc.json` / `*.enc.env` are committed; the plaintext
  equivalents are `.gitignore`d.
- `age.key` (any private key) is **never** committed — add it to `.gitignore`.
- `prod` config does not live here. It lives in Secrets Manager, injected by the
  ECS task def.
