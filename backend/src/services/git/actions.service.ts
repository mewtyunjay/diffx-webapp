import type { ActionResponse } from "@diffx/contracts";
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
