import path from "node:path";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { GitCommandError, execGit, toGitApiError } from "./git-client.js";

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

function toRepoName(repoRoot: string): string {
  const normalized = repoRoot.replace(/[\\/]+$/, "");
  const name = path.basename(normalized);
  return name.length > 0 ? name : "repository";
}

function isNotGitRepositoryError(error: GitCommandError): boolean {
  const text = `${error.stderr}\n${error.stdout}`.toLowerCase();
  return text.includes("not a git repository");
}

export async function getRepoContext(): Promise<RepoContext> {
  const configuredRoot = process.env.DIFFX_REPO_ROOT?.trim();
  const candidateRoot = configuredRoot ? path.resolve(configuredRoot) : process.cwd();

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

export async function requireGitContext(): Promise<GitRepoContext> {
  const context = await getRepoContext();
  if (context.mode !== "git") {
    throw new ApiRouteError(409, "NOT_GIT_REPO", "Current directory is not a Git repository.");
  }
  return context;
}
