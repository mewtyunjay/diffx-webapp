import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodeReviewSession } from "@diffx/contracts";
import { CodeReviewTab } from "./CodeReviewTab";

const BASE_SESSION: CodeReviewSession = {
  id: "review-session",
  status: "ready",
  sourceFingerprint: "fingerprint",
  createdAt: "2026-02-23T00:00:00.000Z",
  updatedAt: "2026-02-23T00:00:00.000Z",
  progress: {
    phase: "finalizing",
    percent: 100,
    message: "Code review complete.",
  },
  findings: [
    {
      id: "f-1",
      severity: "critical",
      type: "security",
      title: "Unsanitized shell input",
      summary: "User-controlled input reaches shell execution without escaping.",
      path: "backend/src/services/git/actions.service.ts",
      lineStart: 42,
      lineEnd: 46,
      agent: "security",
    },
  ],
  failure: null,
};

describe("CodeReviewTab", () => {
  it("renders run action and empty-state copy", () => {
    const onRunReview = vi.fn();

    render(
      <CodeReviewTab
        session={null}
        isStartingReview={false}
        isLoadingSession={false}
        streamError={null}
        onRunReview={onRunReview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "run review" }));
    expect(onRunReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Run code review to scan changed files.")).toBeInTheDocument();
  });

  it("renders color-coded severity and location details", () => {
    render(
      <CodeReviewTab
        session={BASE_SESSION}
        isStartingReview={false}
        isLoadingSession={false}
        streamError={null}
        onRunReview={() => undefined}
      />,
    );

    const severity = screen.getByText("critical");
    expect(severity).toHaveClass("code-review-severity-critical");
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("backend/src/services/git/actions.service.ts:42-46")).toBeInTheDocument();
    expect(screen.getByText("Unsanitized shell input")).toBeInTheDocument();
  });
});
