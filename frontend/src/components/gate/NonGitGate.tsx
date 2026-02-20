type NonGitGateProps = {
  repoName: string;
  onPickFolder?: () => void;
  onEnterPath?: () => void;
  isPicking?: boolean;
};

export function NonGitGate({
  repoName,
  onPickFolder,
  onEnterPath,
  isPicking = false,
}: NonGitGateProps) {
  return (
    <div className="gate-root">
      <div className="gate-card">
        <p className="hud-label">mode</p>
        <h1>Not a Git repository</h1>
        <p>
          {onPickFolder ? (
            <button
              className="repo-name repo-name-button"
              type="button"
              onClick={onPickFolder}
              disabled={isPicking}
            >
              {repoName}
            </button>
          ) : (
            <span className="text-bright">{repoName}</span>
          )}{" "}
          is missing a .git directory. Open a Git repository to continue.
        </p>
        {onPickFolder ? (
          <div className="workspace-picker-section">
            <button className="hud-button" type="button" onClick={onPickFolder} disabled={isPicking}>
              {isPicking ? "opening..." : "choose another folder"}
            </button>
            {onEnterPath ? (
              <button className="hud-button" type="button" onClick={onEnterPath} disabled={isPicking}>
                enter path manually
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
