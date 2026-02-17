import type { ActionResponse, PushRequest } from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";
import {
  GitCommandError,
  type GitExecResult,
  execGit,
  toGitApiError,
} from "./git-client.js";
import { resolveRepoPath } from "./path.service.js";
import { requireGitContext } from "./repo-context.service.js";

let mutationQueue: Promise<void> = Promise.resolve();

async function withMutationQueue<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = mutationQueue.then(operation);
  mutationQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );
  return await nextOperation;
}

function isNoUpstreamError(error: GitCommandError): boolean {
  const stderr = error.stderr.toLowerCase();
  return stderr.includes("has no upstream branch") || stderr.includes("no upstream configured");
}

function firstGitOutputLine(result: GitExecResult): string | null {
  return [result.stdout, result.stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null;
}

function resolveUniqueRelativePaths(repoRoot: string, requestedPaths: string[]): string[] {
  const uniquePaths = new Set<string>();

  for (const requestedPath of requestedPaths) {
    const resolvedPath = resolveRepoPath(repoRoot, requestedPath);
    uniquePaths.add(resolvedPath.relativePath);
  }

  return [...uniquePaths];
}

export async function stageFile(requestedPath: string): Promise<ActionResponse> {
  const context = await requireGitContext();
  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);

  return await withMutationQueue(async () => {
    try {
      await execGit(["-C", context.repoRoot, "add", "--", resolvedPath.relativePath]);
      return {
        ok: true,
        message: `Staged ${resolvedPath.relativePath}`,
      };
    } catch (error) {
      throw toGitApiError(error, "Unable to stage file.", 409);
    }
  });
}

export async function stageManyFiles(requestedPaths: string[]): Promise<ActionResponse> {
  const context = await requireGitContext();
  const relativePaths = resolveUniqueRelativePaths(context.repoRoot, requestedPaths);

  if (relativePaths.length === 0) {
    throw new ApiRouteError(400, "INVALID_PATH", "At least one file path is required.");
  }

  return await withMutationQueue(async () => {
    try {
      await execGit(["-C", context.repoRoot, "add", "--", ...relativePaths]);
      const fileLabel = relativePaths.length === 1 ? "file" : "files";

      return {
        ok: true,
        message: `Staged ${relativePaths.length} ${fileLabel}.`,
      };
    } catch (error) {
      throw toGitApiError(error, "Unable to stage files.", 409);
    }
  });
}

export async function unstageFile(requestedPath: string): Promise<ActionResponse> {
  const context = await requireGitContext();
  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);

  return await withMutationQueue(async () => {
    try {
      await execGit([
        "-C",
        context.repoRoot,
        "restore",
        "--staged",
        "--",
        resolvedPath.relativePath,
      ]);
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw toGitApiError(error, "Unable to unstage file.", 409);
      }

      try {
        await execGit([
          "-C",
          context.repoRoot,
          "reset",
          "HEAD",
          "--",
          resolvedPath.relativePath,
        ]);
      } catch (fallbackError) {
        throw toGitApiError(fallbackError, "Unable to unstage file.", 409);
      }
    }

    return {
      ok: true,
      message: `Unstaged ${resolvedPath.relativePath}`,
    };
  });
}

export async function unstageManyFiles(requestedPaths: string[]): Promise<ActionResponse> {
  const context = await requireGitContext();
  const relativePaths = resolveUniqueRelativePaths(context.repoRoot, requestedPaths);

  if (relativePaths.length === 0) {
    throw new ApiRouteError(400, "INVALID_PATH", "At least one file path is required.");
  }

  return await withMutationQueue(async () => {
    try {
      await execGit([
        "-C",
        context.repoRoot,
        "restore",
        "--staged",
        "--",
        ...relativePaths,
      ]);
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw toGitApiError(error, "Unable to unstage files.", 409);
      }

      try {
        await execGit([
          "-C",
          context.repoRoot,
          "reset",
          "HEAD",
          "--",
          ...relativePaths,
        ]);
      } catch (fallbackError) {
        throw toGitApiError(fallbackError, "Unable to unstage files.", 409);
      }
    }

    const fileLabel = relativePaths.length === 1 ? "file" : "files";

    return {
      ok: true,
      message: `Unstaged ${relativePaths.length} ${fileLabel}.`,
    };
  });
}

export async function commitChanges(messageInput: string): Promise<ActionResponse> {
  const message = messageInput.trim();

  if (!message) {
    throw new ApiRouteError(
      400,
      "INVALID_COMMIT_MESSAGE",
      "Commit message must not be empty.",
    );
  }

  const context = await requireGitContext();

  return await withMutationQueue(async () => {
    let result: GitExecResult;

    try {
      result = await execGit(
        ["-C", context.repoRoot, "commit", "-m", message],
        { allowExitCodes: [0, 1] },
      );
    } catch (error) {
      throw toGitApiError(error, "Unable to create commit.", 409);
    }

    if (result.exitCode !== 0) {
      throw new ApiRouteError(409, "GIT_COMMAND_FAILED", "Unable to create commit.", {
        stderr: result.stderr.trim() || null,
        stdout: result.stdout.trim() || null,
        exitCode: result.exitCode,
      });
    }

    const firstLine = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    return {
      ok: true,
      message: firstLine ?? "Commit created.",
    };
  });
}

export async function pushChanges(request: PushRequest = {}): Promise<ActionResponse> {
  const context = await requireGitContext();
  const createUpstream = request.createUpstream === true;

  return await withMutationQueue(async () => {
    try {
      const pushArgs = createUpstream
        ? [
            "-C",
            context.repoRoot,
            "push",
            "--set-upstream",
            "origin",
            context.branch ?? "",
          ]
        : ["-C", context.repoRoot, "push"];

      if (createUpstream && !context.branch) {
        throw new ApiRouteError(
          409,
          "GIT_COMMAND_FAILED",
          "Cannot create upstream from detached HEAD.",
        );
      }

      const result = await execGit(pushArgs);
      const line = firstGitOutputLine(result);

      return {
        ok: true,
        message: line ?? (createUpstream ? "Upstream created and pushed." : "Push completed."),
      };
    } catch (error) {
      if (error instanceof GitCommandError && isNoUpstreamError(error)) {
        const branchName = context.branch ?? "current branch";
        throw new ApiRouteError(
          409,
          "NO_UPSTREAM",
          `No upstream exists for '${branchName}'. Should I create one with the same name?`,
          {
            branch: context.branch,
            createUpstreamHint: context.branch ? `git push --set-upstream origin ${context.branch}` : null,
          },
        );
      }

      throw toGitApiError(error, "Unable to push changes.", 409);
    }
  });
}
