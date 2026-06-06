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

`doctor` checks the configured remote service and reports whether it is reachable and ready. It also prints the service-scope discovery boundary and a redacted remote registration summary when `/api/registration` is reachable.

`status` shows the local role and remote-service connection hint. `ui` shows remote health through `/api/remote-status`, including remote discovery, availability, remote model count, upstream service count and client next steps. This is still a service-level contract; it does not mean node/cluster orchestration, hosted cloud control plane or remote config writeback is supported.

## Use with Claude Code through local ctr

```bash
ctr setup
ctr doctor
ctr code
```

With `Runtime.remote_service.enabled`, the local `ctr` service acts as a thin client proxy for model calls. Claude Code still talks to local `ctr`, while `ctr` forwards `/v1/messages` and `/v1/chat/completions` to the configured remote service with `Runtime.remote_service.auth_token`.

You can still point Claude Code directly at the remote server when you do not want a local proxy:

```bash
export ANTHROPIC_BASE_URL="https://router.example.com"
export ANTHROPIC_AUTH_TOKEN="$CTR_REMOTE_AUTH_TOKEN"
claude
```

For raw HTTP clients, the server accepts the managed key through either `Authorization: Bearer <token>` or `x-api-key: <token>`. For Claude Code, keep using `ANTHROPIC_AUTH_TOKEN`; local `ctr code` also injects this variable and clears `ANTHROPIC_API_KEY` so stale provider keys do not bypass the local proxy.
