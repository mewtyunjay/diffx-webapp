type StatusBarProps = {
  connected: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  message: {
    tone: "info" | "error";
    text: string;
  } | null;
};

export function StatusBar({
  connected,
  stagedCount,
  unstagedCount,
  untrackedCount,
  message,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className="status-item">
          <span className={connected ? "status-dot status-dot-ok" : "status-dot status-dot-error"} />
          {connected ? "connected" : "disconnected"}
        </span>
        {message?.text ? (
          <span
            className={message.tone === "error" ? "status-message status-message-error" : "status-message"}
            role="status"
            aria-live="polite"
          >
            {message.text}
          </span>
        ) : null}
      </div>

      <div className="statusbar-right">
        <span className="status-item">staged:{stagedCount}</span>
        <span className="status-item">unstaged:{unstagedCount}</span>
        <span className="status-item">untracked:{untrackedCount}</span>
      </div>
    </footer>
  );
}
