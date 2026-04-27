# Configuration role guide

Use this guide to decide which configuration path belongs to you.

## Local user

Choose this path when Claude Code runs on the same machine as `ctr`.

- Start with `ctr setup`.
- Configure `Models + Router.default`.
- Run `ctr start` or `ctr start --daemon`.
- Check `ctr status`, then run `ctr code`.

This is the default and safest first path.

## Server maintainer

Choose this path when you run `ctr` as a shared remote router service.

- Generate the server profile with `ctr deploy init --target server`.
- Keep the bootstrap `APIKEY` or an admin managed key for maintenance.
- Give remote users managed `client + read-only` keys, not admin/bootstrap keys.
- Put public deployments behind HTTPS reverse proxy or private network access.
- Use `ctr status`, `ctr doctor` and `ctr ui` to check role, listener, auth, quota and health.

Detailed maintainer steps live in `docs/server-maintainer-guide.md`.

## Remote service user

Choose this path when someone else gives you an existing router service.

- Ask for the server base URL.
- Ask for a managed key with both `client` and `read-only` scopes.
- Use `Runtime.remote_service` for connection config and ready/status checks.
- For direct Claude Code access, set `ANTHROPIC_BASE_URL` to the server URL and `ANTHROPIC_API_KEY` to the managed key.

Detailed client steps live in `docs/remote-client-guide.md`.

## Boundary

`Runtime.remote_service` is currently a connection, readiness and registration contract. It does not yet mean local `ctr code` automatically forwards every request through a remote router. For first-time daily use, prefer the local `Models + Router.default` path unless you already have a maintained remote service.
