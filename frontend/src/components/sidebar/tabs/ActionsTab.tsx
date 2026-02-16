import { useState } from "react";
import type { ChangedFile } from "@diffx/contracts";

type ActionsTabProps = {
  selectedFile: ChangedFile | null;
  isMutatingFile: boolean;
  isCommitting: boolean;
  feedback: string | null;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onCommitChanges: (message: string) => void;
};

export function ActionsTab({
  selectedFile,
  isMutatingFile,
  isCommitting,
  feedback,
  onStageFile,
  onUnstageFile,
  onCommitChanges,
}: ActionsTabProps) {
  const [message, setMessage] = useState("");
  const canCommit = message.trim().length > 0 && !isCommitting;

  const canActOnFile = Boolean(selectedFile) && !isMutatingFile;
  const fileActionLabel = selectedFile?.status === "staged" ? "unstage selected" : "stage selected";

  const handleFileAction = () => {
    if (!selectedFile) return;

    if (selectedFile.status === "staged") {
      onUnstageFile(selectedFile.path);
      return;
    }

    onStageFile(selectedFile.path);
  };

  const handleCommit = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onCommitChanges(trimmed);
    setMessage("");
  };

  return (
    <div className="actions-tab">
      <p className="hud-label">selected file</p>
      <p className="selection-value">{selectedFile?.path ?? "none"}</p>

      <button className="hud-button" type="button" disabled={!canActOnFile} onClick={handleFileAction}>
        {fileActionLabel}
      </button>

      <div className="commit-box">
        <p className="hud-label">commit message</p>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="describe why this change exists"
        />
        <button className="hud-button" type="button" disabled={!canCommit} onClick={handleCommit}>
          commit
        </button>
      </div>

      {feedback ? <p className="inline-note">{feedback}</p> : null}
    </div>
  );
}
