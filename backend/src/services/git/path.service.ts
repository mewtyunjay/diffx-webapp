import path from "node:path";
import { ApiRouteError } from "../../domain/api-route-error.js";

export type ResolvedRepoPath = {
  absolutePath: string;
  relativePath: string;
};

export function resolveRepoPath(repoRoot: string, requestedPath: string): ResolvedRepoPath {
  const trimmed = requestedPath.trim();

  if (!trimmed) {
    throw new ApiRouteError(400, "INVALID_PATH", "Path cannot be empty.");
  }

  if (path.isAbsolute(trimmed)) {
    throw new ApiRouteError(400, "INVALID_PATH", "Path must be repository-relative.");
  }

  const normalizedInput = trimmed.replace(/\\/g, "/");
  const absolutePath = path.resolve(repoRoot, normalizedInput);
  const relativePathNative = path.relative(repoRoot, absolutePath);

  if (
    !relativePathNative ||
    relativePathNative.startsWith("..") ||
    path.isAbsolute(relativePathNative)
  ) {
    throw new ApiRouteError(
      400,
      "INVALID_PATH",
      "Path must resolve inside the repository root.",
    );
  }

  const relativePath = relativePathNative.split(path.sep).join("/");

  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    throw new ApiRouteError(400, "INVALID_PATH", "Path cannot point to .git internals.");
  }

  return { absolutePath, relativePath };
}
