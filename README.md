# diffx

DiffX is a local Git diff review UI with quiz-gated commit workflow.

## Development

From repo root:

```bash
bun install
bun run dev:backend
bun run dev:frontend
```

Backend defaults to `http://localhost:3001` and frontend defaults to `http://localhost:5173`.

## Run Commands

Use these from repo root.

Dev mode (recommended while coding):

```bash
bun install
bun run dev:backend
bun run dev:frontend
```

Build both apps:

```bash
bun run build
```

Run the built local executable from this repo:

```bash
bun run start
```

Run executable against a specific repo path:

```bash
bun run start -- /absolute/or/relative/repo/path
```

Useful scripts:

```bash
bun run test
bun run test:backend
bun run test:frontend
bun run build:backend
bun run build:frontend
```

## Runtime Logging

DiffX now ships with metadata-only runtime logging so you can trace what the app is doing in real time.

- Backend logs request lifecycle for `/api/*` calls (method, path, query/body keys, status, duration).
- Backend logs Git command execution metadata (subcommand, flags count, exit code, duration, stdout/stderr byte size).
- Backend logs quiz/provider lifecycle decisions (provider selection, availability checks, quiz session progression).

### Privacy model

Logging is metadata-only:

- No request body values are logged.
- No commit message bodies or quiz prompt text is logged.
- Route errors log typed codes and detail keys, not full payload content.

### Logging env flags

Backend flags:

- `DIFFX_LOG_LEVEL=debug|info|warn|error` (default: `info`)
- `DIFFX_LOG_APP=1|0` (default: `1`)
- `DIFFX_LOG_HTTP=1|0` (default: `1`)
- `DIFFX_LOG_GIT=1|0` (default: `1`)
- `DIFFX_LOG_QUIZ=1|0` (default: `1`)
- `DIFFX_LOG_PROVIDER=1|0` (default: `1`)
- `DIFFX_LOG_FORCE=1|0` (default: `0`; can force logs even in test mode)

Frontend API proxy target (optional):

- `DIFFX_API_PROXY_TARGET=http://localhost:3001` (default shown)

Example:

```bash
DIFFX_LOG_LEVEL=debug DIFFX_LOG_GIT=1 bun run dev:backend
DIFFX_API_PROXY_TARGET=http://localhost:3001 bun run dev:frontend
```

## Quiz Provider Auth (Codex)

DiffX quiz generation uses Codex local auth from your machine.

- Codex auth check: `codex login status`

## Build

```bash
bun run build
```

## Local Executable Distribution

DiffX can be packed as an executable CLI and run from any folder.

### 1) Build + pack tarball

```bash
bun run pack:local
```

This creates a tarball like `diffx-0.1.0.tgz`.

### 2) Install globally from tarball

```bash
npm i -g ./diffx-0.1.0.tgz
```

or

```bash
bun install -g ./diffx-0.1.0.tgz
```

### 3) Run from any folder

```bash
cd /path/to/any/git/repo
diffx
```

Optional arguments:

```bash
diffx [repoPath] --port 3210 --host 127.0.0.1 --no-open
```
