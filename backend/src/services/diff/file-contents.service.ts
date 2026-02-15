import path from "node:path";
import type { DiffScope, DiffSide, FileContentsResponse } from "@diffx/contracts";
import { MAX_FILE_BYTES } from "./constants.js";
import {
  getFileBufferBySource,
  type GitFileSource,
} from "../git/content.service.js";
import { resolveRepoPath } from "../git/path.service.js";
import { getRepoContext } from "../git/repo-context.service.js";
import {
  getStatusEntries,
  getStatusEntryMap,
  type GitStatusEntry,
} from "../git/status.service.js";

function pickContentSource(
  scope: DiffScope,
  side: DiffSide,
  statusEntry: GitStatusEntry | undefined,
): GitFileSource | null {
  if (scope === "staged") {
    return side === "old" ? "head" : "index";
  }

  if (side === "old") {
    return statusEntry?.untracked ? null : "index";
  }

  return "working-tree";
}

function getLanguageHint(filePath: string): string | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension.length > 0 ? extension : null;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}

export async function getLazyFileContents(
  requestedPath: string,
  scope: DiffScope,
  side: DiffSide,
): Promise<FileContentsResponse> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return {
      mode: "non-git",
      side,
      file: null,
      isBinary: false,
      tooLarge: false,
      languageHint: null,
    };
  }

  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);
  const statusEntries = await getStatusEntries(context.repoRoot);
  const statusEntry = getStatusEntryMap(statusEntries).get(resolvedPath.relativePath);
  const languageHint = getLanguageHint(resolvedPath.relativePath);

  const contentSource = pickContentSource(scope, side, statusEntry);
  if (contentSource === null) {
    return {
      mode: "git",
      side,
      file: null,
      isBinary: false,
      tooLarge: false,
      languageHint,
    };
  }

  const fileBuffer = await getFileBufferBySource(
    context.repoRoot,
    resolvedPath,
    contentSource,
  );

  if (fileBuffer === null) {
    return {
      mode: "git",
      side,
      file: null,
      isBinary: false,
      tooLarge: false,
      languageHint,
    };
  }

  if (isBinaryBuffer(fileBuffer)) {
    return {
      mode: "git",
      side,
      file: null,
      isBinary: true,
      tooLarge: false,
      languageHint,
    };
  }

  if (fileBuffer.byteLength > MAX_FILE_BYTES) {
    return {
      mode: "git",
      side,
      file: null,
      isBinary: false,
      tooLarge: true,
      languageHint,
    };
  }

  return {
    mode: "git",
    side,
    file: {
      name: resolvedPath.relativePath,
      contents: fileBuffer.toString("utf8"),
    },
    isBinary: false,
    tooLarge: false,
    languageHint,
  };
}
