import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResponse } from "@diffx/contracts";
import App from "./App";
import {
  commitChanges,
  generateCommitMessage,
  pushChanges,
  stageFile,
  stageManyFiles,
  unstageFile,
  unstageManyFiles,
} from "./services/api/actions";
import { ApiRequestError } from "./services/api/client";
import { getDiffDetail } from "./services/api/diff";
import { getChangedFiles } from "./services/api/files";
import { getHealth } from "./services/api/health";
import {
  createQuizSession,
  getQuizProviders,
  getQuizSession,
  openQuizSessionStream,
  submitQuizAnswers,
  validateQuizSession,
} from "./services/api/quiz";
import { getRepoSummary } from "./services/api/repo";
import { getSettings, putSettings } from "./services/api/settings";
import { getWorkspace, pickWorkspace, setWorkspace } from "./services/api/workspace";

vi.mock("./services/api/repo", () => ({
  getRepoSummary: vi.fn(),
}));

vi.mock("./services/api/files", () => ({
  getChangedFiles: vi.fn(),
}));

vi.mock("./services/api/diff", () => ({
  getDiffDetail: vi.fn(),
}));

vi.mock("./services/api/health", () => ({
  getHealth: vi.fn(),
}));

vi.mock("./services/api/settings", () => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
}));

vi.mock("./services/api/quiz", () => ({
  createQuizSession: vi.fn(),
  getQuizProviders: vi.fn(),
  getQuizSession: vi.fn(),
  openQuizSessionStream: vi.fn(() => () => undefined),
  submitQuizAnswers: vi.fn(),
  validateQuizSession: vi.fn(),
}));

vi.mock("./services/api/actions", () => ({
  stageFile: vi.fn(),
  stageManyFiles: vi.fn(),
  unstageFile: vi.fn(),
  unstageManyFiles: vi.fn(),
  commitChanges: vi.fn(),
  generateCommitMessage: vi.fn(),
  pushChanges: vi.fn(),
}));

vi.mock("./services/api/workspace", () => ({
  getWorkspace: vi.fn(),
  setWorkspace: vi.fn(),
  pickWorkspace: vi.fn(),
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
  const getDiffDetailMock = vi.mocked(getDiffDetail);
  const getHealthMock = vi.mocked(getHealth);
  const getSettingsMock = vi.mocked(getSettings);
  const putSettingsMock = vi.mocked(putSettings);
  const createQuizSessionMock = vi.mocked(createQuizSession);
  const getQuizProvidersMock = vi.mocked(getQuizProviders);
  const getQuizSessionMock = vi.mocked(getQuizSession);
  const openQuizSessionStreamMock = vi.mocked(openQuizSessionStream);
  const submitQuizAnswersMock = vi.mocked(submitQuizAnswers);
  const validateQuizSessionMock = vi.mocked(validateQuizSession);
  const stageFileMock = vi.mocked(stageFile);
  const stageManyFilesMock = vi.mocked(stageManyFiles);
  const unstageFileMock = vi.mocked(unstageFile);
  const unstageManyFilesMock = vi.mocked(unstageManyFiles);
  const commitChangesMock = vi.mocked(commitChanges);
  const generateCommitMessageMock = vi.mocked(generateCommitMessage);
  const pushChangesMock = vi.mocked(pushChanges);
  const getWorkspaceMock = vi.mocked(getWorkspace);
  const setWorkspaceMock = vi.mocked(setWorkspace);
  const pickWorkspaceMock = vi.mocked(pickWorkspace);

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

  function buildDefaultSettings() {
    return {
      quiz: {
        gateEnabled: false,
        questionCount: 4,
        scope: "all_changes" as const,
        validationMode: "answer_all" as const,
        scoreThreshold: null,
        providerPreference: "codex" as const,
      },
    };
  }

  function buildWorkspaceState() {
    return {
      repoRoot: "/Users/mrityunjay/dev/projects/diffx-webapp",
    };
  }

  function buildQuizSession(status: "queued" | "ready" | "validated") {
    const base = {
      id: "quiz-session-1",
      sourceFingerprint: "source-fingerprint",
      commitMessageDraft: "ship files dock",
      createdAt: "2026-02-17T00:00:00.000Z",
      updatedAt: "2026-02-17T00:00:00.000Z",
      progress: {
        phase: status === "queued" ? "queued" : "validating",
        percent: status === "queued" ? 0 : 100,
        message: status === "queued" ? "Session queued." : "Quiz is ready.",
      },
      quiz:
        status === "queued"
          ? null
          : {
              title: "Commit readiness quiz",
              generatedAt: "2026-02-17T00:00:00.000Z",
              questions: [
                {
                  id: "q-1",
                  prompt: "Question 1",
                  snippet: null,
                  options: ["A", "B", "C", "D"] as [string, string, string, string],
                  correctOptionIndex: 0,
                  explanation: null,
                  tags: [],
                },
                {
                  id: "q-2",
                  prompt: "Question 2",
                  snippet: null,
                  options: ["A", "B", "C", "D"] as [string, string, string, string],
                  correctOptionIndex: 1,
                  explanation: null,
                  tags: [],
                },
                {
                  id: "q-3",
                  prompt: "Question 3",
                  snippet: null,
                  options: ["A", "B", "C", "D"] as [string, string, string, string],
                  correctOptionIndex: 2,
                  explanation: null,
                  tags: [],
                },
                {
                  id: "q-4",
                  prompt: "Question 4",
                  snippet: null,
                  options: ["A", "B", "C", "D"] as [string, string, string, string],
                  correctOptionIndex: 3,
                  explanation: null,
                  tags: [],
                },
              ],
            },
      answers:
        status === "queued"
          ? {}
          : {
              "q-1": 0,
              "q-2": 1,
              "q-3": 2,
              "q-4": 3,
            },
      validation:
        status === "validated"
          ? {
              mode: "answer_all" as const,
              passed: true,
              answeredCount: 4,
              correctCount: 4,
              totalQuestions: 4,
              score: 1,
              scoreThreshold: null,
            }
          : null,
      failure: null,
    };

    return {
      ...base,
      status,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    stageFileMock.mockResolvedValue({ ok: true, message: "Staged file" });
    stageManyFilesMock.mockResolvedValue({ ok: true, message: "Staged files" });
    unstageFileMock.mockResolvedValue({ ok: true, message: "Unstaged file" });
    unstageManyFilesMock.mockResolvedValue({ ok: true, message: "Unstaged files" });
    commitChangesMock.mockResolvedValue({ ok: true, message: "Committed" });
    generateCommitMessageMock.mockResolvedValue({ ok: true, message: "ship files dock" });
    pushChangesMock.mockResolvedValue({ ok: true, message: "Pushed" });
    getSettingsMock.mockResolvedValue(buildDefaultSettings());
    putSettingsMock.mockResolvedValue(buildDefaultSettings());
    createQuizSessionMock.mockReset();
    getQuizProvidersMock.mockResolvedValue({
      providers: [
        { id: "codex", available: true, reason: null, model: "gpt-5.3-codex-spark" },
      ],
    });
    getQuizSessionMock.mockReset();
    openQuizSessionStreamMock.mockReturnValue(() => undefined);
    submitQuizAnswersMock.mockReset();
    validateQuizSessionMock.mockReset();
    getWorkspaceMock.mockResolvedValue(buildWorkspaceState());
    setWorkspaceMock.mockResolvedValue(buildWorkspaceState());
    pickWorkspaceMock.mockResolvedValue(buildWorkspaceState());

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

  it("renders non-git gate and opens native picker from folder name", async () => {
    getRepoSummaryMock.mockResolvedValue(buildNonGitRepoSummary());
    getChangedFilesMock.mockResolvedValue([]);
    getHealthMock.mockResolvedValue({ ok: true });
    pickWorkspaceMock.mockResolvedValueOnce({ repoRoot: "/tmp/selected-repo" });

    renderWithQueryClient();

    expect(await screen.findByText("Not a Git repository")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "scratch-folder" }));

    await waitFor(() => {
      expect(pickWorkspaceMock).toHaveBeenCalledTimes(1);
    });
  });

  it("retries repository bootstrap on retryable failures", async () => {
    getRepoSummaryMock
      .mockRejectedValueOnce(new ApiRequestError(500, "INTERNAL_ERROR", "internal"))
      .mockRejectedValueOnce(new ApiRequestError(500, "INTERNAL_ERROR", "internal"))
      .mockResolvedValue(buildGitRepoSummary());

    getChangedFilesMock.mockResolvedValue([]);
    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    expect(
      await screen.findByText("Internal server error. Try again in a moment.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(getRepoSummaryMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    expect(await screen.findByRole("button", { name: "diffx-webapp" })).toBeInTheDocument();
  });

  it("renders app shell with topbar and tabs in git mode", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1, unstagedCount: 2 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "backend/src/app.ts", status: "unstaged", contentHash: "hash-app" },
    ]);

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    expect(await screen.findByRole("button", { name: "diffx-webapp" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "app.ts" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "split" })).toBeInTheDocument();
    expect(screen.queryByText(/^branch:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^quiz gate:/i)).not.toBeInTheDocument();
  });

  it("retries files query on retryable failures", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ unstagedCount: 1 }));

    getChangedFilesMock
      .mockRejectedValueOnce(new ApiRequestError(500, "INTERNAL_ERROR", "internal"))
      .mockResolvedValueOnce([
        {
          path: "backend/src/app.ts",
          status: "unstaged",
          contentHash: "hash-app",
          stats: { additions: 1, deletions: 1 },
        },
      ]);

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    expect(await screen.findByText("Internal server error. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry files" }));

    await waitFor(() => {
      expect(getChangedFilesMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByRole("button", { name: "app.ts" })).toBeInTheDocument();
  });

  it("uses files payload stats as header source of truth", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ untrackedCount: 1 }));

    getChangedFilesMock.mockResolvedValue([
      {
        path: "frontend/src/new-file.ts",
        status: "untracked",
        contentHash: "hash-new",
        stats: { additions: 3, deletions: 0 },
      },
    ]);

    getDiffDetailMock.mockResolvedValue({
      mode: "git",
      file: {
        path: "frontend/src/new-file.ts",
        oldPath: null,
        newPath: "frontend/src/new-file.ts",
        languageHint: "ts",
        isBinary: false,
        tooLarge: false,
        patch: [
          "diff --git a/frontend/src/new-file.ts b/frontend/src/new-file.ts",
          "new file mode 100644",
          "index 0000000..1111111",
          "--- /dev/null",
          "+++ b/frontend/src/new-file.ts",
          "@@ -0,0 +1,3 @@",
          "+line one",
          "+line two",
          "+line three",
          "",
        ].join("\n"),
        stats: {
          additions: 9,
          deletions: 0,
          hunks: 1,
        },
      },
      old: {
        file: null,
        isBinary: false,
        tooLarge: false,
        error: false,
      },
      new: {
        file: {
          name: "frontend/src/new-file.ts",
          contents: "line one\nline two\nline three\n",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
    });

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    const fileButton = await screen.findByRole("button", { name: "new-file.ts" });
    const row = fileButton.closest("li");

    expect(row).not.toBeNull();
    expect(within(row!).getByText("+3")).toBeInTheDocument();

    const fileHeader = await screen.findByRole("status", { name: "Current diff file metadata" });
    expect(within(fileHeader).getByText("+3")).toBeInTheDocument();
    expect(within(fileHeader).queryByText("+9")).not.toBeInTheDocument();
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
      const pendingActionButton = screen.getByRole("button", {
        name: /(stage|unstage) backend\/src\/app\.ts/,
      });
      expect(pendingActionButton).toBeDisabled();
      expect(pendingActionButton).not.toHaveTextContent("staging...");
      expect(pendingActionButton).not.toHaveTextContent("unstaging...");
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

  it("uses unstage-many endpoint for header unstage all action", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 2 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "backend/src/app.ts", status: "staged", contentHash: "hash-app" },
      { path: "backend/src/server.ts", status: "staged", contentHash: "hash-server" },
    ]);

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    const stagedHeader = await screen.findByText("staged (2)");
    const section = stagedHeader.closest("section");
    expect(section).not.toBeNull();

    fireEvent.click(within(section!).getByRole("button", { name: "unstage all" }));

    await waitFor(() => {
      expect(unstageManyFilesMock).toHaveBeenCalledWith({
        paths: ["backend/src/app.ts", "backend/src/server.ts"],
      });
    });

    expect(unstageFileMock).not.toHaveBeenCalled();
  });

  it("switches files dock action from commit to push after commit", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

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

    const messageBox = await screen.findByPlaceholderText("enter commit message here");
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

  it("generates commit message suggestion from composer icon", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ stagedCount: 1 }));

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

    getHealthMock.mockResolvedValue({ ok: true });

    renderWithQueryClient();

    const messageBox = await screen.findByPlaceholderText("enter commit message here");

    fireEvent.click(await screen.findByRole("button", { name: "Generate commit message" }));

    await waitFor(() => {
      expect(generateCommitMessageMock).toHaveBeenCalledWith({ draft: "" });
    });

    expect(messageBox).toHaveValue("ship files dock");
    expect(screen.queryByText("Generated commit message with Codex 5.3 spark.")).not.toBeInTheDocument();
  });

  it("auto-dismisses commit generator error after 2 seconds", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ stagedCount: 0 }));
    getChangedFilesMock.mockResolvedValue([]);
    getHealthMock.mockResolvedValue({ ok: true });

    generateCommitMessageMock.mockRejectedValue(
      new ApiRequestError(
        409,
        "COMMIT_MESSAGE_GENERATION_FAILED",
        "Stage at least one file before generating a commit message.",
      ),
    );

    renderWithQueryClient();

    fireEvent.click(await screen.findByRole("button", { name: "Generate commit message" }));

    const errorMessage = await screen.findByText(
      "Stage at least one file before generating a commit message.",
    );
    expect(errorMessage).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.queryByText("Stage at least one file before generating a commit message."),
        ).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("silently retries push with upstream creation when upstream is missing", async () => {
    getRepoSummaryMock.mockResolvedValue(
      buildGitRepoSummary({ stagedCount: 1 }),
    );

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

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

    const messageBox = await screen.findByPlaceholderText("enter commit message here");
    fireEvent.change(messageBox, { target: { value: "ship files dock" } });
    fireEvent.click(screen.getByRole("button", { name: "commit" }));

    const pushButton = await screen.findByRole("button", { name: "push" });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(pushChangesMock).toHaveBeenCalledWith({});
    });

    await waitFor(() => {
      expect(pushChangesMock).toHaveBeenLastCalledWith({ createUpstream: true });
    });
  });

  it("opens quiz first and starts generation only from generate button", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ stagedCount: 1 }));
    getSettingsMock.mockResolvedValue({
      quiz: {
        gateEnabled: true,
        questionCount: 4,
        scope: "staged",
        validationMode: "answer_all",
        scoreThreshold: null,
        providerPreference: "codex",
      },
    });

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

    getHealthMock.mockResolvedValue({ ok: true });
    createQuizSessionMock.mockResolvedValue(buildQuizSession("queued"));
    getQuizSessionMock.mockResolvedValue(buildQuizSession("queued"));

    renderWithQueryClient();

    const openQuizCommitButton = await screen.findByRole("button", { name: "commit" });
    await waitFor(() => {
      expect(openQuizCommitButton).toBeEnabled();
    });
    fireEvent.click(openQuizCommitButton);

    expect(createQuizSessionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "generate quiz" }));

    await waitFor(() => {
      expect(createQuizSessionMock).toHaveBeenCalledWith({
        commitMessage: "",
      });
    });

    expect(commitChangesMock).not.toHaveBeenCalled();
  });

  it("gates commit behind quiz validation and unlocks manual commit", async () => {
    getRepoSummaryMock.mockResolvedValue(buildGitRepoSummary({ stagedCount: 1 }));
    getSettingsMock.mockResolvedValue({
      quiz: {
        gateEnabled: true,
        questionCount: 4,
        scope: "staged",
        validationMode: "answer_all",
        scoreThreshold: null,
        providerPreference: "codex",
      },
    });

    getChangedFilesMock.mockResolvedValue([
      { path: "frontend/src/App.tsx", status: "staged", contentHash: "hash-frontend-app" },
    ]);

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

    createQuizSessionMock.mockResolvedValue(buildQuizSession("queued"));
    getQuizSessionMock.mockResolvedValue(buildQuizSession("ready"));
    validateQuizSessionMock.mockResolvedValue(buildQuizSession("validated"));

    renderWithQueryClient();

    const messageBox = await screen.findByPlaceholderText("enter commit message here");
    fireEvent.change(messageBox, { target: { value: "ship files dock" } });

    const commitToOpenQuizButton = screen.getByRole("button", { name: "commit" });
    await waitFor(() => {
      expect(commitToOpenQuizButton).toBeEnabled();
    });
    expect(commitToOpenQuizButton).toHaveAttribute("title", "Complete quiz validation before commit.");
    fireEvent.click(commitToOpenQuizButton);

    expect(createQuizSessionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "generate quiz" }));

    await waitFor(() => {
      expect(createQuizSessionMock).toHaveBeenCalledWith({
        commitMessage: "ship files dock",
      });
    });

    expect(commitChangesMock).not.toHaveBeenCalled();

    await screen.findByText("Question 1");
    fireEvent.click(screen.getByRole("button", { name: "validate quiz" }));

    await waitFor(() => {
      expect(validateQuizSessionMock).toHaveBeenCalledWith("quiz-session-1", {
        sourceFingerprint: "source-fingerprint",
      });
    });

    const commitButton = await screen.findByRole("button", { name: "commit" });
    expect(commitButton).not.toHaveAttribute("title");
    fireEvent.click(commitButton);

    await waitFor(() => {
      expect(commitChangesMock).toHaveBeenCalledWith({ message: "ship files dock" });
    });
  });
});
