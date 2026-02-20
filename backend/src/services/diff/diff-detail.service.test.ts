import type { DiffSummaryResponse, FileContentsResponse } from "@diffx/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDiffDetail } from "./diff-detail.service.js";
import { getDiffSummary } from "./diff-summary.service.js";
import { getLazyFileContents } from "./file-contents.service.js";

vi.mock("./diff-summary.service.js", () => ({
  getDiffSummary: vi.fn(),
}));

vi.mock("./file-contents.service.js", () => ({
  getLazyFileContents: vi.fn(),
}));

function buildGitSummary(): DiffSummaryResponse {
  return {
    mode: "git",
    file: {
      path: "frontend/src/new-name.ts",
      oldPath: "frontend/src/old-name.ts",
      newPath: "frontend/src/new-name.ts",
      languageHint: "ts",
      isBinary: false,
      tooLarge: false,
      patch: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')\n",
      stats: {
        additions: 1,
        deletions: 1,
        hunks: 1,
      },
    },
  };
}

function buildContents(path: string, side: "old" | "new"): FileContentsResponse {
  return {
    mode: "git",
    side,
    file: {
      name: path,
      contents: side === "old" ? "console.log('old')" : "console.log('new')",
    },
    isBinary: false,
    tooLarge: false,
    languageHint: "ts",
  };
}

describe("getDiffDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads old/new content from rename-aware paths", async () => {
    const getDiffSummaryMock = vi.mocked(getDiffSummary);
    const getLazyFileContentsMock = vi.mocked(getLazyFileContents);

    getDiffSummaryMock.mockResolvedValue(buildGitSummary());
    getLazyFileContentsMock
      .mockResolvedValueOnce(buildContents("frontend/src/old-name.ts", "old"))
      .mockResolvedValueOnce(buildContents("frontend/src/new-name.ts", "new"));

    const detail = await getDiffDetail("frontend/src/new-name.ts", "staged", 3);

    expect(getLazyFileContentsMock).toHaveBeenNthCalledWith(
      1,
      "frontend/src/old-name.ts",
      "staged",
      "old",
    );
    expect(getLazyFileContentsMock).toHaveBeenNthCalledWith(
      2,
      "frontend/src/new-name.ts",
      "staged",
      "new",
    );
    expect(detail.old.file?.name).toBe("frontend/src/old-name.ts");
    expect(detail.new.file?.name).toBe("frontend/src/new-name.ts");
  });
});
