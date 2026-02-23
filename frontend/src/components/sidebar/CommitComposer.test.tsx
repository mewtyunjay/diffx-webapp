import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommitComposer } from "./CommitComposer";

function renderComposer(overrides?: Partial<React.ComponentProps<typeof CommitComposer>>) {
  const props: React.ComponentProps<typeof CommitComposer> = {
    branch: "main",
    commitMessage: "",
    isCommitting: false,
    isPushing: false,
    isGeneratingMessage: false,
    commitDisabled: false,
    canPush: false,
    onCommitMessageChange: vi.fn(),
    onCommit: vi.fn(),
    onPush: vi.fn(),
    onGenerateMessage: vi.fn(),
    ...overrides,
  };

  render(<CommitComposer {...props} />);
  return props;
}

describe("CommitComposer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders branch header with icon and three-line editor", () => {
    renderComposer();

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(document.querySelector(".commit-composer-branch-icon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("enter commit message here")).toHaveAttribute("rows", "3");
  });

  it("keeps push disabled until commit flow enables it", () => {
    renderComposer({ canPush: false });
    expect(screen.getByRole("button", { name: "push" })).toBeDisabled();
  });

  it("emits compose actions including AI message generation", () => {
    const onCommit = vi.fn();
    const onPush = vi.fn();
    const onGenerateMessage = vi.fn();

    renderComposer({
      commitMessage: "ship commit composer",
      canPush: true,
      onCommit,
      onPush,
      onGenerateMessage,
    });

    const generateButton = screen.getByRole("button", {
      name: "Generate commit message",
    });
    expect(generateButton.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(generateButton);
    fireEvent.click(screen.getByRole("button", { name: "commit" }));
    fireEvent.click(screen.getByRole("button", { name: "push" }));

    expect(onGenerateMessage).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("ship commit composer");
    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it("shows loading text while generation is pending", () => {
    renderComposer({ isGeneratingMessage: true });

    expect(screen.getByRole("button", { name: "Generate commit message" })).toHaveTextContent(
      "..."
    );
  });

  it("shows commit tooltip only when provided", () => {
    const { rerender } = render(
      <CommitComposer
        branch="main"
        commitMessage=""
        isCommitting={false}
        isPushing={false}
        isGeneratingMessage={false}
        commitDisabled={false}
        commitTooltip="Complete quiz validation before commit."
        canPush={false}
        onCommitMessageChange={() => undefined}
        onCommit={() => undefined}
        onPush={() => undefined}
        onGenerateMessage={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "commit" })).toHaveAttribute(
      "title",
      "Complete quiz validation before commit."
    );

    rerender(
      <CommitComposer
        branch="main"
        commitMessage=""
        isCommitting={false}
        isPushing={false}
        isGeneratingMessage={false}
        commitDisabled={false}
        canPush={false}
        onCommitMessageChange={() => undefined}
        onCommit={() => undefined}
        onPush={() => undefined}
        onGenerateMessage={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "commit" })).not.toHaveAttribute("title");
  });
});
