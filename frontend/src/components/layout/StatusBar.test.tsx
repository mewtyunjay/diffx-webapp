import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders connection state and file counts", () => {
    render(
      <StatusBar
        connected={true}
        stagedCount={2}
        unstagedCount={3}
        untrackedCount={1}
        message={null}
      />,
    );

    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("staged:2")).toBeInTheDocument();
    expect(screen.getByText("unstaged:3")).toBeInTheDocument();
    expect(screen.getByText("untracked:1")).toBeInTheDocument();
  });

  it("renders transient messages next to the connection indicator", () => {
    render(
      <StatusBar
        connected={true}
        stagedCount={0}
        unstagedCount={0}
        untrackedCount={0}
        message={{ tone: "error", text: "Stage at least one file before generating a commit message." }}
      />,
    );

    const message = screen.getByText("Stage at least one file before generating a commit message.");
    const leftCluster = message.closest(".statusbar-left");

    expect(leftCluster).toContainElement(screen.getByText("connected"));
    expect(message).toHaveClass("status-message-error");
  });
});
