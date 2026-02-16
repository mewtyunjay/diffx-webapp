import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffSummaryResponse } from "@diffx/contracts";
import { getDiffSummary } from "../../../services/api/diff";
import { FilesTab } from "./FilesTab";

vi.mock("../../../services/api/diff", () => ({
  getDiffSummary: vi.fn(),
}));

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function renderFilesTab(options?: {
  isMutatingFile?: boolean;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
}) {
  const onSelectFile = vi.fn();
  const onStageFile = options?.onStageFile ?? vi.fn();
  const onUnstageFile = options?.onUnstageFile ?? vi.fn();

  render(
    <QueryClientProvider client={buildQueryClient()}>
      <FilesTab
        files={[
          { path: "src/first.ts", status: "unstaged" },
          { path: "src/second.ts", status: "untracked" },
          { path: "src/already-staged.ts", status: "staged" },
        ]}
        selectedFile={null}
        onSelectFile={onSelectFile}
        onStageFile={onStageFile}
        onUnstageFile={onUnstageFile}
        isMutatingFile={options?.isMutatingFile ?? false}
      />
    </QueryClientProvider>,
  );

  return {
    onSelectFile,
    onStageFile,
    onUnstageFile,
  };
}

describe("FilesTab row actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const diffResponse: DiffSummaryResponse = {
      mode: "git",
      file: {
        path: "src/file.ts",
        oldPath: "src/file.ts",
        newPath: "src/file.ts",
        languageHint: "ts",
        isBinary: false,
        tooLarge: false,
        patch: null,
        stats: { additions: 1, deletions: 1, hunks: 1 },
      },
    };

    vi.mocked(getDiffSummary).mockResolvedValue(diffResponse);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows stage and unstage buttons per file status", () => {
    const onStageFile = vi.fn();
    const onUnstageFile = vi.fn();
    renderFilesTab({ onStageFile, onUnstageFile });

    const stageButtons = screen.getAllByRole("button", { name: /^stage\s/i });
    expect(stageButtons).toHaveLength(2);
    const unstageButton = screen.getByRole("button", { name: /^unstage\s/i });

    fireEvent.click(stageButtons[0]);
    expect(onStageFile).toHaveBeenCalledWith("src/first.ts");

    fireEvent.click(unstageButton);
    expect(onUnstageFile).toHaveBeenCalledWith("src/already-staged.ts");
  });

  it("disables stage and unstage buttons while file mutation is pending", () => {
    renderFilesTab({ isMutatingFile: true });

    const stageButtons = screen.getAllByRole("button", { name: /^stage\s/i });
    const unstageButton = screen.getByRole("button", { name: /^unstage\s/i });
    expect(stageButtons).toHaveLength(2);
    expect(stageButtons[0]).toBeDisabled();
    expect(stageButtons[1]).toBeDisabled();
    expect(unstageButton).toBeDisabled();
  });
});
