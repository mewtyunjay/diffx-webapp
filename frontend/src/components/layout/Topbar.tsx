import type { RepoSummary } from "@diffx/contracts";

type TopbarProps = {
  repo: RepoSummary;
  onRefresh: () => void;
};

export function Topbar({ repo, onRefresh }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="wordmark">DIFFX</span>
        <span className="repo-name">{repo.repoName}</span>
      </div>

      <div className="topbar-center">
        {repo.mode === "git" ? <span className="chip">branch:{repo.branch ?? "detached"}</span> : null}
      </div>

      <div className="topbar-right">
        <button className="hud-button" type="button" onClick={onRefresh}>
          refresh
        </button>
      </div>
    </header>
  );
}
