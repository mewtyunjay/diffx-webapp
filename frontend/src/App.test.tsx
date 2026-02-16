import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResponse } from "@diffx/contracts";
import App from "./App";
import { commitChanges, stageFile, unstageFile } from "./services/api/actions";
import { getDiffSummary } from "./services/api/diff";
import { getLazyFileContents } from "./services/api/file-contents";
import { getChangedFiles } from "./services/api/files";
import { getHealth } from "./services/api/health";
import { getRepoSummary } from "./services/api/repo";

vi.mock("./services/api/repo", () => ({
  getRepoSummary: vi.fn(),
}));

vi.mock("./services/api/files", () => ({
  getChangedFiles: vi.fn(),
}));

vi.mock("./services/api/diff", () => ({
  getDiffSummary: vi.fn(),
}));

vi.mock("./services/api/file-contents", () => ({
  getLazyFileContents: vi.fn(),
}));

vi.mock("./services/api/health", () => ({
  getHealth: vi.fn(),
}));

vi.mock("./services/api/actions", () => ({
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  commitChanges: vi.fn(),
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

describe("App", () => {
  const getRepoSummaryMock = vi.mocked(getRepoSummary);
  const getChangedFilesMock = vi.mocked(getChangedFiles);
  const getDiffSummaryMock = vi.mocked(getDiffSummary);
  const getLazyFileContentsMock = vi.mocked(getLazyFileContents);
  const getHealthMock = vi.mocked(getHealth);
  const stageFileMock = vi.mocked(stageFile);
  const unstageFileMock = vi.mocked(unstageFile);
  const commitChangesMock = vi.mocked(commitChanges);

  beforeEach(() => {
    vi.resetAllMocks();
    stageFileMock.mockResolvedValue({ ok: true, message: "Staged file" });
    unstageFileMock.mockResolvedValue({ ok: true, message: "Unstaged file" });
    commitChangesMock.mockResolvedValue({ ok: true, message: "Committed" });
  });

  afterEach(() => {
    cleanup();
  });

  function renderWithQueryClient() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
  }

  it("renders non-git gate when repository mode is non-git", async () => {
    getRepoSummaryMock.mockResolvedValue({
      mode: "non-git",
      repoName: "scratch-folder",
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
    });

    renderWithQueryClient();

    expect(await screen.findByText("Not a Git repository")).toBeInTheDocument();
  });

  it("renders app shell with topbar and tabs in git mode", async () => {
    getRepoSummaryMock.mockResolvedValue({
      mode: "git",
      repoName: "diffx-webapp",
      branch: "main",
      stagedCount: 1,
      unstagedCount: 2,
      untrackedCount: 0,
    });

    getChangedFilesMock.mockResolvedValue([
      { path: "backend/src/app.ts", status: "unstaged" },
    ]);

    getDiffSummaryMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "backend/src/app.ts",
        oldPath: "backend/src/app.ts",
        newPath: "backend/src/app.ts",
        languageHint: "ts",
        isBinary: false,
        tooLarge: false,
        patch: [
          "diff --git a/backend/src/app.ts b/backend/src/app.ts",
          "index 1111111..2222222 100644",
          "--- a/backend/src/app.ts",
          "+++ b/backend/src/app.ts",
          "@@ -1 +1 @@",
          "-const app = oldValue",
          "+const app = newValue",
          "",
        ].join("\n"),
        stats: {
          additions: 1,
          deletions: 1,
          hunks: 1,
        },
      },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    getLazyFileContentsMock.mockImplementation(async ({ path, side }) => ({
      mode: "git",
      side,
      file: {
        name: path,
        contents: side === "old" ? "const app = oldValue" : "const app = newValue",
      },
      isBinary: false,
      tooLarge: false,
      languageHint: "ts",
    }));

    renderWithQueryClient();

    expect(await screen.findByText("diffx-webapp")).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "app.ts" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "split" })).toBeInTheDocument();
  });

  it("optimistically flips unstaged file to staged in files tab", async () => {
    getRepoSummaryMock.mockResolvedValue({
      mode: "git",
      repoName: "diffx-webapp",
      branch: "main",
      stagedCount: 0,
      unstagedCount: 1,
      untrackedCount: 0,
    });

    getChangedFilesMock
      .mockResolvedValueOnce([{ path: "backend/src/app.ts", status: "unstaged" }])
      .mockResolvedValue([{ path: "backend/src/app.ts", status: "staged" }]);

    getDiffSummaryMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "backend/src/app.ts",
        oldPath: "backend/src/app.ts",
        newPath: "backend/src/app.ts",
        languageHint: "ts",
        isBinary: false,
        tooLarge: false,
        patch: [
          "diff --git a/backend/src/app.ts b/backend/src/app.ts",
          "index 1111111..2222222 100644",
          "--- a/backend/src/app.ts",
          "+++ b/backend/src/app.ts",
          "@@ -1 +1 @@",
          "-const app = oldValue",
          "+const app = newValue",
          "",
        ].join("\n"),
        stats: {
          additions: 1,
          deletions: 1,
          hunks: 1,
        },
      },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    getLazyFileContentsMock.mockImplementation(async ({ path, side }) => ({
      mode: "git",
      side,
      file: {
        name: path,
        contents: side === "old" ? "const app = oldValue" : "const app = newValue",
      },
      isBinary: false,
      tooLarge: false,
      languageHint: "ts",
    }));

    const deferred = createDeferred<ActionResponse>();
    stageFileMock.mockReturnValueOnce(deferred.promise);

    renderWithQueryClient();

    const stageButton = await screen.findByRole("button", { name: "stage backend/src/app.ts" });
    fireEvent.click(stageButton);

    await waitFor(() => {
      expect(stageFileMock).toHaveBeenCalledWith({ path: "backend/src/app.ts" });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "unstage backend/src/app.ts" })).toBeInTheDocument();
    });

    deferred.resolve({ ok: true, message: "Staged backend/src/app.ts" });
  });
});
