import type { CodeReviewFinding, CodeReviewSeverity } from "@diffx/contracts";

const SEVERITY_RANK: Record<CodeReviewSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function findingDedupKey(finding: CodeReviewFinding): string {
  return [
    finding.severity,
    finding.type,
    finding.path.toLowerCase(),
    String(finding.lineStart ?? "none"),
    String(finding.lineEnd ?? "none"),
    finding.title.trim().toLowerCase(),
  ].join("|");
}

export function mergeCodeReviewFindings(
  existing: CodeReviewFinding[],
  incoming: CodeReviewFinding[],
): CodeReviewFinding[] {
  const deduped = new Map<string, CodeReviewFinding>();

  for (const finding of existing) {
    deduped.set(findingDedupKey(finding), finding);
  }

  for (const finding of incoming) {
    const key = findingDedupKey(finding);
    if (!deduped.has(key)) {
      deduped.set(key, finding);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const severityDelta = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (severityDelta !== 0) return severityDelta;

    const pathDelta = left.path.localeCompare(right.path);
    if (pathDelta !== 0) return pathDelta;

    const leftLine = left.lineStart ?? Number.MAX_SAFE_INTEGER;
    const rightLine = right.lineStart ?? Number.MAX_SAFE_INTEGER;
    if (leftLine !== rightLine) return leftLine - rightLine;

    return left.title.localeCompare(right.title);
  });
}
