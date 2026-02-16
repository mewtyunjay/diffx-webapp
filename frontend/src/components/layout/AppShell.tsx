import { useEffect, useMemo, useState } from "react";
import type {
  ChangedFile,
  ChangedFileStatus,
  DiffScope,
  DiffSummaryResponse,
  DiffViewMode,
  RepoSummary,
} from "@diffx/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commitChanges, stageFile, unstageFile } from "../../services/api/actions";
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

type FileMutationContext = {
  previousFiles: ChangedFile[];
  previousRepo: RepoSummary;
  previousSelectedFile: ChangedFile | null;
};

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

function copyDiffCache(
  source: DiffSummaryResponse | undefined,
): DiffSummaryResponse | undefined {
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
  const [feedback, setFeedback] = useState<string | null>(null);

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
      await getDiffSummary({
        path: selectedFile!.path,
        scope: selectedScope!,
        contextLines: 3,
      }, { signal }),
    enabled: Boolean(selectedFile && selectedScope),
  });

  const selectedIndex = selectedFile
    ? files.findIndex((entry) => entry.path === selectedFile.path && entry.status === selectedFile.status)
    : -1;

  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < files.length - 1;

  const repo = repoQuery.data ?? initialRepo;

  async function cancelFileMutationQueries(path: string) {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.files }),
      queryClient.cancelQueries({ queryKey: queryKeys.repo }),
      queryClient.cancelQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true }),
    ]);
  }

  function clearFileMutationContents(path: string) {
    queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true });
    queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true });
    queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true });
    queryClient.removeQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true });
  }

  function restoreFileMutationContext(context: FileMutationContext | undefined) {
    if (!context) return;
    queryClient.setQueryData(queryKeys.files, context.previousFiles);
    queryClient.setQueryData(queryKeys.repo, context.previousRepo);
    setSelectedFile(context.previousSelectedFile);
  }

  function revalidateAfterFileMutation(path: string) {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repo }),
      queryClient.invalidateQueries({ queryKey: queryKeys.files }),
      queryClient.invalidateQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "staged", "old"), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "staged", "new"), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "old"), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.fileContents(path, "unstaged", "new"), exact: true }),
    ]);
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
    onMutate: async (path): Promise<FileMutationContext> => {
      setFeedback(null);
      await cancelFileMutationQueries(path);

      const previousFiles = queryClient.getQueryData<ChangedFile[]>(queryKeys.files) ?? files;
      const previousRepo = queryClient.getQueryData<RepoSummary>(queryKeys.repo) ?? repo;
      const previousSelectedFile = selectedFile;

      const nextFiles = applyStageTransition(previousFiles, path);
      queryClient.setQueryData(queryKeys.files, nextFiles);
      queryClient.setQueryData(queryKeys.repo, syncRepoCounts(previousRepo, nextFiles));

      const unstagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "unstaged", 3)),
      );

      if (unstagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "staged", 3), unstagedDiff);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3), exact: true });
      clearFileMutationContents(path);

      if (previousSelectedFile && previousSelectedFile.path === path) {
        setSelectedFile({ path, status: "staged" });
      }

      return { previousFiles, previousRepo, previousSelectedFile };
    },
    onSuccess: (result) => {
      setFeedback(result.message);
    },
    onError: (error, _path, context) => {
      restoreFileMutationContext(context);
      setFeedback(toUiError(error).message);
    },
    onSettled: (_result, _error, path) => {
      revalidateAfterFileMutation(path);
    },
  });

  const unstageMutation = useMutation({
    mutationFn: async (path: string) => await unstageFile({ path }),
    onMutate: async (path): Promise<FileMutationContext> => {
      setFeedback(null);
      await cancelFileMutationQueries(path);

      const previousFiles = queryClient.getQueryData<ChangedFile[]>(queryKeys.files) ?? files;
      const previousRepo = queryClient.getQueryData<RepoSummary>(queryKeys.repo) ?? repo;
      const previousSelectedFile = selectedFile;

      const stagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "staged", 3)),
      );
      const targetStatus = inferUnstageTargetStatus(previousFiles, path, stagedDiff);
      const nextFiles = applyUnstageTransition(previousFiles, path, targetStatus);

      queryClient.setQueryData(queryKeys.files, nextFiles);
      queryClient.setQueryData(queryKeys.repo, syncRepoCounts(previousRepo, nextFiles));

      if (stagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "unstaged", 3), stagedDiff);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3), exact: true });
      clearFileMutationContents(path);

      if (
        previousSelectedFile &&
        previousSelectedFile.path === path &&
        previousSelectedFile.status === "staged"
      ) {
        setSelectedFile({ path, status: targetStatus });
      }

      return { previousFiles, previousRepo, previousSelectedFile };
    },
    onSuccess: (result) => {
      setFeedback(result.message);
    },
    onError: (error, _path, context) => {
      restoreFileMutationContext(context);
      setFeedback(toUiError(error).message);
    },
    onSettled: (_result, _error, path) => {
      revalidateAfterFileMutation(path);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => await commitChanges({ message }),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshQueries();
    },
    onError: (error) => {
      setFeedback(toUiError(error).message);
    },
  });
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
          isMutatingFile={stageMutation.isPending || unstageMutation.isPending}
          isCommitting={commitMutation.isPending}
          feedback={feedback}
          onSelectFile={setSelectedFile}
          onStageFile={(path) => stageMutation.mutate(path)}
          onUnstageFile={(path) => unstageMutation.mutate(path)}
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
