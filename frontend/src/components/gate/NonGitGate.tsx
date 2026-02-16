type NonGitGateProps = {
  repoName: string;
};

export function NonGitGate({ repoName }: NonGitGateProps) {
  return (
    <div className="gate-root">
      <div className="gate-card">
        <p className="hud-label">mode</p>
        <h1>Not a Git repository</h1>
        <p>
          <span className="text-bright">{repoName}</span> is missing a .git directory. Open a Git
          repository to continue.
        </p>
      </div>
    </div>
  );
}
