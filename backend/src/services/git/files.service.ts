import type { ChangedFile, ChangedFileStats } from "@diffx/contracts";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_FILE_BYTES } from "../diff/constants.js";
import { execGit, toGitApiError } from "./git-client.js";
import { getRepoContext } from "./repo-context.service.js";
import { getStatusEntries, toChangedFiles, type GitStatusEntry } from "./status.service.js";

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

function parseNumstatCount(raw: string): number | null {
  if (raw === "-") return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function normalizeRepoRelativePath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function normalizeNumstatPath(rawPath: string): string {
  let value = rawPath.trim();

  if (!value) {
    return "";
  }

  if (value.includes("{") && value.includes("=>")) {
    value = value.replace(/\{([^{}]*?) => ([^{}]*?)\}/g, "$2");
  }

  if (value.includes(" => ")) {
    value = value.split(" => ").at(-1) ?? value;
  }

  return normalizeRepoRelativePath(value);
}

function parseNumstat(stdout: string): Map<string, ChangedFileStats> {
  const statsByPath = new Map<string, ChangedFileStats>();

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const columns = line.split("\t");
    if (columns.length < 3) {
      continue;
    }

    const relativePath = normalizeNumstatPath(columns.slice(2).join("\t"));
    if (!relativePath) {
      continue;
    }

    statsByPath.set(relativePath, {
      additions: parseNumstatCount(columns[0]),
      deletions: parseNumstatCount(columns[1]),
    });
  }

  return statsByPath;
}

async function getDiffStatsByPath(
  repoRoot: string,
  scope: "staged" | "unstaged",
): Promise<Map<string, ChangedFileStats>> {
  const args = ["-C", repoRoot, "diff", "--no-color", "--no-ext-diff", "--numstat"];

  if (scope === "staged") {
    args.push("--cached");
  }

  try {
    const result = await execGit(args);
    return parseNumstat(result.stdout);
  } catch (error) {
    throw toGitApiError(error, "Unable to inspect file diff stats.");
  }
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function countTextLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const lines = text.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.length;
}

function listUntrackedPaths(entries: GitStatusEntry[]): string[] {
  return [...new Set(entries.filter((entry) => entry.untracked).map((entry) => entry.path))];
}

function unknownStats(): ChangedFileStats {
  return {
    additions: null,
    deletions: null,
  };
}

async function getUntrackedStatsByPath(
  repoRoot: string,
  entries: GitStatusEntry[],
): Promise<Map<string, ChangedFileStats>> {
  const untrackedPaths = listUntrackedPaths(entries);

  const pairs: Array<[string, ChangedFileStats]> = await Promise.all(
    untrackedPaths.map(async (relativePath) => {
      const absolutePath = path.resolve(repoRoot, relativePath);

      try {
        const details = await stat(absolutePath);

        if (details.size > MAX_FILE_BYTES) {
          return [relativePath, unknownStats()];
        }

        const fileBuffer = await readFile(absolutePath);
        if (isBinaryBuffer(fileBuffer)) {
          return [relativePath, unknownStats()];
        }

        const lineCount = countTextLines(fileBuffer.toString("utf8"));

        return [relativePath, { additions: lineCount, deletions: 0 }];
      } catch {
        return [relativePath, unknownStats()];
      }
    }),
  );

  return new Map<string, ChangedFileStats>(pairs);
}

function pickStatsForFile(
  status: ChangedFile["status"],
  relativePath: string,
  stagedStatsByPath: Map<string, ChangedFileStats>,
  unstagedStatsByPath: Map<string, ChangedFileStats>,
  untrackedStatsByPath: Map<string, ChangedFileStats>,
): ChangedFileStats | null {
  if (status === "staged") {
    return stagedStatsByPath.get(relativePath) ?? null;
  }

  if (status === "untracked") {
    return untrackedStatsByPath.get(relativePath) ?? null;
  }

  return unstagedStatsByPath.get(relativePath) ?? null;
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

  const [hashedPaths, stagedStatsByPath, unstagedStatsByPath, untrackedStatsByPath] = await Promise.all([
    Promise.all(
      uniquePaths.map(
        async (relativePath) =>
          [relativePath, await getContentHash(context.repoRoot, relativePath)] as const,
      ),
    ),
    getDiffStatsByPath(context.repoRoot, "staged"),
    getDiffStatsByPath(context.repoRoot, "unstaged"),
    getUntrackedStatsByPath(context.repoRoot, entries),
  ]);

  const contentHashByPath = new Map(hashedPaths);

  return changedFiles.map((file) => ({
    ...file,
    contentHash: contentHashByPath.get(file.path) ?? digest("unknown"),
    stats: pickStatsForFile(
      file.status,
      file.path,
      stagedStatsByPath,
      unstagedStatsByPath,
      untrackedStatsByPath,
    ),
  }));
}
