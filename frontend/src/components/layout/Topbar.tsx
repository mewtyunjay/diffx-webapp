import type { RepoSummary } from "@diffx/contracts";

type TopbarProps = {
  repo: RepoSummary;
  syncState: "idle" | "syncing" | "error";
  onRefresh: () => void;
};

function syncLabel(syncState: TopbarProps["syncState"]): string {
  if (syncState === "syncing") return "syncing";
  if (syncState === "error") return "degraded";
  return "idle";
}

export function Topbar({ repo, syncState, onRefresh }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="wordmark">DIFFX</span>
        <span className="repo-name">{repo.repoName}</span>
      </div>

      <div className="topbar-center">
        {repo.mode === "git" ? <span className="chip">branch:{repo.branch ?? "detached"}</span> : null}
        <span className="chip">staged:{repo.stagedCount}</span>
        <span className="chip">unstaged:{repo.unstagedCount}</span>
        <span className="chip">untracked:{repo.untrackedCount}</span>
      </div>

      <div className="topbar-right">
        <span className="chip">sync:{syncLabel(syncState)}</span>
        <button className="hud-button" type="button" onClick={onRefresh}>
          refresh
        </button>
      </div>
    </header>
  );
}
