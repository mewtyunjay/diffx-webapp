# Performance Optimization Worktree Changes

## Worktree setup
- Source repo: `/Users/mrityunjay/dev/projects/diffx-webapp`
- New worktree: `/Users/mrityunjay/dev/projects/diffx-webapp-performance-optimization`
- Branch: `performance-optimization` (Git branch names cannot contain spaces)
- Hidden files copied from source root to this worktree: `.gitignore` (no other root hidden files existed)

## Goal addressed
Improve perceived and actual responsiveness across Git-backed backend endpoints and frontend loading/mutation flows, especially stage/unstage bursts and diff/session UX instability.

## Backend changes

### 1) Status cache window widened + retained in-flight dedupe
- File: `backend/src/services/git/status.service.ts`
- Before:
  - status cache TTL was very short (`150ms`), causing frequent repeated `git status` calls during clustered requests.
- After:
  - status cache TTL increased to `1500ms`.
  - existing in-flight request coalescing remains intact.

### 2) Changed files service now uses short-lived snapshot cache and bounded expensive work
- File: `backend/src/services/git/files.service.ts`
- Before:
  - `/api/files` recomputed expensive stats/hash work every request.
  - staged + unstaged diff numstat was always invoked.
  - untracked file line-counting attempted for all untracked files.
- After:
  - added `changedFilesCache` keyed by repo + status signature with `1000ms` TTL.
  - skip staged numstat when no staged entries; skip unstaged numstat when no unstaged entries.
  - skip untracked stat pass when no untracked entries.
  - cap expensive untracked line-count scanning to first 24 files; overflow entries get `unknown` stats (`null/null`) instead of blocking.
  - added explicit cache invalidator: `invalidateChangedFilesCache`.

### 3) Remote hash computation now cached and coalesced
- File: `backend/src/services/git/revision-hash.service.ts`
- Before:
  - `/api/repo` remote hash path repeatedly executed multiple git commands per request.
- After:
  - added remote hash cache (`5000ms`) keyed by repo + branch.
  - added in-flight dedupe for concurrent remote hash requests.
  - added explicit cache invalidator: `invalidateRemoteHashCache`.

### 4) Repo summary counting optimized to single pass
- File: `backend/src/services/git/repo.service.ts`
- Before:
  - counts were computed by filtering status entries three times.
- After:
  - single-pass count accumulation.

### 5) Action mutations now invalidate all new git-derived caches
- File: `backend/src/services/git/actions.service.ts`
- Before:
  - mutation invalidation only reset repo-context + status caches.
- After:
  - mutation invalidation also clears changed-files cache and remote-hash cache.

## Frontend changes

### 1) Reduced query-churn from stage/unstage operations via debounced reconciliation
- File: `frontend/src/components/layout/AppShell.tsx`
- Before:
  - each mutation immediately invalidated broad keys (repo/files/diff/diffDetail), creating request storms and visible loading churn.
- After:
  - per-file revalidation is queued and debounced (`180ms`) to coalesce bursts.
  - mutation reconciliation now:
    - removes stale per-path diff caches (`["diff", path]`, `diffDetailPath(path)`),
    - invalidates only repo/files once per debounce window.

### 2) File selection stability improved during fetch churn
- File: `frontend/src/components/layout/AppShell.tsx`
- Before:
  - selection fallback could jump to first file during transient list changes/fetch windows.
- After:
  - introduced sticky path preference (`selectedPathPreferenceRef`) and fetch-aware fallback logic to preserve user context longer.

### 3) Query stale windows tuned to reduce unnecessary refetch pressure
- File: `frontend/src/components/layout/AppShell.tsx`
- Before:
  - repo/files/diff detail queries had no stale time tuning in these paths.
- After:
  - `repo`, `files`, and `diffDetail` queries now use `staleTime: 5000`.

### 4) SSE error handling made less sticky
- File: `frontend/src/components/layout/AppShell.tsx`
- Before:
  - stream error remained visible until explicit reset path.
- After:
  - stream error is cleared on next valid stream event for both quiz and code-review streams.

### 5) Sidebar now supports non-blocking refresh UX
- Files:
  - `frontend/src/components/sidebar/SidebarShell.tsx`
  - `frontend/src/components/layout/AppShell.tsx`
- Before:
  - loading semantics were more binary in the sidebar flow.
- After:
  - explicit `isRefreshingFiles` state added.
  - sidebar shows `Refreshing files...` note while still rendering existing file list.
  - initial loading still uses blocking `Loading files...` behavior.

## Test updates

### Added tests
- `backend/src/services/git/revision-hash.service.test.ts`
  - cache reuse
  - cache invalidation
  - concurrent request coalescing

### Updated tests
- `backend/src/services/git/status.service.test.ts`
  - TTL expectations updated for new cache window
  - added concurrent coalescing test
- `backend/src/services/git/files.service.test.ts`
  - added changed-files cache reuse test
  - added untracked stats cap behavior test
- `frontend/src/components/sidebar/SidebarShell.test.tsx`
  - added non-blocking refresh rendering test

## Validation run in this worktree
- `bun install`
- `bun run --cwd backend test` ✅
- `bun run --cwd frontend test` ✅
- `bun run build:backend` ✅
- `bun run build:frontend` ✅

## Changed files list
- `backend/src/services/git/actions.service.ts`
- `backend/src/services/git/files.service.ts`
- `backend/src/services/git/files.service.test.ts`
- `backend/src/services/git/repo.service.ts`
- `backend/src/services/git/revision-hash.service.ts`
- `backend/src/services/git/revision-hash.service.test.ts` (new)
- `backend/src/services/git/status.service.ts`
- `backend/src/services/git/status.service.test.ts`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/sidebar/SidebarShell.tsx`
- `frontend/src/components/sidebar/SidebarShell.test.tsx`
