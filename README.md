# diffx

DiffX is a local Git diff review UI with quiz-gated commit workflow.

## Development

From repo root:

```bash
bun install
bun run dev:backend
bun run dev:frontend
```

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
