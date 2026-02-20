import { useQuery } from "@tanstack/react-query";
import { getRepoSummary } from "../services/api/repo";
import { toUiError } from "../services/api/error-ui";
import { queryKeys } from "../services/query-keys";
import { AppShell } from "../components/layout/AppShell";

export function AppRoot() {
  const repoQuery = useQuery({
    queryKey: queryKeys.repo,
    queryFn: getRepoSummary,
    retry: 1,
  });

  const repoError = repoQuery.isError
    ? toUiError(repoQuery.error, "Unable to load repository metadata.")
    : null;

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
        <div className="inline-error-block">
          <p className="error-note">{repoError?.message ?? "Unable to load repository metadata."}</p>
          {repoError?.retryable ? (
            <button className="hud-button hud-button-compact" type="button" onClick={() => void repoQuery.refetch()}>
              retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <AppShell initialRepo={repoQuery.data} />;
}
