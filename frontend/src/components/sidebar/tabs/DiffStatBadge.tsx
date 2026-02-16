type DiffStatBadgeProps = {
  additions: number | null;
  deletions: number | null;
};

function formatAdditions(additions: number | null): string {
  return additions === null ? "+-" : `+${additions}`;
}

function formatDeletions(deletions: number | null): string {
  return deletions === null ? "--" : `-${deletions}`;
}

export function DiffStatBadge({ additions, deletions }: DiffStatBadgeProps) {
  return (
    <span className="file-row-stats" aria-hidden>
      <span className="file-row-stats-inner">
        <span className="file-row-stat-add">{formatAdditions(additions)}</span>
        <span className="file-row-stat-del">{formatDeletions(deletions)}</span>
      </span>
    </span>
  );
}
