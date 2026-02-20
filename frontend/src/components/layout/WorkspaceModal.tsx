import { useEffect, useState } from "react";

type WorkspaceModalProps = {
  open: boolean;
  currentPath: string;
  isLoadingPath: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (repoRoot: string) => void;
};

export function WorkspaceModal({
  open,
  currentPath,
  isLoadingPath,
  isSaving,
  error,
  onClose,
  onSave,
}: WorkspaceModalProps) {
  const [pathInput, setPathInput] = useState(currentPath);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPathInput(currentPath);
    setLocalError(null);
  }, [open, currentPath]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Workspace"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <p className="hud-label">workspace</p>
          <button type="button" className="hud-button hud-button-compact" onClick={onClose}>
            close
          </button>
        </div>

        <div className="modal-body workspace-picker-card">
          <div className="workspace-picker-section">
            <span className="settings-label">Current folder</span>
            <code className="workspace-path">
              {isLoadingPath ? "loading workspace..." : currentPath || "workspace unavailable"}
            </code>
          </div>

          <label className="workspace-picker-section" htmlFor="workspace-path-input">
            <span className="settings-label">Open folder path</span>
            <div className="workspace-path-row">
              <input
                id="workspace-path-input"
                className="settings-input workspace-path-input"
                type="text"
                value={pathInput}
                disabled={isSaving}
                onChange={(event) => setPathInput(event.target.value)}
                placeholder="/absolute/path/to/repo"
              />
              <button
                className="hud-button"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  const normalizedPath = pathInput.trim();

                  if (!normalizedPath) {
                    setLocalError("Folder path is required.");
                    return;
                  }

                  setLocalError(null);
                  onSave(normalizedPath);
                }}
              >
                {isSaving ? "opening..." : "open folder"}
              </button>
            </div>
          </label>

          <p className="settings-meta">Enter an absolute folder path on your machine.</p>
          {localError ? <p className="error-note workspace-picker-error">{localError}</p> : null}
          {error ? <p className="error-note workspace-picker-error">{error}</p> : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="hud-button" onClick={onClose}>
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
