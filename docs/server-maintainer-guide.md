# Server maintainer guide

This guide is for the person who owns a self-hosted Claude Trigger Router server.

## 1. Prepare the server profile

```bash
ctr deploy init --target server
```

The command creates a server-oriented config with:

- `HOST: "0.0.0.0"`
- `Runtime.mode: "server"`
- a bootstrap `APIKEY`
- logging enabled
- editable `Models` and `Router.default`

Edit `Models[].key`, `Models[].api`, `Models[].interface` and `Models[].model` before exposing the service.

## 2. Diagnose and start

```bash
ctr doctor
ctr start --daemon
ctr status
```

`ctr status` and `ctr doctor` should show:

- current role: `server (router_service)`
- listener: `0.0.0.0:<port>` or the host you configured
- auth state: bootstrap and active managed key counts
- remote client connection hint: `ANTHROPIC_BASE_URL=http://<server-host>:<port>`

## 3. Issue client keys

Keep the bootstrap `APIKEY` for maintainers. Use it only to open `/ui`, save config, restart, and manage auth.

Create a managed key for remote users:

```text
POST /api/auth/keys
```

Recommended remote-user scopes:

```json
["client", "read-only"]
```

`client` allows model calls. `read-only` allows ready/status checks such as `/api/health`, `/api/service-info`, compiled model summaries and governance GET endpoints. Generated secrets are returned once.

## 4. Expose safely

Prefer one of these deployment envelopes:

- `config/deploy/docker-compose.server.yaml`
- `config/deploy/systemd/claude-trigger-router.service`

Before exposing the service to other machines:

- keep auth enabled with bootstrap or active managed keys
- put public deployments behind HTTPS reverse proxy or private network access
- give remote users managed `client + read-only` keys, not admin/bootstrap keys

## 5. Daily maintenance

Use:

```bash
ctr status
ctr doctor
ctr ui
```

`ctr ui` opens the workbench. The maintainer area shows security status, auth scope guidance, quota usage, governance health and routing outcome summaries.
