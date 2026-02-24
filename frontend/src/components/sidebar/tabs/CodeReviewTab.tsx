import type { CodeReviewSession, CodeReviewSeverity } from "@diffx/contracts";

type CodeReviewTabProps = {
  session: CodeReviewSession | null;
  isStartingReview: boolean;
  isLoadingSession: boolean;
  streamError: string | null;
  onRunReview: () => void;
};

function severityClassName(severity: CodeReviewSeverity): string {
  if (severity === "critical") return "code-review-severity code-review-severity-critical";
  if (severity === "high") return "code-review-severity code-review-severity-high";
  if (severity === "medium") return "code-review-severity code-review-severity-medium";
  return "code-review-severity code-review-severity-low";
}

function toLocation(path: string, lineStart: number | null, lineEnd: number | null): string {
  if (lineStart === null) {
    return path;
  }

  if (lineEnd === null || lineEnd === lineStart) {
    return `${path}:${lineStart}`;
  }

  return `${path}:${lineStart}-${lineEnd}`;
}

export function CodeReviewTab({
  session,
  isStartingReview,
  isLoadingSession,
  streamError,
  onRunReview,
}: CodeReviewTabProps) {
  const findingCount = session?.findings.length ?? 0;

  return (
    <div className="code-review-tab">
      <div className="code-review-header">
        <p className="hud-label">code review</p>
        <button
          className="hud-button hud-button-compact"
          type="button"
          disabled={isStartingReview}
          onClick={onRunReview}
        >
          {isStartingReview ? "running..." : "run review"}
        </button>
      </div>

      {streamError ? <p className="error-note">{streamError}</p> : null}

      {session ? (
        <div className="code-review-summary" role="status" aria-live="polite">
          <span className="code-review-summary-item">status: {session.status}</span>
          <span className="code-review-summary-item">findings: {findingCount}</span>
          <span className="code-review-summary-item">{session.progress.message}</span>
        </div>
      ) : isLoadingSession ? (
        <p className="inline-note">Loading code review...</p>
      ) : (
        <p className="inline-note">Run code review to scan changed files.</p>
      )}

      {session?.failure ? <p className="error-note">{session.failure.message}</p> : null}

      {session?.findings.length ? (
        <ul className="code-review-findings">
          {session.findings.map((finding) => (
            <li key={finding.id} className="code-review-finding">
              <div className="code-review-finding-top">
                <span className={severityClassName(finding.severity)}>{finding.severity}</span>
                <span className="code-review-type">{finding.type}</span>
              </div>
              <p className="code-review-title">{finding.title}</p>
              <p className="code-review-location">
                {toLocation(finding.path, finding.lineStart, finding.lineEnd)}
              </p>
              <p className="code-review-summary-text">{finding.summary}</p>
            </li>
          ))}
        </ul>
      ) : session?.status === "ready" ? (
        <p className="inline-note">No issues found in the current review run.</p>
      ) : null}
    </div>
  );
}
