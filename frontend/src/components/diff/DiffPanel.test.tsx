import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, DiffDetailResponse } from "@diffx/contracts";
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
  } as UseQueryResult<DiffDetailResponse, Error>;
}

describe("DiffPanel rendering", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders full diff directly when detail payload includes full context", () => {
    const selectedFile: ChangedFile = {
      path: "backend/src/app.ts",
      status: "unstaged",
      contentHash: "hash-app",
      stats: { additions: 1, deletions: 1 },
    };

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
        viewMode="split"
        onViewModeChange={() => undefined}
        onPreviousFile={() => undefined}
        onNextFile={() => undefined}
        canGoPrevious={false}
        canGoNext={false}
        diffQuery={diffQuery}
      />,
    );

    expect(screen.getByTestId("render-full")).toBeInTheDocument();
    expect(screen.queryByText("Loading full diff...")).not.toBeInTheDocument();
  });
});
