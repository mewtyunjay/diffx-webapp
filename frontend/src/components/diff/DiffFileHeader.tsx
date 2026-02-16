type DiffFileHeaderProps = {
  path: string;
  oldPath: string | null;
  newPath: string | null;
  additions: number;
  deletions: number;
};

function toExtensionBadge(path: string): string {
  const normalized = path.trim();
  if (!normalized) return "FILE";

  const fileName = normalized.split("/").at(-1) ?? normalized;
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return "FILE";
  }

  const extension = fileName.slice(lastDot + 1).toUpperCase();
  if (extension.length <= 4) return extension;
  return extension.slice(0, 4);
}

export function DiffFileHeader({
  path,
  oldPath,
  newPath,
  additions,
  deletions,
}: DiffFileHeaderProps) {
  const resolvedPath = newPath ?? oldPath ?? path;
  const extensionBadge = toExtensionBadge(resolvedPath);

  return (
    <div className="diff-file-header" role="status" aria-label="Current diff file metadata">
      <div className="diff-file-left">
        <span className="diff-ext-badge">{extensionBadge}</span>
        <span className="diff-file-name">{resolvedPath}</span>
      </div>

      <div className="diff-file-stats">
        <span className="diff-file-del">-{deletions}</span>
        <span className="diff-file-add">+{additions}</span>
      </div>
    </div>
  );
}
