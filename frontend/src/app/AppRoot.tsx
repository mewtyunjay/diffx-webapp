import { useQuery } from "@tanstack/react-query";
import { getRepoSummary } from "../services/api/repo";
import { queryKeys } from "../services/query-keys";
import { NonGitGate } from "../components/gate/NonGitGate";
import { AppShell } from "../components/layout/AppShell";

export function AppRoot() {
  const repoQuery = useQuery({
    queryKey: queryKeys.repo,
    queryFn: getRepoSummary,
    retry: 1,
  });

  if (repoQuery.isPending) {
    return (
      <div className="gate-root">
        <p className="inline-note">Bootstrapping repository context...</p>
      </div>
    );
  }

  if (repoQuery.isError) {
    return (
      <div className="gate-root">
        <p className="error-note">Unable to load repository metadata.</p>
      </div>
    );
  }

  if (repoQuery.data.mode === "non-git") {
    return <NonGitGate repoName={repoQuery.data.repoName} />;
  }

  return <AppShell initialRepo={repoQuery.data} />;
}
