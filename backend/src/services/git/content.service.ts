import { readFile } from "node:fs/promises";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { execGit, toGitApiError } from "./git-client.js";
import type { ResolvedRepoPath } from "./path.service.js";

export type GitFileSource = "head" | "index" | "working-tree";

async function readBlob(repoRoot: string, revisionSpec: string): Promise<Buffer | null> {
  try {
    const result = await execGit(["-C", repoRoot, "show", revisionSpec], {
      allowExitCodes: [0, 128],
    });

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdoutBuffer;
  } catch (error) {
    throw toGitApiError(error, "Unable to read Git blob contents.");
  }
}

export async function getFileBufferBySource(
  repoRoot: string,
  resolvedPath: ResolvedRepoPath,
  source: GitFileSource,
): Promise<Buffer | null> {
  switch (source) {
    case "head":
      return await readBlob(repoRoot, `HEAD:${resolvedPath.relativePath}`);
    case "index":
      return await readBlob(repoRoot, `:${resolvedPath.relativePath}`);
    case "working-tree":
      try {
        return await readFile(resolvedPath.absolutePath);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }

        throw new ApiRouteError(500, "INTERNAL_ERROR", "Unable to read working tree file.");
      }
  }
}
