import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RepoSummary } from "@diffx/contracts";
import { Topbar } from "./Topbar";

const REPO: RepoSummary = {
  mode: "git",
  repoName: "diffx-webapp",
  branch: "main",
  stagedCount: 0,
  unstagedCount: 0,
  untrackedCount: 0,
  remoteHash: "remote-hash",
};

describe("Topbar", () => {
  it("opens workspace picker when repo name is clicked", () => {
    const onPickWorkspace = vi.fn();

    render(
      <Topbar
        repo={REPO}
        onRefresh={() => undefined}
        onOpenSettings={() => undefined}
        onPickWorkspace={onPickWorkspace}
        quizGateEnabled={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "diffx-webapp" }));

    expect(onPickWorkspace).toHaveBeenCalledTimes(1);
  });
});
