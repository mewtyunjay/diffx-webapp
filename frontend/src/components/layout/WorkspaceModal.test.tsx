import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceModal } from "./WorkspaceModal";

describe("WorkspaceModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits a trimmed path", () => {
    const onSave = vi.fn();

    render(
      <WorkspaceModal
        open
        currentPath="/Users/example/current"
        isLoadingPath={false}
        isSaving={false}
        error={null}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Open folder path"), {
      target: { value: "  /Users/example/next  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "open folder" }));

    expect(onSave).toHaveBeenCalledWith("/Users/example/next");
  });

  it("blocks save when path is empty", () => {
    const onSave = vi.fn();

    render(
      <WorkspaceModal
        open
        currentPath=""
        isLoadingPath={false}
        isSaving={false}
        error={null}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "open folder" }));

    expect(screen.getByText("Folder path is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
