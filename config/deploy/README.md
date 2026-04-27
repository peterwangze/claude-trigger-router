# Claude Trigger Router server deployment templates

These templates are included in the npm package under `config/deploy`.

Role-specific guides live in:

- `docs/server-maintainer-guide.md`
- `docs/remote-client-guide.md`

Recommended flow:

```bash
ctr deploy init --target server
ctr doctor
ctr start --daemon
```

Use `docker-compose.server.yaml` when you want a minimal container profile. Prepare `./ctr-home/.claude-trigger-router/config.yaml` with `ctr deploy init --target server`, edit `Models[].key` and `Models[].model`, then run:

```bash
docker compose -f docker-compose.server.yaml up -d
```

Use `systemd/claude-trigger-router.service` when you want a Linux service unit. Copy it to `/etc/systemd/system/`, edit the service user and paths, prepare the service user's config, then run:

```bash
systemctl daemon-reload
systemctl enable --now claude-trigger-router
```

Security notes:

- Keep the generated bootstrap `APIKEY` for maintainers only.
- Generate managed `client + read-only` keys for remote clients.
- Put public deployments behind HTTPS reverse proxy or private network access.
- Use `ctr status`, `ctr doctor`, and `/ui` to confirm role, listener, auth state, and remote client connection guidance after deployment.
