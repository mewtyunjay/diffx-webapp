import type { DiffViewMode } from "@diffx/contracts";

type DiffToolbarProps = {
  selectedPath: string | null;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onPreviousFile: () => void;
  onNextFile: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

export function DiffToolbar({
  selectedPath,
  viewMode,
  onViewModeChange,
  onPreviousFile,
  onNextFile,
  canGoPrevious,
  canGoNext,
}: DiffToolbarProps) {
  return (
    <div className="diff-toolbar">
      <div className="diff-toolbar-group">
        <button className="hud-button" type="button" disabled={!canGoPrevious} onClick={onPreviousFile}>
          prev
        </button>
        <button className="hud-button" type="button" disabled={!canGoNext} onClick={onNextFile}>
          next
        </button>
      </div>

      <div className="diff-toolbar-path">{selectedPath ?? "select a file to inspect"}</div>

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
