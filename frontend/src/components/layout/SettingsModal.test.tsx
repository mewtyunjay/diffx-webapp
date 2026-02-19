import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@diffx/contracts";
import { SettingsModal } from "./SettingsModal";

const DEFAULT_SETTINGS: AppSettings = {
  quiz: {
    gateEnabled: false,
    questionCount: 4,
    scope: "staged",
    validationMode: "answer_all",
    scoreThreshold: null,
    providerPreference: "auto",
  },
};

describe("SettingsModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders custom segmented controls and saves quiz settings", () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        open
        settings={DEFAULT_SETTINGS}
        isSaving={false}
        error={null}
        providerStatuses={[]}
        isLoadingProviders={false}
        providersError={null}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /enabled|disabled/i }));
    fireEvent.change(screen.getByLabelText("Question count"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("radio", { name: "all changes" }));
    fireEvent.click(screen.getByRole("radio", { name: "score threshold" }));
    fireEvent.click(screen.getByRole("radio", { name: "claude" }));
    fireEvent.change(screen.getByLabelText("Score threshold"), { target: { value: "3" } });

    fireEvent.click(screen.getByRole("button", { name: "save settings" }));

    expect(onSave).toHaveBeenCalledWith({
      quiz: {
        gateEnabled: true,
        questionCount: 5,
        scope: "all_changes",
        validationMode: "score_threshold",
        scoreThreshold: 3,
        providerPreference: "claude",
      },
    });
  });
});
