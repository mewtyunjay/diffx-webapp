import type { DiffPaneMode, DiffViewMode } from "@diffx/contracts";
import diffSplitIcon from "../../assets/icons/diff-split.svg";
import diffUnifiedIcon from "../../assets/icons/diff-unified.svg";

type DiffToolbarProps = {
  paneMode: DiffPaneMode;
  onPaneModeChange: (mode: DiffPaneMode) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onOpenSettings: () => void;
};

function SplitIcon() {
  return (
    <img className="diff-toolbar-mode-icon diff-toolbar-mode-icon-image" src={diffSplitIcon} alt="" />
  );
}

function UnifiedIcon() {
  return (
    <img className="diff-toolbar-mode-icon diff-toolbar-mode-icon-image" src={diffUnifiedIcon} alt="" />
  );
}

export function DiffToolbar({
  paneMode,
  onPaneModeChange,
  viewMode,
  onViewModeChange,
  onOpenSettings,
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
            className={
              viewMode === "split"
                ? "hud-button diff-view-mode-button hud-button-active"
                : "hud-button diff-view-mode-button"
            }
            type="button"
            aria-label="split"
            title="split"
            onClick={() => onViewModeChange("split")}
          >
            <SplitIcon />
          </button>
          <button
            className={
              viewMode === "unified"
                ? "hud-button diff-view-mode-button hud-button-active"
                : "hud-button diff-view-mode-button"
            }
            type="button"
            aria-label="unified"
            title="unified"
            onClick={() => onViewModeChange("unified")}
          >
            <UnifiedIcon />
          </button>
        </div>
      ) : (
        <div className="diff-toolbar-group diff-mode-switch">
          <button className="hud-button" type="button" onClick={onOpenSettings}>
            settings
          </button>
        </div>
      )}
    </div>
  );
}
