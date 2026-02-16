import type { DiffViewMode } from "@diffx/contracts";

type DiffToolbarProps = {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
};

export function DiffToolbar({
  viewMode,
  onViewModeChange,
}: DiffToolbarProps) {
  return (
    <div className="diff-toolbar">
      <div className="diff-toolbar-spacer" />

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
    </div>
  );
}
