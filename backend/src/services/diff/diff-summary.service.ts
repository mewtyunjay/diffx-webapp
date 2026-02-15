import path from "node:path";
import { getSingularPatch, type FileDiffMetadata } from "@pierre/diffs";
import type { DiffScope, DiffSummaryResponse, FileDiff } from "@diffx/contracts";
import {
  DEFAULT_CONTEXT_LINES,
  MAX_CONTEXT_LINES,
  MAX_PATCH_BYTES,
} from "./constants.js";
import { resolveRepoPath } from "../git/path.service.js";
import { getPatchForPath } from "../git/patch.service.js";
import { getRepoContext } from "../git/repo-context.service.js";
import {
  getStatusEntries,
  getStatusEntryMap,
} from "../git/status.service.js";

type PatchPaths = {
  oldPath: string | null;
  newPath: string | null;
};

function normalizeContextLines(contextLines: number | undefined): number {
  if (contextLines === undefined) return DEFAULT_CONTEXT_LINES;
  if (!Number.isFinite(contextLines)) return DEFAULT_CONTEXT_LINES;

  const value = Math.trunc(contextLines);
  if (value < 0) return 0;
  if (value > MAX_CONTEXT_LINES) return MAX_CONTEXT_LINES;
  return value;
}

function sanitizePatchPath(rawPath: string | undefined): string | null {
  if (!rawPath) return null;

  let value = rawPath.trim();
  if (!value) return null;
  if (value === "dev/null" || value === "/dev/null") return null;
  if (value.startsWith("a/") || value.startsWith("b/")) {
    value = value.slice(2);
  }

  return value;
}

function extractPatchPaths(patch: string): PatchPaths {
  const header = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (!header) {
    return { oldPath: null, newPath: null };
  }

  return {
    oldPath: sanitizePatchPath(header[1]),
    newPath: sanitizePatchPath(header[2]),
  };
}

function buildPathsFromMetadata(metadata: FileDiffMetadata, fallbackPath: string): {
  path: string;
  oldPath: string | null;
  newPath: string | null;
} {
  const name = sanitizePatchPath(metadata.name) ?? fallbackPath;
  const prevName = sanitizePatchPath(metadata.prevName);

  switch (metadata.type) {
    case "new":
      return { path: name, oldPath: null, newPath: name };
    case "deleted":
      return { path: name, oldPath: prevName ?? name, newPath: null };
    case "rename-pure":
    case "rename-changed":
      return { path: name, oldPath: prevName ?? name, newPath: name };
    default:
      return { path: name, oldPath: prevName ?? name, newPath: name };
  }
}

function buildFallbackPaths(relativePath: string, patch: string): {
  path: string;
  oldPath: string | null;
  newPath: string | null;
} {
  const fromHeader = extractPatchPaths(patch);
  const canonical = fromHeader.newPath ?? fromHeader.oldPath ?? relativePath;

  return {
    path: canonical,
    oldPath: fromHeader.oldPath,
    newPath: fromHeader.newPath,
  };
}

function getLanguageHint(filePath: string): string | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension.length > 0 ? extension : null;
}

function isBinaryPatch(patch: string): boolean {
  return /^Binary files /m.test(patch) || /GIT binary patch/m.test(patch);
}

function summarizeMetadata(metadata: FileDiffMetadata): {
  additions: number;
  deletions: number;
  hunks: number;
} {
  return {
    additions: metadata.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
    deletions: metadata.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
    hunks: metadata.hunks.length,
  };
}

function summarizePatchText(patch: string): { additions: number; deletions: number; hunks: number } {
  const lines = patch.split("\n");
  let additions = 0;
  let deletions = 0;
  let hunks = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) hunks += 1;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions, hunks };
}

export async function getDiffSummary(
  requestedPath: string,
  scope: DiffScope,
  contextLines?: number,
): Promise<DiffSummaryResponse> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return { mode: "non-git", file: null };
  }

  const normalizedContextLines = normalizeContextLines(contextLines);
  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);
  const statusEntries = await getStatusEntries(context.repoRoot);
  const statusEntry = getStatusEntryMap(statusEntries).get(resolvedPath.relativePath);

  const patch = await getPatchForPath(
    context.repoRoot,
    resolvedPath.relativePath,
    scope,
    normalizedContextLines,
    statusEntry,
  );

  if (patch.trim().length === 0) {
    return {
      mode: "git",
      file: null,
    };
  }

  const fallbackPaths = buildFallbackPaths(resolvedPath.relativePath, patch);
  const binaryPatch = isBinaryPatch(patch);
  const tooLargePatch = Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES;

  if (binaryPatch || tooLargePatch) {
    const file: FileDiff = {
      path: fallbackPaths.path,
      oldPath: fallbackPaths.oldPath,
      newPath: fallbackPaths.newPath,
      languageHint: getLanguageHint(fallbackPaths.path),
      isBinary: binaryPatch,
      tooLarge: tooLargePatch,
      patch: null,
      stats: {
        additions: 0,
        deletions: 0,
        hunks: 0,
      },
    };

    return {
      mode: "git",
      file,
    };
  }

  try {
    const metadata = getSingularPatch(patch);
    const mappedPaths = buildPathsFromMetadata(metadata, resolvedPath.relativePath);
    const stats = summarizeMetadata(metadata);

    const file: FileDiff = {
      path: mappedPaths.path,
      oldPath: mappedPaths.oldPath,
      newPath: mappedPaths.newPath,
      languageHint: getLanguageHint(mappedPaths.path),
      isBinary: false,
      tooLarge: false,
      patch,
      stats,
    };

    return {
      mode: "git",
      file,
    };
  } catch {
    const stats = summarizePatchText(patch);
    const file: FileDiff = {
      path: fallbackPaths.path,
      oldPath: fallbackPaths.oldPath,
      newPath: fallbackPaths.newPath,
      languageHint: getLanguageHint(fallbackPaths.path),
      isBinary: false,
      tooLarge: false,
      patch,
      stats,
    };

    return {
      mode: "git",
      file,
    };
  }
}
