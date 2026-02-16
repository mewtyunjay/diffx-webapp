import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResponse } from "@diffx/contracts";
import App from "./App";
import { commitChanges, pushChanges, stageFile, stageManyFiles, unstageFile } from "./services/api/actions";
import { ApiRequestError } from "./services/api/client";
import { getDiffDetail, getDiffSummary } from "./services/api/diff";
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
  getDiffDetail: vi.fn(),
}));

vi.mock("./services/api/health", () => ({
  getHealth: vi.fn(),
}));

vi.mock("./services/api/actions", () => ({
  stageFile: vi.fn(),
  stageManyFiles: vi.fn(),
  unstageFile: vi.fn(),
  commitChanges: vi.fn(),
  pushChanges: vi.fn(),
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
  const getDiffDetailMock = vi.mocked(getDiffDetail);
  const getHealthMock = vi.mocked(getHealth);
  const stageFileMock = vi.mocked(stageFile);
  const stageManyFilesMock = vi.mocked(stageManyFiles);
  const unstageFileMock = vi.mocked(unstageFile);
  const commitChangesMock = vi.mocked(commitChanges);
  const pushChangesMock = vi.mocked(pushChanges);

  function buildGitRepoSummary(overrides: Partial<Awaited<ReturnType<typeof getRepoSummary>>> = {}) {
    return {
      mode: "git" as const,
      repoName: "diffx-webapp",
      branch: "main",
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      remoteHash: "remote-hash",
      ...overrides,
    };
  }

  function buildNonGitRepoSummary() {
    return {
      mode: "non-git" as const,
      repoName: "scratch-folder",
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      remoteHash: "non-git",
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    stageFileMock.mockResolvedValue({ ok: true, message: "Staged file" });
    stageManyFilesMock.mockResolvedValue({ ok: true, message: "Staged files" });
    unstageFileMock.mockResolvedValue({ ok: true, message: "Unstaged file" });
    commitChangesMock.mockResolvedValue({ ok: true, message: "Committed" });
    pushChangesMock.mockResolvedValue({ ok: true, message: "Pushed" });

    getDiffDetailMock.mockResolvedValue({
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
      old: {
        file: {
          name: "backend/src/app.ts",
          contents: "const app = oldValue",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
      new: {
        file: {
          name: "backend/src/app.ts",
          contents: "const app = newValue",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
    });
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
    getRepoSummaryMock.mockResolvedValue(buildNonGitRepoSummary());

    renderWithQueryClient();

    expect(await screen.findByText("Not a Git repository")).toBeInTheDocument();
  });

  it("renders app shell with topbar and tabs in git mode", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1, unstagedCount: 2 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "backend/src/app.ts", status: "unstaged", contentHash: "hash-app" },
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

    renderWithQueryClient();

    expect(await screen.findByText("diffx-webapp")).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "app.ts" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "split" })).toBeInTheDocument();
  });

  it("optimistically flips unstaged file to staged in files tab", async () => {
    getRepoSummaryMock
      .mockResolvedValueOnce(buildGitRepoSummary({ unstagedCount: 1 }))
      .mockResolvedValueOnce(buildGitRepoSummary({ stagedCount: 1 }))
      .mockResolvedValue(buildGitRepoSummary({ stagedCount: 1 }));

    const deferredFilesAfterRefresh = createDeferred<Awaited<ReturnType<typeof getChangedFiles>>>();

    getChangedFilesMock
      .mockResolvedValueOnce([{ path: "backend/src/app.ts", status: "unstaged", contentHash: "hash-app" }])
      .mockImplementationOnce(async () => await deferredFilesAfterRefresh.promise)
      .mockResolvedValue([{ path: "backend/src/app.ts", status: "staged", contentHash: "hash-app" }]);

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

    const deferred = createDeferred<ActionResponse>();
    const deferredDiffDetail = createDeferred<Awaited<ReturnType<typeof getDiffDetail>>>();
    stageFileMock.mockReturnValueOnce(deferred.promise);

    renderWithQueryClient();

    const stageButton = await screen.findByRole("button", { name: "stage backend/src/app.ts" });
    await waitFor(() => {
      expect(getDiffDetailMock).toHaveBeenCalled();
      expect(screen.queryByText("Loading diff...")).not.toBeInTheDocument();
    });

    getDiffDetailMock.mockImplementationOnce(async () => await deferredDiffDetail.promise);
    fireEvent.click(stageButton);

    await waitFor(() => {
      expect(stageFileMock).toHaveBeenCalledWith({ path: "backend/src/app.ts" });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "stage backend/src/app.ts" })).toHaveTextContent("staging...");
    });

    expect(screen.queryByText("Loading diff...")).not.toBeInTheDocument();

    deferred.resolve({ ok: true, message: "Staged backend/src/app.ts" });
    deferredDiffDetail.resolve({
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
      old: {
        file: {
          name: "backend/src/app.ts",
          contents: "const app = oldValue",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
      new: {
        file: {
          name: "backend/src/app.ts",
          contents: "const app = newValue",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
    });

    await waitFor(() => {
      expect(getRepoSummaryMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.queryByText("Select a file in the sidebar to view its diff.")).not.toBeInTheDocument();

    deferredFilesAfterRefresh.resolve([{ path: "backend/src/app.ts", status: "staged", contentHash: "hash-app" }]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "unstage backend/src/app.ts" })).toBeInTheDocument();
    });
  });

  it("uses stage-many endpoint for header stage all action", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ unstagedCount: 2 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "backend/src/app.ts", status: "unstaged", contentHash: "hash-app" },
      { path: "backend/src/server.ts", status: "unstaged", contentHash: "hash-server" },
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
        patch: null,
        stats: {
          additions: 0,
          deletions: 0,
          hunks: 0,
        },
      },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    const unstagedHeader = await screen.findByText("unstaged (2)");
    const section = unstagedHeader.closest("section");
    expect(section).not.toBeNull();

    fireEvent.click(within(section!).getByRole("button", { name: "stage all" }));

    await waitFor(() => {
      expect(stageManyFilesMock).toHaveBeenCalledWith({
        paths: ["backend/src/app.ts", "backend/src/server.ts"],
      });
    });

    expect(stageFileMock).not.toHaveBeenCalled();
  });

  it("switches files dock action from commit to push after commit", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

    getDiffSummaryMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "frontend/src/App.tsx",
        oldPath: "frontend/src/App.tsx",
        newPath: "frontend/src/App.tsx",
        languageHint: "tsx",
        isBinary: false,
        tooLarge: false,
        patch: "",
        stats: { additions: 0, deletions: 0, hunks: 0 },
      },
    });

    getDiffDetailMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "frontend/src/App.tsx",
        oldPath: "frontend/src/App.tsx",
        newPath: "frontend/src/App.tsx",
        languageHint: "tsx",
        isBinary: false,
        tooLarge: false,
        patch: "",
        stats: { additions: 0, deletions: 0, hunks: 0 },
      },
      old: { file: { name: "frontend/src/App.tsx", contents: "" }, isBinary: false, tooLarge: false, error: false },
      new: { file: { name: "frontend/src/App.tsx", contents: "" }, isBinary: false, tooLarge: false, error: false },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    const messageBox = await screen.findByPlaceholderText("describe why this change exists");
    fireEvent.change(messageBox, { target: { value: "ship files dock" } });

    const commitButton = screen.getByRole("button", { name: "commit" });
    fireEvent.click(commitButton);

    await waitFor(() => {
      expect(commitChangesMock).toHaveBeenCalledWith({ message: "ship files dock" });
    });

    const pushButton = await screen.findByRole("button", { name: "push" });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(pushChangesMock).toHaveBeenCalledWith({});
    });
  });

  it("offers create-upstream push action when push reports missing upstream", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

    getDiffSummaryMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "frontend/src/App.tsx",
        oldPath: "frontend/src/App.tsx",
        newPath: "frontend/src/App.tsx",
        languageHint: "tsx",
        isBinary: false,
        tooLarge: false,
        patch: "",
        stats: { additions: 0, deletions: 0, hunks: 0 },
      },
    });

    getDiffDetailMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "frontend/src/App.tsx",
        oldPath: "frontend/src/App.tsx",
        newPath: "frontend/src/App.tsx",
        languageHint: "tsx",
        isBinary: false,
        tooLarge: false,
        patch: "",
        stats: { additions: 0, deletions: 0, hunks: 0 },
      },
      old: { file: { name: "frontend/src/App.tsx", contents: "" }, isBinary: false, tooLarge: false, error: false },
      new: { file: { name: "frontend/src/App.tsx", contents: "" }, isBinary: false, tooLarge: false, error: false },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    pushChangesMock.mockRejectedValueOnce(
      new ApiRequestError(
        409,
        "NO_UPSTREAM",
        "No upstream exists for 'main'. Should I create one with the same name?",
      ),
    );

    renderWithQueryClient();

    const messageBox = await screen.findByPlaceholderText("describe why this change exists");
    fireEvent.change(messageBox, { target: { value: "ship files dock" } });
    fireEvent.click(screen.getByRole("button", { name: "commit" }));

    const pushButton = await screen.findByRole("button", { name: "push" });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(pushChangesMock).toHaveBeenCalledWith({});
    });

    expect(await screen.findByText("No upstream exists for 'main'. Should I create one with the same name?")).toBeInTheDocument();

    const createUpstreamButton = screen.getByRole("button", { name: "create upstream + push" });
    fireEvent.click(createUpstreamButton);

    await waitFor(() => {
      expect(pushChangesMock).toHaveBeenLastCalledWith({ createUpstream: true });
    });
  });
});
