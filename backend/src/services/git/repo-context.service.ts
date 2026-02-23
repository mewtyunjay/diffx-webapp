import path from "node:path";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { GitCommandError, execGit, toGitApiError } from "./git-client.js";
import { getWorkspaceState } from "../workspace.service.js";

export type GitRepoContext = {
  mode: "git";
  repoRoot: string;
  repoName: string;
  branch: string | null;
};

type NonGitContext = {
  mode: "non-git";
  repoRoot: string;
  repoName: string;
  branch: null;
};

type RepoContext = GitRepoContext | NonGitContext;
type RepoContextCacheEntry = {
  value: RepoContext;
  expiresAt: number;
};

const REPO_CONTEXT_CACHE_TTL_MS = 150;
const repoContextCache = new Map<string, RepoContextCacheEntry>();
const inFlightRepoContextRequests = new Map<string, Promise<RepoContext>>();

function toRepoName(repoRoot: string): string {
  const normalized = repoRoot.replace(/[\\/]+$/, "");
  const name = path.basename(normalized);
  return name.length > 0 ? name : "repository";
}

function isNotGitRepositoryError(error: GitCommandError): boolean {
  const text = `${error.stderr}\n${error.stdout}`.toLowerCase();
  return text.includes("not a git repository");
}

async function loadRepoContext(candidateRoot: string): Promise<RepoContext> {
  let repoRoot = candidateRoot;

  try {
    const result = await execGit(["-C", candidateRoot, "rev-parse", "--show-toplevel"]);
    repoRoot = result.stdout.trim();
  } catch (error) {
    if (error instanceof GitCommandError && isNotGitRepositoryError(error)) {
      return {
        mode: "non-git",
        repoRoot: candidateRoot,
        repoName: toRepoName(candidateRoot),
        branch: null,
      };
    }

    throw toGitApiError(error, "Unable to inspect repository root.");
  }

  try {
    const branchResult = await execGit(
      ["-C", repoRoot, "symbolic-ref", "--quiet", "--short", "HEAD"],
      { allowExitCodes: [0, 1] },
    );

    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() || null : null;

    return {
      mode: "git",
      repoRoot,
      repoName: toRepoName(repoRoot),
      branch,
    };
  } catch (error) {
    throw toGitApiError(error, "Unable to inspect repository branch.");
  }
}

export function invalidateRepoContextCache(candidateRoot?: string): void {
  if (typeof candidateRoot === "string" && candidateRoot.length > 0) {
    repoContextCache.delete(candidateRoot);
    inFlightRepoContextRequests.delete(candidateRoot);
    return;
  }

  repoContextCache.clear();
  inFlightRepoContextRequests.clear();
}

export async function getRepoContext(): Promise<RepoContext> {
  const candidateRoot = getWorkspaceState().repoRoot;
  const now = Date.now();
  const cached = repoContextCache.get(candidateRoot);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = inFlightRepoContextRequests.get(candidateRoot);
  if (inFlight) {
    return await inFlight;
  }

  const pendingRequest = loadRepoContext(candidateRoot)
    .then((value) => {
      repoContextCache.set(candidateRoot, {
        value,
        expiresAt: Date.now() + REPO_CONTEXT_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      inFlightRepoContextRequests.delete(candidateRoot);
    });

  inFlightRepoContextRequests.set(candidateRoot, pendingRequest);
  return await pendingRequest;
}

export async function requireGitContext(): Promise<GitRepoContext> {
  const context = await getRepoContext();
  if (context.mode !== "git") {
    throw new ApiRouteError(409, "NOT_GIT_REPO", "Current directory is not a Git repository.");
  }
  return context;
}
