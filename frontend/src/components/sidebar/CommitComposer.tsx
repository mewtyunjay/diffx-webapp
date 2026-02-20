type CommitComposerMessage = {
  tone: "info" | "error";
  text: string;
} | null;

type CommitComposerProps = {
  repoName: string;
  branch: string | null;
  commitMessage: string;
  isCommitting: boolean;
  isPushing: boolean;
  isGeneratingMessage: boolean;
  commitDisabled: boolean;
  canPush: boolean;
  message: CommitComposerMessage;
  onCommitMessageChange: (message: string) => void;
  onCommit: (message: string) => void;
  onPush: () => void;
  onGenerateMessage: () => void;
};

export function CommitComposer({
  repoName,
  branch,
  commitMessage,
  isCommitting,
  isPushing,
  isGeneratingMessage,
  commitDisabled,
  canPush,
  message,
  onCommitMessageChange,
  onCommit,
  onPush,
  onGenerateMessage,
}: CommitComposerProps) {
  const pushDisabled = !canPush || isCommitting || isPushing;

  return (
    <section className="commit-composer" aria-label="Commit composer">
      <p className="commit-composer-repo">{repoName} / {branch ?? "detached"}</p>

      <div className="commit-composer-input-shell">
        <textarea
          className="commit-composer-input"
          rows={3}
          value={commitMessage}
          onChange={(event) => onCommitMessageChange(event.target.value)}
          placeholder="describe why this change exists"
        />
        <button
          type="button"
          className="commit-composer-generate"
          title="Generate commit message (Codex 5.3 spark)"
          aria-label="Generate commit message (Codex 5.3 spark)"
          disabled={isGeneratingMessage || isCommitting || isPushing}
          onClick={onGenerateMessage}
        >
          {isGeneratingMessage ? (
            "..."
          ) : (
            <svg
              className="commit-composer-generate-icon"
              viewBox="0 0 16 16"
              role="presentation"
              aria-hidden="true"
            >
              <path
                d="M8 1.5 9.2 5.1 12.5 6.3 9.2 7.5 8 11.1 6.8 7.5 3.5 6.3 6.8 5.1 8 1.5Z"
                fill="currentColor"
              />
              <path
                d="M12.4 9.6 13.1 11.3 14.8 12 13.1 12.7 12.4 14.4 11.7 12.7 10 12 11.7 11.3 12.4 9.6Z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="commit-composer-actions">
        <button
          className="hud-button"
          type="button"
          disabled={commitDisabled}
          onClick={() => onCommit(commitMessage)}
        >
          {isCommitting ? "committing..." : "commit"}
        </button>
        <button
          className="hud-button commit-composer-push"
          type="button"
          disabled={pushDisabled}
          onClick={onPush}
        >
          {isPushing ? "pushing..." : "push"}
        </button>
      </div>

      {message?.text ? (
        <p className={message.tone === "error" ? "error-note" : "inline-note"}>{message.text}</p>
      ) : null}
    </section>
  );
}
