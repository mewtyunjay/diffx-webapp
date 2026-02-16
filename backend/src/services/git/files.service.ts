import type { ChangedFile } from "@diffx/contracts";
import { createHash } from "node:crypto";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getRepoContext } from "./repo-context.service.js";
import { getStatusEntries, toChangedFiles } from "./status.service.js";

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function getContentHash(repoRoot: string, relativePath: string): Promise<string> {
  const absolutePath = path.resolve(repoRoot, relativePath);

  try {
    const details = await stat(absolutePath);
    return digest(`${details.size}:${Math.trunc(details.mtimeMs)}`);
  } catch {
    return digest("missing");
  }
}

export async function getChangedFiles(): Promise<ChangedFile[]> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return [];
  }

  const entries = await getStatusEntries(context.repoRoot);
  const changedFiles = toChangedFiles(entries);
  const uniquePaths = [...new Set(changedFiles.map((file) => file.path))].sort((left, right) =>
    left.localeCompare(right),
  );

  const hashedPaths = await Promise.all(
    uniquePaths.map(async (relativePath) => [relativePath, await getContentHash(context.repoRoot, relativePath)] as const),
  );

  const contentHashByPath = new Map(hashedPaths);

  return changedFiles.map((file) => ({
    ...file,
    contentHash: contentHashByPath.get(file.path) ?? digest("unknown"),
  }));
}
