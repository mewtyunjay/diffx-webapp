import type { DiffPaneMode, DiffViewMode } from "@diffx/contracts";

type DiffToolbarProps = {
  paneMode: DiffPaneMode;
  onPaneModeChange: (mode: DiffPaneMode) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
};

export function DiffToolbar({
  paneMode,
  onPaneModeChange,
  viewMode,
  onViewModeChange,
}: DiffToolbarProps) {
  return (
    <div className="diff-toolbar">
      <div className="diff-toolbar-group diff-pane-switch">
        <button
          className={paneMode === "diff" ? "hud-button hud-button-active" : "hud-button"}
          type="button"
          onClick={() => onPaneModeChange("diff")}
        >
          diff
        </button>
        <button
          className={paneMode === "quiz" ? "hud-button hud-button-active" : "hud-button"}
          type="button"
          onClick={() => onPaneModeChange("quiz")}
        >
          quiz
        </button>
      </div>

      <div className="diff-toolbar-spacer" />

      {paneMode === "diff" ? (
        <div className="diff-toolbar-group diff-mode-switch">
          <button
            className={viewMode === "split" ? "hud-button hud-button-active" : "hud-button"}
            type="button"
            onClick={() => onViewModeChange("split")}
          >
            split
          </button>
          <button
            className={viewMode === "unified" ? "hud-button hud-button-active" : "hud-button"}
            type="button"
            onClick={() => onViewModeChange("unified")}
          >
            unified
          </button>
        </div>
      ) : null}
    </div>
  );
}
