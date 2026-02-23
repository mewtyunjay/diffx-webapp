import type { ChangedFileStatus } from "@diffx/contracts";
import { execGit, toGitApiError } from "./git-client.js";

export type GitStatusEntry = {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type ChangedFileIdentity = {
  path: string;
  status: ChangedFileStatus;
};

type StatusCacheEntry = {
  value: GitStatusEntry[];
  expiresAt: number;
};

const STATUS_ENTRIES_CACHE_TTL_MS = 150;
const statusEntriesCache = new Map<string, StatusCacheEntry>();
const inFlightStatusEntriesRequests = new Map<string, Promise<GitStatusEntry[]>>();

const STATUS_PRIORITY: Record<ChangedFileStatus, number> = {
  staged: 0,
  unstaged: 1,
  untracked: 2,
};

function unescapeQuotedGitPath(raw: string): string {
  if (!(raw.startsWith('"') && raw.endsWith('"'))) return raw;

  const body = raw.slice(1, -1);
  return body
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n");
}

function normalizeRepoRelativePath(rawPath: string): string {
  return unescapeQuotedGitPath(rawPath.trim())
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function parsePathFromStatusLine(pathChunk: string): string {
  const renameIndex = pathChunk.lastIndexOf(" -> ");
  const normalized = renameIndex >= 0 ? pathChunk.slice(renameIndex + 4) : pathChunk;
  return normalizeRepoRelativePath(normalized);
}

function parseStatusEntries(stdout: string): GitStatusEntry[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3);

  const entriesByPath = new Map<string, GitStatusEntry>();

  for (const line of lines) {
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    const pathChunk = line.slice(3);
    const relativePath = parsePathFromStatusLine(pathChunk);

    if (!relativePath) continue;
    if (x === "!" && y === "!") continue;

    const existing = entriesByPath.get(relativePath) ?? {
      path: relativePath,
      staged: false,
      unstaged: false,
      untracked: false,
    };

    if (x === "?" && y === "?") {
      existing.untracked = true;
    } else {
      if (x !== " " && x !== "?") existing.staged = true;
      if (y !== " " && y !== "?") existing.unstaged = true;
    }

    entriesByPath.set(relativePath, existing);
  }

  return [...entriesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export async function getStatusEntries(repoRoot: string): Promise<GitStatusEntry[]> {
  const now = Date.now();
  const cached = statusEntriesCache.get(repoRoot);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = inFlightStatusEntriesRequests.get(repoRoot);
  if (inFlight) {
    return await inFlight;
  }

  const pendingRequest = (async () => {
    try {
      const result = await execGit([
        "-C",
        repoRoot,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]);
      const value = parseStatusEntries(result.stdout);

      statusEntriesCache.set(repoRoot, {
        value,
        expiresAt: Date.now() + STATUS_ENTRIES_CACHE_TTL_MS,
      });

      return value;
    } catch (error) {
      throw toGitApiError(error, "Unable to inspect Git status.");
    } finally {
      inFlightStatusEntriesRequests.delete(repoRoot);
    }
  })();

  inFlightStatusEntriesRequests.set(repoRoot, pendingRequest);
  return await pendingRequest;
}

export function invalidateStatusEntriesCache(repoRoot?: string): void {
  if (typeof repoRoot === "string" && repoRoot.length > 0) {
    statusEntriesCache.delete(repoRoot);
    inFlightStatusEntriesRequests.delete(repoRoot);
    return;
  }

  statusEntriesCache.clear();
  inFlightStatusEntriesRequests.clear();
}

export function getStatusEntryMap(entries: GitStatusEntry[]): Map<string, GitStatusEntry> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

export function toChangedFiles(entries: GitStatusEntry[]): ChangedFileIdentity[] {
  const changedFiles: ChangedFileIdentity[] = [];

  for (const entry of entries) {
    if (entry.staged) {
      changedFiles.push({ path: entry.path, status: "staged" });
    }

    if (entry.unstaged) {
      changedFiles.push({ path: entry.path, status: "unstaged" });
    }

    if (entry.untracked) {
      changedFiles.push({ path: entry.path, status: "untracked" });
    }
  }

  return changedFiles.sort((left, right) => {
    const statusDelta = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
    if (statusDelta !== 0) return statusDelta;
    return left.path.localeCompare(right.path);
  });
}
