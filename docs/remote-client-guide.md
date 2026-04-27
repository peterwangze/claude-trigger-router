# Remote client guide

This guide is for someone who uses an existing Claude Trigger Router server.

If you are choosing between local use, server maintenance and remote service use, start with `docs/configuration-roles.md`.

You need two values from the server maintainer:

- server base URL, for example `https://router.example.com`
- a managed API key with `client + read-only` scopes

Do not use an admin/bootstrap key for daily model calls.

## Configure the local client profile

Run setup and choose the remote-service path, or edit the config manually:

```yaml
Runtime:
  mode: "local"
  remote_service:
    enabled: true
    base_url: "https://router.example.com"
    auth_token: "${CTR_REMOTE_AUTH_TOKEN}"

Router: {}
```

Set the token in your shell:

```bash
export CTR_REMOTE_AUTH_TOKEN="ctr_..."
```

On Windows PowerShell:

```powershell
$env:CTR_REMOTE_AUTH_TOKEN = "ctr_..."
```

## Check readiness

```bash
ctr doctor
ctr status
ctr ui
```

`doctor` checks the configured remote service and reports whether it is reachable and ready. `status` shows the local role and remote-service connection hint. `ui` shows remote health through `/api/remote-status`.

## Use with Claude Code

When the maintainer gives you the direct server URL, Claude Code can point at it:

```bash
export ANTHROPIC_BASE_URL="https://router.example.com"
export ANTHROPIC_API_KEY="$CTR_REMOTE_AUTH_TOKEN"
claude
```

If you are using the local `ctr` client profile, keep following the local workflow while remote status support evolves:

```bash
ctr setup
ctr doctor
```

The current remote-service profile focuses on connection config, readiness checks and registration summaries. It does not yet claim full automatic remote request forwarding for every local command.
