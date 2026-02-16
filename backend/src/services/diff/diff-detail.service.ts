import type { DiffDetailResponse, DiffScope } from "@diffx/contracts";
import { getDiffSummary } from "./diff-summary.service.js";
import { getLazyFileContents } from "./file-contents.service.js";

const EMPTY_SIDE: DiffDetailResponse["old"] = {
  file: null,
  isBinary: false,
  tooLarge: false,
  error: false,
};

const ERROR_SIDE: DiffDetailResponse["old"] = {
  file: null,
  isBinary: false,
  tooLarge: false,
  error: true,
};

export async function getDiffDetail(
  requestedPath: string,
  scope: DiffScope,
  contextLines?: number,
): Promise<DiffDetailResponse> {
  const summary = await getDiffSummary(requestedPath, scope, contextLines);

  if (summary.mode === "non-git") {
    return {
      mode: "non-git",
      file: null,
      old: EMPTY_SIDE,
      new: EMPTY_SIDE,
    };
  }

  if (!summary.file || summary.file.isBinary || summary.file.tooLarge || !summary.file.patch) {
    return {
      mode: "git",
      file: summary.file,
      old: EMPTY_SIDE,
      new: EMPTY_SIDE,
    };
  }

  const [oldContentsResult, newContentsResult] = await Promise.allSettled([
    getLazyFileContents(requestedPath, scope, "old"),
    getLazyFileContents(requestedPath, scope, "new"),
  ]);

  const old =
    oldContentsResult.status === "fulfilled"
      ? {
          file: oldContentsResult.value.file,
          isBinary: oldContentsResult.value.isBinary,
          tooLarge: oldContentsResult.value.tooLarge,
          error: false,
        }
      : ERROR_SIDE;

  const newSide =
    newContentsResult.status === "fulfilled"
      ? {
          file: newContentsResult.value.file,
          isBinary: newContentsResult.value.isBinary,
          tooLarge: newContentsResult.value.tooLarge,
          error: false,
        }
      : ERROR_SIDE;

  return {
    mode: "git",
    file: summary.file,
    old,
    new: newSide,
  };
}
