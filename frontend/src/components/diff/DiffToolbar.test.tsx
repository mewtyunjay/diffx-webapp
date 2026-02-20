import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffToolbar } from "./DiffToolbar";

describe("DiffToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders split and unified as icon-only buttons with accessible names", () => {
    render(
      <DiffToolbar
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    const splitButton = screen.getByRole("button", { name: "split" });
    const unifiedButton = screen.getByRole("button", { name: "unified" });

    expect(splitButton.querySelector("img")).toBeInTheDocument();
    expect(unifiedButton.querySelector("img")).toBeInTheDocument();
    expect(splitButton).toHaveClass("hud-button-active");
    expect(unifiedButton).not.toHaveClass("hud-button-active");
  });

  it("switches active state and dispatches mode changes", () => {
    const onViewModeChange = vi.fn();
    const { rerender } = render(
      <DiffToolbar
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={onViewModeChange}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "unified" }));
    expect(onViewModeChange).toHaveBeenCalledWith("unified");

    rerender(
      <DiffToolbar
        paneMode="diff"
        onPaneModeChange={() => undefined}
        viewMode="unified"
        onViewModeChange={onViewModeChange}
        onOpenSettings={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "unified" })).toHaveClass("hud-button-active");
    expect(screen.getByRole("button", { name: "split" })).not.toHaveClass("hud-button-active");
  });

  it("keeps settings action in quiz mode and hides view mode buttons", () => {
    const onOpenSettings = vi.fn();

    render(
      <DiffToolbar
        paneMode="quiz"
        onPaneModeChange={() => undefined}
        viewMode="split"
        onViewModeChange={() => undefined}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.queryByRole("button", { name: "split" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "unified" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
