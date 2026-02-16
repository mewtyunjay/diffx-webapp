import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, DiffSummaryResponse, FileContentsResponse } from "@diffx/contracts";
import { getLazyFileContents } from "../../services/api/file-contents";
import { DiffPanel } from "./DiffPanel";

vi.mock("../../services/api/file-contents", () => ({
  getLazyFileContents: vi.fn(),
}));

vi.mock("./PierreDiffRenderer", () => ({
  PierreDiffRenderer: ({ mode }: { mode: "patch" | "full" }) => (
    <div data-testid={`render-${mode}`}>{mode}</div>
  ),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function buildDiffQuery(data: DiffSummaryResponse): UseQueryResult<DiffSummaryResponse, Error> {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
  } as UseQueryResult<DiffSummaryResponse, Error>;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("DiffPanel full context loading", () => {
  const getLazyFileContentsMock = vi.mocked(getLazyFileContents);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads full context automatically and renders full diff once available", async () => {
    const selectedFile: ChangedFile = { path: "backend/src/app.ts", status: "unstaged" };

    const diffQuery = buildDiffQuery({
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
          "-old",
          "+new",
          "",
        ].join("\n"),
        stats: { additions: 1, deletions: 1, hunks: 1 },
      },
    });

    const oldDeferred = createDeferred<FileContentsResponse>();
    const newDeferred = createDeferred<FileContentsResponse>();

    getLazyFileContentsMock.mockImplementation(({ side }) => {
      if (side === "old") {
        return oldDeferred.promise;
      }

      return newDeferred.promise;
    });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <DiffPanel
          selectedFile={selectedFile}
          scope="unstaged"
          fileChangeCountLabel="1/1"
          viewMode="split"
          onViewModeChange={() => undefined}
          onPreviousFile={() => undefined}
          onNextFile={() => undefined}
          canGoPrevious={false}
          canGoNext={false}
          diffQuery={diffQuery}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Loading full diff...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "load full context" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getLazyFileContentsMock).toHaveBeenCalledTimes(2);
    });

    oldDeferred.resolve({
      mode: "git",
      side: "old",
      file: {
        name: "backend/src/app.ts",
        contents: "old",
      },
      isBinary: false,
      tooLarge: false,
      languageHint: "ts",
    });

    newDeferred.resolve({
      mode: "git",
      side: "new",
      file: {
        name: "backend/src/app.ts",
        contents: "new",
      },
      isBinary: false,
      tooLarge: false,
      languageHint: "ts",
    });

    await waitFor(() => {
      expect(screen.getByTestId("render-full")).toBeInTheDocument();
    });
  });
});
