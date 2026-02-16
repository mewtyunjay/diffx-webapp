import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangedFile,
  ChangedFileStatus,
  DiffScope,
  DiffSummaryResponse,
  DiffViewMode,
  RepoSummary,
} from "@diffx/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commitChanges, stageFile, stageManyFiles, unstageFile } from "../../services/api/actions";
import { getDiffSummary } from "../../services/api/diff";
import { toUiError } from "../../services/api/error-ui";
import { getChangedFiles } from "../../services/api/files";
import { getHealth } from "../../services/api/health";
import { getRepoSummary } from "../../services/api/repo";
import { queryKeys } from "../../services/query-keys";
import { DiffPanel } from "../diff/DiffPanel";
import { NonGitGate } from "../gate/NonGitGate";
import { SidebarShell } from "../sidebar/SidebarShell";
import type { SidebarTabId } from "../sidebar/tabRegistry";
import { StatusBar } from "./StatusBar";
import { Topbar } from "./Topbar";

type AppShellProps = {
  initialRepo: RepoSummary;
};

type PendingFileMutation = "stage" | "unstage";

const STATUS_PRIORITY: Record<ChangedFileStatus, number> = {
  staged: 0,
  unstaged: 1,
  untracked: 2,
};

function sortChangedFiles(files: ChangedFile[]): ChangedFile[] {
  return [...files].sort((left, right) => {
    const statusDelta = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
    if (statusDelta !== 0) return statusDelta;
    return left.path.localeCompare(right.path);
  });
}

function dedupeChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const seen = new Set<string>();
  const unique: ChangedFile[] = [];

  for (const file of files) {
    const key = `${file.status}:${file.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }

  return unique;
}

function toRepoCounts(files: ChangedFile[]): Pick<RepoSummary, "stagedCount" | "unstagedCount" | "untrackedCount"> {
  return {
    stagedCount: files.filter((file) => file.status === "staged").length,
    unstagedCount: files.filter((file) => file.status === "unstaged").length,
    untrackedCount: files.filter((file) => file.status === "untracked").length,
  };
}

function syncRepoCounts(repo: RepoSummary, files: ChangedFile[]): RepoSummary {
  if (repo.mode !== "git") return repo;
  return {
    ...repo,
    ...toRepoCounts(files),
  };
}

function applyStageTransition(files: ChangedFile[], path: string): ChangedFile[] {
  const next = files.filter(
    (file) => !(file.path === path && (file.status === "unstaged" || file.status === "untracked")),
  );

  next.push({ path, status: "staged" });
  return sortChangedFiles(dedupeChangedFiles(next));
}

function applyStageManyTransition(files: ChangedFile[], paths: string[]): ChangedFile[] {
  const pathSet = new Set(paths);
  const next = files.filter(
    (file) => !(pathSet.has(file.path) && (file.status === "unstaged" || file.status === "untracked")),
  );

  for (const path of pathSet) {
    next.push({ path, status: "staged" });
  }

  return sortChangedFiles(dedupeChangedFiles(next));
}

function inferUnstageTargetStatus(
  files: ChangedFile[],
  path: string,
  stagedDiff: DiffSummaryResponse | undefined,
): ChangedFileStatus {
  if (files.some((file) => file.path === path && file.status === "unstaged")) {
    return "unstaged";
  }

  if (files.some((file) => file.path === path && file.status === "untracked")) {
    return "untracked";
  }

  if (stagedDiff?.file?.oldPath === null) {
    return "untracked";
  }

  return "unstaged";
}

function applyUnstageTransition(
  files: ChangedFile[],
  path: string,
  targetStatus: ChangedFileStatus,
): ChangedFile[] {
  const next = files.filter((file) => !(file.path === path && file.status === "staged"));
  next.push({ path, status: targetStatus });
  return sortChangedFiles(dedupeChangedFiles(next));
}

function copyDiffCache(source: DiffSummaryResponse | undefined): DiffSummaryResponse | undefined {
  if (!source) return undefined;

  return {
    mode: source.mode,
    file: source.file
      ? {
          ...source.file,
          stats: { ...source.file.stats },
        }
      : null,
  };
}

function toScope(file: ChangedFile | null): DiffScope | null {
  if (!file) return null;
  return file.status === "staged" ? "staged" : "unstaged";
}

export function AppShell({ initialRepo }: AppShellProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTabId>("files");
  const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>("split");
  const [pendingMutationsByPath, setPendingMutationsByPath] = useState<Map<string, PendingFileMutation>>(
    () => new Map(),
  );

  const pendingMutationsByPathRef = useRef<Map<string, PendingFileMutation>>(new Map());

  function setPendingMutationsSnapshot(next: Map<string, PendingFileMutation>) {
    pendingMutationsByPathRef.current = next;
    setPendingMutationsByPath(next);
  }

  function beginPendingMutations(paths: string[], mutation: PendingFileMutation): string[] {
    const uniquePaths = [...new Set(paths)];
    const next = new Map(pendingMutationsByPathRef.current);
    const acceptedPaths: string[] = [];

    for (const path of uniquePaths) {
      if (next.has(path)) continue;
      next.set(path, mutation);
      acceptedPaths.push(path);
    }

    if (acceptedPaths.length > 0) {
      setPendingMutationsSnapshot(next);
    }

    return acceptedPaths;
  }

  function endPendingMutations(paths: string[]) {
    const uniquePaths = [...new Set(paths)];
    const next = new Map(pendingMutationsByPathRef.current);
    let changed = false;

    for (const path of uniquePaths) {
      changed = next.delete(path) || changed;
    }

    if (changed) {
      setPendingMutationsSnapshot(next);
    }
  }

  function beginPendingMutation(path: string, mutation: PendingFileMutation): boolean {
    return beginPendingMutations([path], mutation).length > 0;
  }

  function endPendingMutation(path: string) {
    endPendingMutations([path]);
  }

  const repoQuery = useQuery({
    queryKey: queryKeys.repo,
    queryFn: ({ signal }) => getRepoSummary({ signal }),
    initialData: initialRepo,
    refetchInterval: 15000,
  });

  const filesQuery = useQuery({
    queryKey: queryKeys.files,
    queryFn: ({ signal }) => getChangedFiles({ signal }),
    refetchInterval: 15000,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth({ signal }),
    refetchInterval: 15000,
    retry: 1,
  });

  const files = filesQuery.data ?? [];

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile(null);
      return;
    }

    if (!selectedFile) {
      setSelectedFile(files[0]);
      return;
    }

    const stillExists = files.some(
      (entry) => entry.path === selectedFile.path && entry.status === selectedFile.status,
    );

    if (!stillExists) {
      setSelectedFile(files[0]);
    }
  }, [files, selectedFile]);

  const selectedScope = useMemo(() => toScope(selectedFile), [selectedFile]);

  const diffQuery = useQuery({
    queryKey:
      selectedFile && selectedScope
        ? queryKeys.diff(selectedFile.path, selectedScope, 3)
        : ["diff", "none"],
    queryFn: async ({ signal }) =>
      await getDiffSummary(
        {
          path: selectedFile!.path,
          scope: selectedScope!,
          contextLines: 3,
        },
        { signal },
      ),
    enabled: Boolean(selectedFile && selectedScope),
  });

  const selectedIndex = selectedFile
    ? files.findIndex((entry) => entry.path === selectedFile.path && entry.status === selectedFile.status)
    : -1;

  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < files.length - 1;
  const fileChangeCountLabel = files.length === 0 ? "0/0" : `${Math.max(selectedIndex + 1, 0)}/${files.length}`;

  const repo = repoQuery.data ?? initialRepo;

  async function cancelFileMutationQueriesForPaths(paths: string[]) {
    const uniquePaths = [...new Set(paths)];

    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.files }),
      queryClient.cancelQueries({ queryKey: queryKeys.repo }),
      ...uniquePaths.flatMap((path) => [
        queryClient.cancelQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true }),
      ]),
    ]);
  }

  async function cancelFileMutationQueries(path: string) {
    await cancelFileMutationQueriesForPaths([path]);
  }

  function clearFileMutationContentsForPaths(paths: string[]) {
    const uniquePaths = [...new Set(paths)];

    for (const path of uniquePaths) {
      queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true });
      queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true });
      queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true });
      queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true });
    }
  }

  function clearFileMutationContents(path: string) {
    clearFileMutationContentsForPaths([path]);
  }

  function revalidateAfterFileMutations(paths: string[]) {
    const uniquePaths = [...new Set(paths)];

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repo }),
      queryClient.invalidateQueries({ queryKey: queryKeys.files }),
      ...uniquePaths.flatMap((path) => [
        queryClient.invalidateQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true }),
      ]),
    ]);
  }

  function revalidateAfterFileMutation(path: string) {
    revalidateAfterFileMutations([path]);
  }

  function updateFilesAndRepo(updater: (currentFiles: ChangedFile[]) => ChangedFile[]): ChangedFile[] {
    const currentFiles = queryClient.getQueryData<ChangedFile[]>(queryKeys.files) ?? files;
    const nextFiles = updater(currentFiles);

    queryClient.setQueryData(queryKeys.files, nextFiles);

    const currentRepo = queryClient.getQueryData<RepoSummary>(queryKeys.repo) ?? repo;
    queryClient.setQueryData(queryKeys.repo, syncRepoCounts(currentRepo, nextFiles));

    return nextFiles;
  }

  async function refreshQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repo }),
      queryClient.invalidateQueries({ queryKey: queryKeys.files }),
      queryClient.invalidateQueries({ queryKey: ["diff"] }),
      queryClient.invalidateQueries({ queryKey: ["fileContents"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.health }),
    ]);
  }

  const stageMutation = useMutation({
    mutationFn: async (path: string) => await stageFile({ path }),
    onMutate: async (path) => {
      await cancelFileMutationQueries(path);

      updateFilesAndRepo((currentFiles) => applyStageTransition(currentFiles, path));

      const unstagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "unstaged", 3)),
      );

      if (unstagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "staged", 3), unstagedDiff);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true });
      clearFileMutationContents(path);

      if (selectedFile && selectedFile.path === path) {
        setSelectedFile({ path, status: "staged" });
      }
    },
    onSettled: (_result, _error, path) => {
      endPendingMutation(path);
      revalidateAfterFileMutation(path);
    },
  });

  const stageManyMutation = useMutation({
    mutationFn: async (paths: string[]) => await stageManyFiles({ paths }),
    onMutate: async (paths) => {
      const uniquePaths = [...new Set(paths)];
      const pathSet = new Set(uniquePaths);

      await cancelFileMutationQueriesForPaths(uniquePaths);
      updateFilesAndRepo((currentFiles) => applyStageManyTransition(currentFiles, uniquePaths));

      for (const path of uniquePaths) {
        const unstagedDiff = copyDiffCache(
          queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "unstaged", 3)),
        );

        if (unstagedDiff) {
          queryClient.setQueryData(queryKeys.diff(path, "staged", 3), unstagedDiff);
        }

        queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true });
      }

      clearFileMutationContentsForPaths(uniquePaths);

      if (selectedFile && pathSet.has(selectedFile.path)) {
        setSelectedFile({ path: selectedFile.path, status: "staged" });
      }
    },
    onSettled: (_result, _error, paths) => {
      endPendingMutations(paths);
      revalidateAfterFileMutations(paths);
    },
  });

  const unstageMutation = useMutation({
    mutationFn: async (path: string) => await unstageFile({ path }),
    onMutate: async (path) => {
      await cancelFileMutationQueries(path);

      const stagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "staged", 3)),
      );

      const nextFiles = updateFilesAndRepo((currentFiles) => {
        const targetStatus = inferUnstageTargetStatus(currentFiles, path, stagedDiff);
        return applyUnstageTransition(currentFiles, path, targetStatus);
      });

      if (stagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "unstaged", 3), stagedDiff);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true });
      clearFileMutationContents(path);

      if (
        selectedFile &&
        selectedFile.path === path &&
        selectedFile.status === "staged"
      ) {
        const matching = nextFiles.find((file) => file.path === path && file.status !== "staged");
        setSelectedFile(matching ?? null);
      }
    },
    onSettled: (_result, _error, path) => {
      endPendingMutation(path);
      revalidateAfterFileMutation(path);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => await commitChanges({ message }),
    onSuccess: async () => {
      await refreshQueries();
    },
  });

  function requestStage(path: string) {
    if (!beginPendingMutation(path, "stage")) {
      return;
    }

    stageMutation.mutate(path);
  }

  function requestUnstage(path: string) {
    if (!beginPendingMutation(path, "unstage")) {
      return;
    }

    unstageMutation.mutate(path);
  }

  function requestStageMany(paths: string[]) {
    const acceptedPaths = beginPendingMutations(paths, "stage");
    if (acceptedPaths.length === 0) {
      return;
    }

    stageManyMutation.mutate(acceptedPaths);
  }

  function requestUnstageMany(paths: string[]) {
    const uniquePaths = [...new Set(paths)];

    for (const path of uniquePaths) {
      requestUnstage(path);
    }
  }

  if (repo.mode === "non-git") {
    return <NonGitGate repoName={repo.repoName} />;
  }

  return (
    <div className="app-shell">
      <Topbar repo={repo} onRefresh={() => void refreshQueries()} />

      <main className="workspace">
        <DiffPanel
          selectedFile={selectedFile}
          scope={selectedScope}
          fileChangeCountLabel={fileChangeCountLabel}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPreviousFile={() => {
            if (!canGoPrevious) return;
            setSelectedFile(files[selectedIndex - 1]);
          }}
          onNextFile={() => {
            if (!canGoNext) return;
            setSelectedFile(files[selectedIndex + 1]);
          }}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          diffQuery={diffQuery}
        />

        <SidebarShell
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          files={files}
          selectedFile={selectedFile}
          isLoadingFiles={filesQuery.isPending}
          filesError={filesQuery.isError ? toUiError(filesQuery.error).message : null}
          pendingMutationsByPath={pendingMutationsByPath}
          stagedCount={repo.stagedCount}
          isCommitting={commitMutation.isPending}
          onSelectFile={setSelectedFile}
          onStageFile={requestStage}
          onUnstageFile={requestUnstage}
          onStageFiles={requestStageMany}
          onUnstageFiles={requestUnstageMany}
          onCommitChanges={(message) => commitMutation.mutate(message)}
        />
      </main>

      <StatusBar
        connected={!healthQuery.isError && healthQuery.data?.ok === true}
        stagedCount={repo.stagedCount}
        unstagedCount={repo.unstagedCount}
        untrackedCount={repo.untrackedCount}
      />
    </div>
  );
}
