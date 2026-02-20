import type { ChangedFile, DiffSummaryResponse, QuizSettings } from "@diffx/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDiffSummary } from "../diff/diff-summary.service.js";
import { getChangedFiles } from "../git/files.service.js";
import { buildQuizPromptContext } from "./quiz-prompt.builder.js";

vi.mock("../git/files.service.js", () => ({
  getChangedFiles: vi.fn(),
}));

vi.mock("../diff/diff-summary.service.js", () => ({
  getDiffSummary: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildSettings(overrides?: Partial<QuizSettings>): QuizSettings {
  return {
    gateEnabled: true,
    questionCount: 4,
    scope: "all_changes",
    validationMode: "answer_all",
    scoreThreshold: null,
    providerPreference: "codex",
    ...overrides,
  };
}

function buildSummary(path: string): DiffSummaryResponse {
  return {
    mode: "git",
    file: {
      path,
      oldPath: path,
      newPath: path,
      languageHint: "ts",
      isBinary: false,
      tooLarge: false,
      patch: "@@ -1 +1 @@\n-old\n+new\n",
      stats: {
        additions: 1,
        deletions: 1,
        hunks: 1,
      },
    },
  };
}

describe("buildQuizPromptContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("filters files by quiz scope before building prompt context", async () => {
    const files: ChangedFile[] = [
      {
        path: "backend/src/server.ts",
        status: "staged",
        contentHash: "hash-staged",
        stats: { additions: 1, deletions: 0 },
      },
      {
        path: "frontend/src/App.tsx",
        status: "unstaged",
        contentHash: "hash-unstaged",
        stats: { additions: 2, deletions: 1 },
      },
    ];
    const getChangedFilesMock = vi.mocked(getChangedFiles);
    const getDiffSummaryMock = vi.mocked(getDiffSummary);

    getChangedFilesMock.mockResolvedValue(files);
    getDiffSummaryMock.mockResolvedValue(buildSummary("backend/src/server.ts"));

    const context = await buildQuizPromptContext(buildSettings({ scope: "staged" }));

    expect(context.focusFiles).toEqual(["backend/src/server.ts"]);
    expect(getDiffSummaryMock).toHaveBeenCalledTimes(1);
    expect(getDiffSummaryMock).toHaveBeenCalledWith("backend/src/server.ts", "staged", 2);
  });

  it("requests scoped file summaries in parallel", async () => {
    const files: ChangedFile[] = [
      {
        path: "backend/src/server.ts",
        status: "staged",
        contentHash: "hash-staged",
        stats: { additions: 1, deletions: 0 },
      },
      {
        path: "frontend/src/App.tsx",
        status: "unstaged",
        contentHash: "hash-unstaged",
        stats: { additions: 2, deletions: 1 },
      },
    ];
    const getChangedFilesMock = vi.mocked(getChangedFiles);
    const getDiffSummaryMock = vi.mocked(getDiffSummary);
    const started: string[] = [];
    const firstSummary = createDeferred<DiffSummaryResponse>();

    getChangedFilesMock.mockResolvedValue(files);
    getDiffSummaryMock.mockImplementation(async (path) => {
      started.push(path);

      if (path === "backend/src/server.ts") {
        return await firstSummary.promise;
      }

      return buildSummary("frontend/src/App.tsx");
    });

    const contextPromise = buildQuizPromptContext(buildSettings({ scope: "all_changes" }));

    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual([
      "backend/src/server.ts",
      "frontend/src/App.tsx",
    ]);

    firstSummary.resolve(buildSummary("backend/src/server.ts"));
    const context = await contextPromise;

    expect(context.focusFiles).toEqual([
      "backend/src/server.ts",
      "frontend/src/App.tsx",
    ]);
    expect(context.promptContext).toContain("File: backend/src/server.ts");
    expect(context.promptContext).toContain("File: frontend/src/App.tsx");
  });
});
