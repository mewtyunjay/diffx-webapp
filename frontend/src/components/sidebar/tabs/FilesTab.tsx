import { useMemo, useState } from "react";
import type { ChangedFile, ChangedFileStatus, DiffScope, DiffSummaryResponse } from "@diffx/contracts";
import { useQueries } from "@tanstack/react-query";
import { getDiffSummary } from "../../../services/api/diff";
import { queryKeys } from "../../../services/query-keys";
import { DiffStatBadge } from "./DiffStatBadge";

type FilesTabProps = {
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  onSelectFile: (file: ChangedFile) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (paths: string[]) => void;
  onUnstageFiles: (paths: string[]) => void;
  pendingMutationsByPath: ReadonlyMap<string, "stage" | "unstage">;
  stagedCount: number;
  isCommitting: boolean;
  onCommitChanges: (message: string) => void;
};

const STATUS_ORDER: ChangedFileStatus[] = ["staged", "unstaged", "untracked"];
const MAX_DISPLAY_PATH_CHARS = 32;

type PathToken = {
  key: string;
  path: string;
  segments: string[];
};

function splitPathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function basenameFromSegments(segments: string[], fallback: string): string {
  return segments[segments.length - 1] ?? fallback;
}

function getSuffix(segments: string[], depth: number): string {
  return segments.slice(Math.max(segments.length - depth, 0)).join("/");
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 7) return text.slice(0, maxChars);

  const available = maxChars - 3;
  const left = Math.max(4, Math.floor(available * 0.35));
  const right = Math.max(3, available - left);

  return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}

function buildDisplayPathMap(files: ChangedFile[]): Map<string, string> {
  const byBasename = new Map<string, PathToken[]>();

  for (const file of files) {
    const key = fileKey(file);
    const segments = splitPathSegments(file.path);
    const token: PathToken = { key, path: file.path, segments };
    const basename = basenameFromSegments(segments, file.path);
    const bucket = byBasename.get(basename) ?? [];
    bucket.push(token);
    byBasename.set(basename, bucket);
  }

  const displayMap = new Map<string, string>();

  for (const group of byBasename.values()) {
    if (group.length === 1) {
      const only = group[0];
      const basename = basenameFromSegments(only.segments, only.path);
      displayMap.set(only.key, truncateMiddle(basename, MAX_DISPLAY_PATH_CHARS));
      continue;
    }

    for (const item of group) {
      const maxDepth = item.segments.length;
      let candidate = item.path;

      for (let depth = 2; depth <= maxDepth; depth += 1) {
        const suffix = getSuffix(item.segments, depth);
        const hasCollision = group.some((other) => {
          if (other.key === item.key) return false;
          return getSuffix(other.segments, depth) === suffix;
        });

        if (!hasCollision) {
          candidate = suffix;
          break;
        }
      }

      displayMap.set(item.key, truncateMiddle(candidate, MAX_DISPLAY_PATH_CHARS));
    }
  }

  return displayMap;
}

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

export function FilesTab({
  files,
  selectedFile,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  pendingMutationsByPath,
  stagedCount,
  isCommitting,
  onCommitChanges,
}: FilesTabProps) {
  const [commitMessage, setCommitMessage] = useState("");

  const diffQueries = useQueries({
    queries: files.map((file) => {
      const scope = toDiffScope(file.status);
      return {
        queryKey: queryKeys.diff(file.path, scope, 3, file.contentHash),
        queryFn: async ({ signal }) =>
          await getDiffSummary(
            {
              path: file.path,
              scope,
              contextLines: 3,
            },
            { signal },
          ),
        staleTime: 15000,
        placeholderData: (previousData: DiffSummaryResponse | undefined) => previousData,
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

  const displayPathByFile = useMemo(() => buildDisplayPathMap(files), [files]);

  const trimmedCommitMessage = commitMessage.trim();
  const canCommit = trimmedCommitMessage.length > 0 && stagedCount > 0 && !isCommitting;

  return (
    <div className="files-tab">
      <div className="files-list-scroll">
        {files.length === 0 ? <p className="empty-state">No changed files.</p> : null}

        {STATUS_ORDER.map((status) => {
          const entries = files.filter((file) => file.status === status);
          if (entries.length === 0) return null;

          const groupAction = status === "staged" ? "unstage" : "stage";
          const actionablePaths = entries
            .map((file) => file.path)
            .filter((path, index, source) => source.indexOf(path) === index)
            .filter((path) => !pendingMutationsByPath.has(path));

          return (
            <section key={status} className="file-group">
              <div className="file-group-header">
                <p className="hud-label">
                  {statusLabel(status)} ({entries.length})
                </p>

                <button
                  type="button"
                  className="file-group-action"
                  disabled={actionablePaths.length === 0}
                  onClick={() => {
                    if (groupAction === "stage") {
                      onStageFiles(actionablePaths);
                      return;
                    }

                    onUnstageFiles(actionablePaths);
                  }}
                >
                  {groupAction} all
                </button>
              </div>

              <ul className="file-list">
                {entries.map((file) => {
                  const active =
                    selectedFile?.path === file.path && selectedFile.status === file.status;
                  const stats = statsByFile.get(fileKey(file));
                  const isStaged = file.status === "staged";
                  const pendingMutation = pendingMutationsByPath.get(file.path);
                  const actionLabel = pendingMutation
                    ? pendingMutation === "stage"
                      ? "staging..."
                      : "unstaging..."
                    : isStaged
                      ? "-"
                      : "+";

                  return (
                    <li key={`${file.status}:${file.path}`} className={active ? "file-row file-row-active" : "file-row"}>
                      <button
                        type="button"
                        className="file-row-main"
                        onClick={() => onSelectFile(file)}
                        title={file.path}
                      >
                        <DiffStatBadge additions={stats?.additions ?? null} deletions={stats?.deletions ?? null} />
                        <span className="file-row-name">{displayPathByFile.get(fileKey(file)) ?? file.path}</span>
                      </button>

                      <button
                        type="button"
                        className="file-row-action"
                        aria-label={`${pendingMutation ?? (isStaged ? "unstage" : "stage")} ${file.path}`}
                        disabled={Boolean(pendingMutation)}
                        onClick={() => {
                          if (isStaged) {
                            onUnstageFile(file.path);
                            return;
                          }

                          onStageFile(file.path);
                        }}
                      >
                        {actionLabel}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="files-commit-dock">
        <p className="hud-label">commit message</p>

        <div className="files-commit-entry">
          <textarea
            className="files-commit-input"
            rows={2}
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="describe why this change exists"
          />

          <button
            className="hud-button"
            type="button"
            disabled={!canCommit}
            onClick={() => {
              onCommitChanges(trimmedCommitMessage);
              setCommitMessage("");
            }}
          >
            {isCommitting ? "committing..." : "commit"}
          </button>
        </div>
      </div>
    </div>
  );
}
