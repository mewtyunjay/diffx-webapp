import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, DiffDetailResponse } from "@diffx/contracts";
import { ApiRequestError } from "../../services/api/client";
import { DiffPanel } from "./DiffPanel";

vi.mock("./PierreDiffRenderer", () => ({
  PierreDiffRenderer: ({ mode }: { mode: "patch" | "full" }) => (
    <div data-testid={`render-${mode}`}>{mode}</div>
  ),
}));

function buildDiffQuery(data: DiffDetailResponse): UseQueryResult<DiffDetailResponse, Error> {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as UseQueryResult<DiffDetailResponse, Error>;
}

function buildSelectedFile(): ChangedFile {
  return {
    path: "backend/src/app.ts",
    status: "unstaged",
    contentHash: "hash-app",
    stats: { additions: 1, deletions: 1 },
  };
}

describe("DiffPanel rendering", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders full diff directly when detail payload includes full context", () => {
    const selectedFile = buildSelectedFile();

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
      old: {
        file: {
          name: "backend/src/app.ts",
          contents: "old",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
      new: {
        file: {
          name: "backend/src/app.ts",
          contents: "new",
        },
        isBinary: false,
        tooLarge: false,
        error: false,
      },
    });

    render(
      <DiffPanel
        selectedFile={selectedFile}
        fileChangeCountLabel="1/1"
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={() => undefined}
        onPreviousFile={() => undefined}
        onNextFile={() => undefined}
        canGoPrevious={false}
        canGoNext={false}
        diffQuery={diffQuery}
        quizPanel={<div />}
      />,
    );

    expect(screen.getByRole("button", { name: "diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quiz" })).toBeInTheDocument();
    expect(screen.getByTestId("render-full")).toBeInTheDocument();
    expect(screen.queryByText("Loading full diff...")).not.toBeInTheDocument();
  });

  it("shows retry action for retryable diff load errors", () => {
    const refetch = vi.fn();

    render(
      <DiffPanel
        selectedFile={buildSelectedFile()}
        fileChangeCountLabel="1/1"
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={() => undefined}
        onPreviousFile={() => undefined}
        onNextFile={() => undefined}
        canGoPrevious={false}
        canGoNext={false}
        diffQuery={
          {
            data: undefined,
            isPending: false,
            isError: true,
            error: new ApiRequestError(500, "INTERNAL_ERROR", "internal"),
            refetch,
          } as UseQueryResult<DiffDetailResponse, Error>
        }
        quizPanel={<div />}
      />,
    );

    expect(screen.getByText("Internal server error. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry diff" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("hides retry action for non-retryable diff load errors", () => {
    render(
      <DiffPanel
        selectedFile={buildSelectedFile()}
        fileChangeCountLabel="1/1"
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={() => undefined}
        onPreviousFile={() => undefined}
        onNextFile={() => undefined}
        canGoPrevious={false}
        canGoNext={false}
        diffQuery={
          {
            data: undefined,
            isPending: false,
            isError: true,
            error: new ApiRequestError(400, "INVALID_PATH", "invalid path"),
            refetch: vi.fn(),
          } as UseQueryResult<DiffDetailResponse, Error>
        }
        quizPanel={<div />}
      />,
    );

    expect(screen.getByText("Invalid file path was requested.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "retry diff" })).not.toBeInTheDocument();
  });

  it("renders quiz panel content and top settings action in quiz mode", () => {
    const onOpenSettings = vi.fn();

    render(
      <DiffPanel
        selectedFile={buildSelectedFile()}
        fileChangeCountLabel="1/1"
        paneMode="quiz"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={onOpenSettings}
        onPreviousFile={() => undefined}
        onNextFile={() => undefined}
        canGoPrevious={false}
        canGoNext={false}
        diffQuery={
          {
            data: undefined,
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as UseQueryResult<DiffDetailResponse, Error>
        }
        quizPanel={<div>quiz panel content</div>}
      />,
    );

    expect(screen.getByRole("button", { name: "diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quiz" })).toBeInTheDocument();
    expect(screen.getByText("quiz panel content")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "split" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
