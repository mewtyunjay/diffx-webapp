import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile } from "@diffx/contracts";
import { FilesTab, type FilesDockMessage } from "./FilesTab";

function renderFilesTab(options?: {
  files?: ChangedFile[];
  pendingMutationsByPath?: ReadonlyMap<string, "stage" | "unstage">;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  onStageFiles?: (paths: string[]) => void;
  onUnstageFiles?: (paths: string[]) => void;
  stagedCount?: number;
  dockAction?: "commit" | "push" | "create-upstream";
  dockMessage?: FilesDockMessage;
  isCommitting?: boolean;
  isPushing?: boolean;
  onCommitChanges?: (message: string) => void;
  onPushChanges?: (createUpstream: boolean) => void;
}) {
  const onSelectFile = vi.fn();
  const onStageFile = options?.onStageFile ?? vi.fn();
  const onUnstageFile = options?.onUnstageFile ?? vi.fn();
  const onStageFiles = options?.onStageFiles ?? vi.fn();
  const onUnstageFiles = options?.onUnstageFiles ?? vi.fn();
  const onCommitChanges = options?.onCommitChanges ?? vi.fn();
  const onPushChanges = options?.onPushChanges ?? vi.fn();
  const files = options?.files ?? [
    {
      path: "src/first.ts",
      status: "unstaged",
      contentHash: "hash-first",
      stats: { additions: 2, deletions: 1 },
    },
    {
      path: "src/second.ts",
      status: "untracked",
      contentHash: "hash-second",
      stats: null,
    },
    {
      path: "src/already-staged.ts",
      status: "staged",
      contentHash: "hash-staged",
      stats: { additions: 1, deletions: 0 },
    },
  ];

  render(
    <FilesTab
      files={files}
      selectedFile={null}
      onSelectFile={onSelectFile}
      onStageFile={onStageFile}
      onUnstageFile={onUnstageFile}
      onStageFiles={onStageFiles}
      onUnstageFiles={onUnstageFiles}
      pendingMutationsByPath={options?.pendingMutationsByPath ?? new Map()}
      stagedCount={options?.stagedCount ?? 1}
      dockAction={options?.dockAction ?? "commit"}
      dockMessage={options?.dockMessage ?? null}
      isCommitting={options?.isCommitting ?? false}
      isPushing={options?.isPushing ?? false}
      onCommitChanges={onCommitChanges}
      onPushChanges={onPushChanges}
    />,
  );

  return {
    onSelectFile,
    onStageFile,
    onUnstageFile,
    onStageFiles,
    onUnstageFiles,
    onCommitChanges,
    onPushChanges,
  };
}

function getGroupAction(label: "staged" | "unstaged" | "untracked"): HTMLButtonElement {
  const header = screen.getByText(new RegExp(`^${label} \\(`, "i"));
  const section = header.closest("section");

  if (!section) {
    throw new Error(`Could not find section for ${label}`);
  }

  return within(section).getByRole("button", { name: /all$/i });
}

describe("FilesTab row actions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows row actions and header bulk actions per status", () => {
    const onStageFile = vi.fn();
    const onUnstageFile = vi.fn();
    const onStageFiles = vi.fn();
    const onUnstageFiles = vi.fn();
    renderFilesTab({ onStageFile, onUnstageFile, onStageFiles, onUnstageFiles });

    const stageButtons = screen.getAllByRole("button", { name: /^stage\ssrc\//i });
    expect(stageButtons).toHaveLength(2);
    const unstageButton = screen.getByRole("button", { name: /^unstage\ssrc\//i });

    const stagedBulkAction = getGroupAction("staged");
    const unstagedBulkAction = getGroupAction("unstaged");
    const untrackedBulkAction = getGroupAction("untracked");

    expect(stagedBulkAction).toHaveTextContent("unstage all");
    expect(unstagedBulkAction).toHaveTextContent("stage all");
    expect(untrackedBulkAction).toHaveTextContent("stage all");

    fireEvent.click(stageButtons[0]);
    expect(onStageFile).toHaveBeenCalledWith("src/first.ts");

    fireEvent.click(unstageButton);
    expect(onUnstageFile).toHaveBeenCalledWith("src/already-staged.ts");

    fireEvent.click(stagedBulkAction);
    expect(onUnstageFiles).toHaveBeenCalledWith(["src/already-staged.ts"]);

    fireEvent.click(unstagedBulkAction);
    expect(onStageFiles).toHaveBeenCalledWith(["src/first.ts"]);

    fireEvent.click(untrackedBulkAction);
    expect(onStageFiles).toHaveBeenCalledWith(["src/second.ts"]);
  });

  it("disables only rows for pending file paths", () => {
    renderFilesTab({ pendingMutationsByPath: new Map([["src/first.ts", "stage"]]) });

    const pendingButton = screen.getByRole("button", { name: "stage src/first.ts" });
    const otherStageButton = screen.getByRole("button", { name: "stage src/second.ts" });
    const unstageButton = screen.getByRole("button", { name: "unstage src/already-staged.ts" });

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveTextContent("staging...");
    expect(otherStageButton).toBeEnabled();
    expect(unstageButton).toBeEnabled();

    const unstagedBulkAction = getGroupAction("unstaged");
    const untrackedBulkAction = getGroupAction("untracked");

    expect(unstagedBulkAction).toBeDisabled();
    expect(untrackedBulkAction).toBeEnabled();
  });

  it("renders untracked row stats when available", () => {
    renderFilesTab({
      files: [
        {
          path: "src/new-file.ts",
          status: "untracked",
          contentHash: "hash-new",
          stats: { additions: 5, deletions: 0 },
        },
      ],
    });

    const fileButton = screen.getByRole("button", { name: "new-file.ts" });
    const row = fileButton.closest("li");

    expect(row).not.toBeNull();
    expect(within(row!).getByText("+5")).toBeInTheDocument();
    expect(within(row!).getByText("-0")).toBeInTheDocument();
  });

  it("shows a one-line commit dock and submits trimmed message", () => {
    const onCommitChanges = vi.fn();

    renderFilesTab({ onCommitChanges, stagedCount: 1 });

    const input = screen.getByPlaceholderText("describe why this change exists");
    expect(input).toHaveAttribute("rows", "2");

    fireEvent.change(input, { target: { value: "  tidy files tab flow  " } });
    fireEvent.click(screen.getByRole("button", { name: "commit" }));

    expect(onCommitChanges).toHaveBeenCalledWith("tidy files tab flow");
  });

  it("switches dock action to push and triggers push callback", () => {
    const onPushChanges = vi.fn();

    renderFilesTab({ dockAction: "push", onPushChanges, stagedCount: 0 });

    expect(screen.queryByPlaceholderText("describe why this change exists")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(onPushChanges).toHaveBeenCalledWith(false);
  });

  it("shows create-upstream push action when upstream is missing", () => {
    const onPushChanges = vi.fn();

    renderFilesTab({
      dockAction: "create-upstream",
      stagedCount: 0,
      onPushChanges,
      dockMessage: { tone: "info", text: "No upstream exists for 'main'. Should I create one with the same name?" },
    });

    expect(screen.getByText("No upstream exists for 'main'. Should I create one with the same name?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "create upstream + push" }));
    expect(onPushChanges).toHaveBeenCalledWith(true);
  });
});
