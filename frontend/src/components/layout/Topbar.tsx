import type { RepoSummary } from "@diffx/contracts";

type TopbarProps = {
  repo: RepoSummary;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onPickWorkspace: () => void;
};

export function Topbar({
  repo,
  onRefresh,
  onOpenSettings,
  onPickWorkspace,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="wordmark">DIFFX</span>
        <button className="repo-name repo-name-button" type="button" onClick={onPickWorkspace}>
          {repo.repoName}
        </button>
      </div>

      <div className="topbar-right">
        <button className="hud-button" type="button" onClick={onRefresh}>
          refresh
        </button>
        <button className="hud-button" type="button" onClick={onOpenSettings}>
          settings
        </button>
      </div>
    </header>
  );
}
