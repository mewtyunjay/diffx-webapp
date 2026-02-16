type StatusBarProps = {
  connected: boolean;
  stagedCount: number;
  unstagedCount: number;
  selectedPath: string | null;
};

export function StatusBar({ connected, stagedCount, unstagedCount, selectedPath }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="status-item">
        <span className={connected ? "status-dot status-dot-ok" : "status-dot status-dot-error"} />
        {connected ? "connected" : "disconnected"}
      </span>
      <span className="status-item">staged:{stagedCount}</span>
      <span className="status-item">unstaged:{unstagedCount}</span>
      <span className="status-item status-path">{selectedPath ?? "no file selected"}</span>
    </footer>
  );
}
