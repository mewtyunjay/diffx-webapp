# diffx

DiffX is a local Git diff review UI with quiz-gated commit workflow.

## Monorepo layout

- `frontend/` React + Vite UI
- `backend/` Express + TypeScript API and CLI runtime
- `shared/contracts/` shared API/domain types

## Prerequisites

- Bun
- Node.js

## Quick start (development)

Run from repo root:

```bash
bun install
bun run dev:backend
bun run dev:frontend
```

Defaults:

- backend API: `http://localhost:3001`
- frontend app: `http://localhost:5173`

## Build and test

From repo root:

```bash
bun run test
bun run build
```

Useful targeted scripts:

```bash
bun run test:backend
bun run test:frontend
bun run build:backend
bun run build:frontend
```

## CLI usage (built app)

The root `start` script runs the built executable entrypoint:

```bash
bun run start
```

Target a specific repository:

```bash
bun run start -- /absolute/or/relative/repo/path
```

Show CLI help:

```bash
bun run start -- --help
```

CLI flags:

- `--port` / `-p` (default: `3210`)
- `--host` (default: `127.0.0.1`)
- `--no-open` (disable browser auto-open)

## Environment and logging

### Backend logging

Logging is metadata-only:

- request lifecycle for `/api/*`
- Git command lifecycle metadata
- quiz/provider lifecycle metadata
- typed route error metadata

No request bodies, commit message text, or full quiz prompt payloads are logged.

Backend logging env vars:

- `DIFFX_LOG_LEVEL=debug|info|warn|error`
- `DIFFX_LOG_APP=1|0`
- `DIFFX_LOG_HTTP=1|0`
- `DIFFX_LOG_GIT=1|0`
- `DIFFX_LOG_QUIZ=1|0`
- `DIFFX_LOG_PROVIDER=1|0`
- `DIFFX_LOG_FORCE=1|0`

### Frontend API proxy

- `DIFFX_API_PROXY_TARGET=http://localhost:3001` (optional; defaults to this value)

### Workspace root

- `DIFFX_REPO_ROOT=/path/to/repo` (optional startup workspace root)

### Quiz provider config (Codex)

- `DIFFX_QUIZ_PROVIDER=codex`
- `DIFFX_QUIZ_CODEX_MODEL=<model>`
- `DIFFX_QUIZ_CODEX_REASONING_EFFORT=minimal|low|medium|high|xhigh`

Optional local auth check:

```bash
codex login status
```

## Local executable packaging

Build and pack:

```bash
bun run pack:local
```

Install tarball globally:

```bash
npm i -g ./diffx-0.1.0.tgz
```

or

```bash
bun install -g ./diffx-0.1.0.tgz
```

Then run from any repo folder:

```bash
diffx
```

## Troubleshooting

- If `bun run start` fails with missing build artifacts, run `bun run build` first.
- If frontend cannot reach backend, set `DIFFX_API_PROXY_TARGET` before starting Vite.
- Native folder picker is macOS-only; use manual path entry on other platforms.

## Workspace README files

- `frontend/README.md`
- `backend/README.md`
