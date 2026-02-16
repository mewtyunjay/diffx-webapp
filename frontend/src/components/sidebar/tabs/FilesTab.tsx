import { useMemo } from "react";
import type { ChangedFile, ChangedFileStatus, DiffScope } from "@diffx/contracts";
import { useQueries } from "@tanstack/react-query";
import { getDiffSummary } from "../../../services/api/diff";
import { queryKeys } from "../../../services/query-keys";

type FilesTabProps = {
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  onSelectFile: (file: ChangedFile) => void;
};

const STATUS_ORDER: ChangedFileStatus[] = ["staged", "unstaged", "untracked"];

function toDiffScope(status: ChangedFileStatus): DiffScope {
  return status === "staged" ? "staged" : "unstaged";
}

function fileKey(file: ChangedFile): string {
  return `${file.status}:${file.path}`;
}

function statusLabel(status: ChangedFileStatus): string {
  if (status === "staged") return "staged";
  if (status === "unstaged") return "unstaged";
  return "untracked";
}

export function FilesTab({ files, selectedFile, onSelectFile }: FilesTabProps) {
  const diffQueries = useQueries({
    queries: files.map((file) => {
      const scope = toDiffScope(file.status);
      return {
        queryKey: queryKeys.diff(file.path, scope, 3),
        queryFn: async () =>
          await getDiffSummary({
            path: file.path,
            scope,
            contextLines: 3,
          }),
        staleTime: 15000,
      };
    }),
  });

  const statsByFile = useMemo(() => {
    const map = new Map<string, { additions: number; deletions: number } | null>();

    files.forEach((file, index) => {
      const query = diffQueries[index];
      const diffFile = query.data?.file;

      if (diffFile) {
        map.set(fileKey(file), {
          additions: diffFile.stats.additions,
          deletions: diffFile.stats.deletions,
        });
      } else {
        map.set(fileKey(file), null);
      }
    });

    return map;
  }, [diffQueries, files]);

  if (files.length === 0) {
    return <p className="empty-state">No changed files.</p>;
  }

  return (
    <div className="files-tab">
      {STATUS_ORDER.map((status) => {
        const entries = files.filter((file) => file.status === status);
        if (entries.length === 0) return null;

        return (
          <section key={status} className="file-group">
            <p className="hud-label">
              {statusLabel(status)} ({entries.length})
            </p>

            <ul className="file-list">
              {entries.map((file) => {
                const active =
                  selectedFile?.path === file.path && selectedFile.status === file.status;
                const stats = statsByFile.get(fileKey(file));

                return (
                  <li key={`${file.status}:${file.path}`}>
                    <button
                      type="button"
                      className={active ? "file-row file-row-active" : "file-row"}
                      onClick={() => onSelectFile(file)}
                    >
                      <span className="file-row-stats" aria-hidden>
                        <span className="file-row-stat-add">+{stats?.additions ?? "-"}</span>
                        <span className="file-row-stat-del">-{stats?.deletions ?? "-"}</span>
                      </span>
                      <span className="file-row-name">{file.path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
