type StatusBarProps = {
  connected: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
};

export function StatusBar({
  connected,
  stagedCount,
  unstagedCount,
  untrackedCount,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className="status-item">
          <span className={connected ? "status-dot status-dot-ok" : "status-dot status-dot-error"} />
          {connected ? "connected" : "disconnected"}
        </span>
      </div>

      <div className="statusbar-right">
        <span className="status-item">staged:{stagedCount}</span>
        <span className="status-item">unstaged:{unstagedCount}</span>
        <span className="status-item">untracked:{untrackedCount}</span>
      </div>
    </footer>
  );
}
