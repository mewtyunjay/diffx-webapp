import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeReviewSession } from "@diffx/contracts";
import { SidebarShell } from "./SidebarShell";

const FILES: ChangedFile[] = [
  {
    path: "frontend/src/App.tsx",
    status: "unstaged",
    contentHash: "hash-app",
    stats: { additions: 4, deletions: 1 },
  },
];

const REVIEW_SESSION: CodeReviewSession = {
  id: "review-session",
  status: "ready",
  sourceFingerprint: "fp",
  createdAt: "2026-02-23T00:00:00.000Z",
  updatedAt: "2026-02-23T00:00:00.000Z",
  progress: {
    phase: "finalizing",
    percent: 100,
    message: "Code review complete.",
  },
  findings: [
    {
      id: "finding-1",
      severity: "high",
      type: "security",
      title: "Potential injection path",
      summary: "Input reaches command execution boundary.",
      path: "backend/src/services/git/actions.service.ts",
      lineStart: 120,
      lineEnd: 120,
      agent: "security",
    },
  ],
  failure: null,
};

function renderSidebarShell(options?: {
  codeReviewSession?: CodeReviewSession | null;
  onRunCodeReview?: () => void;
}) {
  render(
    <SidebarShell
      branch="main"
      files={FILES}
      selectedFile={FILES[0]}
      isLoadingFiles={false}
      filesError={null}
      filesErrorRetryable={false}
      pendingMutationsByPath={new Map()}
      codeReviewSession={options?.codeReviewSession ?? null}
      isStartingCodeReview={false}
      isLoadingCodeReviewSession={false}
      codeReviewStreamError={null}
      isCommitting={false}
      isPushing={false}
      isGeneratingCommitMessage={false}
      commitMessage=""
      commitDisabled={false}
      commitTooltip={undefined}
      canPush={false}
      onCommitMessageChange={() => undefined}
      onRetryFiles={() => undefined}
      onSelectFile={() => undefined}
      onStageFile={() => undefined}
      onUnstageFile={() => undefined}
      onStageFiles={() => undefined}
      onUnstageFiles={() => undefined}
      onRunCodeReview={options?.onRunCodeReview ?? (() => undefined)}
      onCommitChanges={() => undefined}
      onPushChanges={() => undefined}
      onGenerateCommitMessage={() => undefined}
    />,
  );
}

describe("SidebarShell tabs", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows files and code review tabs with finding count badge", () => {
    renderSidebarShell({ codeReviewSession: REVIEW_SESSION });

    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
    const codeReviewTab = screen.getByRole("tab", { name: /Code Review/i });
    expect(codeReviewTab).toHaveTextContent("Code Review");
    expect(codeReviewTab).toHaveTextContent("1");
  });

  it("runs code review from code review tab", () => {
    const onRunCodeReview = vi.fn();
    renderSidebarShell({ onRunCodeReview });

    fireEvent.click(screen.getByRole("tab", { name: /Code Review/i }));
    fireEvent.click(screen.getByRole("button", { name: "run review" }));

    expect(onRunCodeReview).toHaveBeenCalledTimes(1);
  });
});
