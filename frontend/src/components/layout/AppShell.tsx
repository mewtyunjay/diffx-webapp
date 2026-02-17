import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangedFile,
  ChangedFileStatus,
  DiffDetailResponse,
  DiffScope,
  DiffSummaryResponse,
  DiffViewMode,
  RepoSummary,
} from "@diffx/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commitChanges,
  pushChanges,
  stageFile,
  stageManyFiles,
  unstageFile,
  unstageManyFiles,
} from "../../services/api/actions";
import { ApiRequestError } from "../../services/api/client";
import { getDiffDetail } from "../../services/api/diff";
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
type FilesDockMode = "idle" | "push" | "create-upstream";
type FilesDockMessage = {
  tone: "info" | "error";
  text: string;
} | null;
type SelectedFileRef = {
  path: string;
  status: ChangedFileStatus;
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

function getFileMeta(files: ChangedFile[], path: string): { contentHash: string; stats: ChangedFile["stats"] } {
  const match = files.find((file) => file.path === path);

  return {
    contentHash: match?.contentHash ?? "none",
    stats: match?.stats ?? null,
  };
}

function applyStageTransition(files: ChangedFile[], path: string): ChangedFile[] {
  const { contentHash, stats } = getFileMeta(files, path);
  const next = files.filter(
    (file) => !(file.path === path && (file.status === "unstaged" || file.status === "untracked")),
  );

  next.push({ path, status: "staged", contentHash, stats });
  return sortChangedFiles(dedupeChangedFiles(next));
}

function applyStageManyTransition(files: ChangedFile[], paths: string[]): ChangedFile[] {
  const pathSet = new Set(paths);
  const metaByPath = new Map(paths.map((path) => [path, getFileMeta(files, path)]));
  const next = files.filter(
    (file) => !(pathSet.has(file.path) && (file.status === "unstaged" || file.status === "untracked")),
  );

  for (const path of pathSet) {
    const meta = metaByPath.get(path);
    next.push({
      path,
      status: "staged",
      contentHash: meta?.contentHash ?? "none",
      stats: meta?.stats ?? null,
    });
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
  const { contentHash, stats } = getFileMeta(files, path);
  const next = files.filter((file) => !(file.path === path && file.status === "staged"));
  next.push({ path, status: targetStatus, contentHash, stats });
  return sortChangedFiles(dedupeChangedFiles(next));
}

function applyUnstageManyTransition(
  files: ChangedFile[],
  targetStatusByPath: Map<string, ChangedFileStatus>,
): ChangedFile[] {
  const next = files.filter(
    (file) => !(targetStatusByPath.has(file.path) && file.status === "staged"),
  );

  for (const [path, status] of targetStatusByPath) {
    const { contentHash, stats } = getFileMeta(files, path);
    next.push({ path, status, contentHash, stats });
  }

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

function copyDiffDetailCache(source: DiffDetailResponse | undefined): DiffDetailResponse | undefined {
  if (!source) return undefined;

  const copySide = (side: DiffDetailResponse["old"]): DiffDetailResponse["old"] => ({
    file: side.file
      ? {
          ...side.file,
        }
      : null,
    isBinary: side.isBinary,
    tooLarge: side.tooLarge,
    error: side.error,
  });

  return {
    mode: source.mode,
    file: source.file
      ? {
          ...source.file,
          stats: { ...source.file.stats },
        }
      : null,
    old: copySide(source.old),
    new: copySide(source.new),
  };
}

function toScope(file: ChangedFile | null): DiffScope | null {
  if (!file) return null;
  return file.status === "staged" ? "staged" : "unstaged";
}

function toSelectedFileRef(file: Pick<ChangedFile, "path" | "status">): SelectedFileRef {
  return {
    path: file.path,
    status: file.status,
  };
}

export function AppShell({ initialRepo }: AppShellProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTabId>("files");
  const [selectedFileRef, setSelectedFileRef] = useState<SelectedFileRef | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>("split");
  const [filesDockMode, setFilesDockMode] = useState<FilesDockMode>("idle");
  const [filesDockMessage, setFilesDockMessage] = useState<FilesDockMessage>(null);
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

  function resetFilesDockState() {
    setFilesDockMode("idle");
    setFilesDockMessage(null);
  }

  const filesDockAction =
    filesDockMode === "create-upstream"
      ? "create-upstream"
      : filesDockMode === "push"
        ? "push"
        : "commit";

  const repoQuery = useQuery({
    queryKey: queryKeys.repo,
    queryFn: ({ signal }) => getRepoSummary({ signal }),
    initialData: initialRepo,
    refetchInterval: 15000,
  });

  const repo = repoQuery.data ?? initialRepo;
  const filesQueryKey = queryKeys.files;

  const filesQuery = useQuery({
    queryKey: filesQueryKey,
    queryFn: ({ signal }) => getChangedFiles({ signal }),
    placeholderData: (previousData) => previousData,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth({ signal }),
    refetchInterval: 15000,
    retry: 1,
  });

  const files = filesQuery.data ?? [];
  const filesUiError = filesQuery.isError ? toUiError(filesQuery.error) : null;

  const selectedFile = useMemo(() => {
    if (!selectedFileRef) {
      return null;
    }

    return (
      files.find(
        (entry) => entry.path === selectedFileRef.path && entry.status === selectedFileRef.status,
      ) ?? files.find((entry) => entry.path === selectedFileRef.path) ?? null
    );
  }, [files, selectedFileRef]);

  useEffect(() => {
    if (!selectedFileRef) {
      if (files.length > 0) {
        setSelectedFileRef(toSelectedFileRef(files[0]));
      }

      return;
    }

    const exactMatch = files.find(
      (entry) => entry.path === selectedFileRef.path && entry.status === selectedFileRef.status,
    );

    if (exactMatch) {
      return;
    }

    const pathMatch = files.find((entry) => entry.path === selectedFileRef.path);

    if (pathMatch) {
      setSelectedFileRef(toSelectedFileRef(pathMatch));

      return;
    }

    if (files.length === 0 && filesQuery.isFetching) {
      return;
    }

    setSelectedFileRef(files[0] ? toSelectedFileRef(files[0]) : null);
  }, [files, filesQuery.isFetching, selectedFileRef]);

  const selectedScope = useMemo(() => toScope(selectedFile), [selectedFile]);

  const diffDetailQuery = useQuery({
    queryKey:
      selectedFile && selectedScope
        ? queryKeys.diffDetail(selectedFile.path, 3, selectedFile.contentHash)
        : ["diffDetail", "none"],
    queryFn: async ({ signal }) =>
      await getDiffDetail(
        {
          path: selectedFile!.path,
          scope: selectedScope!,
          contextLines: 3,
        },
        { signal },
      ),
    enabled: Boolean(selectedFile && selectedScope),
    placeholderData: (previousData) => previousData,
  });

  const selectedIndex = selectedFile
    ? files.findIndex((entry) => entry.path === selectedFile.path && entry.status === selectedFile.status)
    : -1;

  const resolvedSelectedIndex =
    selectedFile && selectedIndex < 0
      ? files.findIndex((entry) => entry.path === selectedFile.path)
      : selectedIndex;

  const canGoPrevious = resolvedSelectedIndex > 0;
  const canGoNext = resolvedSelectedIndex >= 0 && resolvedSelectedIndex < files.length - 1;
  const fileChangeCountLabel = files.length === 0 ? "0/0" : `${Math.max(resolvedSelectedIndex + 1, 1)}/${files.length}`;

  function getContentHashByPath(path: string): string {
    const currentFiles = queryClient.getQueryData<ChangedFile[]>(filesQueryKey) ?? files;
    return currentFiles.find((file) => file.path === path)?.contentHash ?? "none";
  }

  function getContentHashMap(paths: string[]): Map<string, string> {
    const currentFiles = queryClient.getQueryData<ChangedFile[]>(filesQueryKey) ?? files;
    const map = new Map<string, string>();

    for (const path of paths) {
      map.set(path, currentFiles.find((file) => file.path === path)?.contentHash ?? "none");
    }

    return map;
  }

  async function cancelFileMutationQueriesForPaths(paths: string[]) {
    const uniquePaths = [...new Set(paths)];
    const contentHashByPath = getContentHashMap(uniquePaths);

    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.filesRoot }),
      queryClient.cancelQueries({ queryKey: queryKeys.repo }),
      ...uniquePaths.flatMap((path) => [
        queryClient.cancelQueries({
          queryKey: queryKeys.diff(path, "staged", 3, contentHashByPath.get(path) ?? "none"),
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.diff(path, "unstaged", 3, contentHashByPath.get(path) ?? "none"),
          exact: true,
        }),
        queryClient.cancelQueries({ queryKey: queryKeys.diffDetailPath(path) }),
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
    const contentHashByPath = getContentHashMap(uniquePaths);

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repo }),
      queryClient.invalidateQueries({ queryKey: queryKeys.filesRoot }),
      ...uniquePaths.flatMap((path) => [
        queryClient.invalidateQueries({
          queryKey: queryKeys.diff(path, "staged", 3, contentHashByPath.get(path) ?? "none"),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.diff(path, "unstaged", 3, contentHashByPath.get(path) ?? "none"),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.diffDetailPath(path) }),
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
    const currentFiles = queryClient.getQueryData<ChangedFile[]>(filesQueryKey) ?? files;
    const nextFiles = updater(currentFiles);

    queryClient.setQueryData(filesQueryKey, nextFiles);

    const currentRepo = queryClient.getQueryData<RepoSummary>(queryKeys.repo) ?? repo;
    queryClient.setQueryData(queryKeys.repo, syncRepoCounts(currentRepo, nextFiles));

    return nextFiles;
  }

  async function refreshQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repo }),
      queryClient.invalidateQueries({ queryKey: queryKeys.filesRoot }),
      queryClient.invalidateQueries({ queryKey: ["diff"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.diffDetailRoot }),
      queryClient.invalidateQueries({ queryKey: ["fileContents"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.health }),
    ]);
  }

  const stageMutation = useMutation({
    mutationFn: async (path: string) => await stageFile({ path }),
    onMutate: async (path) => {
      const contentHash = getContentHashByPath(path);
      await cancelFileMutationQueries(path);

      const nextFiles = updateFilesAndRepo((currentFiles) => applyStageTransition(currentFiles, path));

      const unstagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "unstaged", 3, contentHash)),
      );
      const unstagedDiffDetail = copyDiffDetailCache(
        queryClient.getQueryData<DiffDetailResponse>(queryKeys.diffDetail(path, 3, contentHash)),
      );

      if (unstagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "staged", 3, contentHash), unstagedDiff);
      }

      if (unstagedDiffDetail) {
        queryClient.setQueryData(queryKeys.diffDetail(path, 3, contentHash), unstagedDiffDetail);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3, contentHash), exact: true });
      clearFileMutationContents(path);

      if (selectedFile && selectedFile.path === path) {
        const matching = nextFiles.find((file) => file.path === path && file.status === "staged");
        if (matching) {
          setSelectedFileRef(toSelectedFileRef(matching));
        }
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
      const contentHashByPath = getContentHashMap(uniquePaths);

      await cancelFileMutationQueriesForPaths(uniquePaths);
      const nextFiles = updateFilesAndRepo((currentFiles) => applyStageManyTransition(currentFiles, uniquePaths));

      for (const path of uniquePaths) {
        const contentHash = contentHashByPath.get(path) ?? "none";
        const unstagedDiff = copyDiffCache(
          queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "unstaged", 3, contentHash)),
        );
        const unstagedDiffDetail = copyDiffDetailCache(
          queryClient.getQueryData<DiffDetailResponse>(queryKeys.diffDetail(path, 3, contentHash)),
        );

        if (unstagedDiff) {
          queryClient.setQueryData(queryKeys.diff(path, "staged", 3, contentHash), unstagedDiff);
        }

        if (unstagedDiffDetail) {
          queryClient.setQueryData(queryKeys.diffDetail(path, 3, contentHash), unstagedDiffDetail);
        }

        queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3, contentHash), exact: true });
      }

      clearFileMutationContentsForPaths(uniquePaths);

      if (selectedFile && pathSet.has(selectedFile.path)) {
        const matching = nextFiles.find((file) => file.path === selectedFile.path && file.status === "staged");
        if (matching) {
          setSelectedFileRef(toSelectedFileRef(matching));
        }
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
      const contentHash = getContentHashByPath(path);
      await cancelFileMutationQueries(path);

      const stagedDiff = copyDiffCache(
        queryClient.getQueryData<DiffSummaryResponse>(queryKeys.diff(path, "staged", 3, contentHash)),
      );
      const stagedDiffDetail = copyDiffDetailCache(
        queryClient.getQueryData<DiffDetailResponse>(queryKeys.diffDetail(path, 3, contentHash)),
      );

      const nextFiles = updateFilesAndRepo((currentFiles) => {
        const targetStatus = inferUnstageTargetStatus(currentFiles, path, stagedDiff);
        return applyUnstageTransition(currentFiles, path, targetStatus);
      });

      if (stagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "unstaged", 3, contentHash), stagedDiff);
      }

      if (stagedDiffDetail) {
        queryClient.setQueryData(queryKeys.diffDetail(path, 3, contentHash), stagedDiffDetail);
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3, contentHash), exact: true });
      clearFileMutationContents(path);

      if (selectedFile && selectedFile.path === path && selectedFile.status === "staged") {
        const matching = nextFiles.find((file) => file.path === path && file.status !== "staged");
        setSelectedFileRef(matching ? toSelectedFileRef(matching) : null);
      }
    },
    onSettled: (_result, _error, path) => {
      endPendingMutation(path);
      revalidateAfterFileMutation(path);
    },
  });

  const unstageManyMutation = useMutation({
    mutationFn: async (paths: string[]) => await unstageManyFiles({ paths }),
    onMutate: async (paths) => {
      const uniquePaths = [...new Set(paths)];
      const pathSet = new Set(uniquePaths);
      const contentHashByPath = getContentHashMap(uniquePaths);

      await cancelFileMutationQueriesForPaths(uniquePaths);

      const stagedDiffByPath = new Map(
        uniquePaths.map((path) => {
          const contentHash = contentHashByPath.get(path) ?? "none";
          const cached = queryClient.getQueryData<DiffSummaryResponse>(
            queryKeys.diff(path, "staged", 3, contentHash),
          );

          return [path, copyDiffCache(cached)] as const;
        }),
      );

      const stagedDiffDetailByPath = new Map(
        uniquePaths.map((path) => {
          const contentHash = contentHashByPath.get(path) ?? "none";
          const cached = queryClient.getQueryData<DiffDetailResponse>(
            queryKeys.diffDetail(path, 3, contentHash),
          );

          return [path, copyDiffDetailCache(cached)] as const;
        }),
      );

      const nextFiles = updateFilesAndRepo((currentFiles) => {
        const targetStatusByPath = new Map<string, ChangedFileStatus>();

        for (const path of uniquePaths) {
          targetStatusByPath.set(
            path,
            inferUnstageTargetStatus(currentFiles, path, stagedDiffByPath.get(path)),
          );
        }

        return applyUnstageManyTransition(currentFiles, targetStatusByPath);
      });

      for (const path of uniquePaths) {
        const contentHash = contentHashByPath.get(path) ?? "none";
        const stagedDiff = stagedDiffByPath.get(path);
        const stagedDiffDetail = stagedDiffDetailByPath.get(path);

        if (stagedDiff) {
          queryClient.setQueryData(queryKeys.diff(path, "unstaged", 3, contentHash), stagedDiff);
        }

        if (stagedDiffDetail) {
          queryClient.setQueryData(queryKeys.diffDetail(path, 3, contentHash), stagedDiffDetail);
        }

        queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3, contentHash), exact: true });
      }

      clearFileMutationContentsForPaths(uniquePaths);

      if (selectedFile && selectedFile.status === "staged" && pathSet.has(selectedFile.path)) {
        const matching = nextFiles.find(
          (file) => file.path === selectedFile.path && file.status !== "staged",
        );
        setSelectedFileRef(matching ? toSelectedFileRef(matching) : null);
      }
    },
    onSettled: (_result, _error, paths) => {
      endPendingMutations(paths);
      revalidateAfterFileMutations(paths);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => await commitChanges({ message }),
    onMutate: () => {
      setFilesDockMessage(null);
    },
    onSuccess: async () => {
      setFilesDockMode("push");
      setFilesDockMessage(null);
      await refreshQueries();
    },
    onError: (error) => {
      setFilesDockMode("idle");
      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to create commit.").message,
      });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async (createUpstream: boolean) =>
      await pushChanges(createUpstream ? { createUpstream: true } : {}),
    onMutate: () => {
      setFilesDockMessage(null);
    },
    onSuccess: async () => {
      resetFilesDockState();
      await refreshQueries();
    },
    onError: (error, createUpstream) => {
      if (error instanceof ApiRequestError && error.code === "NO_UPSTREAM" && !createUpstream) {
        setFilesDockMode("create-upstream");
        setFilesDockMessage({ tone: "info", text: error.message });
        return;
      }

      setFilesDockMode(createUpstream ? "create-upstream" : "push");
      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to push changes.").message,
      });
    },
  });

  function requestStage(path: string) {
    resetFilesDockState();

    if (!beginPendingMutation(path, "stage")) {
      return;
    }

    stageMutation.mutate(path);
  }

  function requestUnstage(path: string) {
    resetFilesDockState();

    if (!beginPendingMutation(path, "unstage")) {
      return;
    }

    unstageMutation.mutate(path);
  }

  function requestStageMany(paths: string[]) {
    resetFilesDockState();

    const acceptedPaths = beginPendingMutations(paths, "stage");
    if (acceptedPaths.length === 0) {
      return;
    }

    stageManyMutation.mutate(acceptedPaths);
  }

  function requestUnstageMany(paths: string[]) {
    resetFilesDockState();

    const acceptedPaths = beginPendingMutations(paths, "unstage");
    if (acceptedPaths.length === 0) {
      return;
    }

    unstageManyMutation.mutate(acceptedPaths);
  }

  function requestCommit(message: string) {
    setFilesDockMessage(null);
    commitMutation.mutate(message);
  }

  function requestPush(createUpstream: boolean) {
    if (commitMutation.isPending || pushMutation.isPending) {
      return;
    }

    setFilesDockMessage(null);
    pushMutation.mutate(createUpstream);
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
          fileChangeCountLabel={fileChangeCountLabel}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPreviousFile={() => {
            if (!canGoPrevious) return;
            setSelectedFileRef(toSelectedFileRef(files[resolvedSelectedIndex - 1]));
          }}
          onNextFile={() => {
            if (!canGoNext) return;
            setSelectedFileRef(toSelectedFileRef(files[resolvedSelectedIndex + 1]));
          }}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          diffQuery={diffDetailQuery}
        />

        <SidebarShell
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          files={files}
          selectedFile={selectedFile}
          isLoadingFiles={filesQuery.isPending}
          filesError={filesUiError?.message ?? null}
          filesErrorRetryable={filesUiError?.retryable ?? false}
          pendingMutationsByPath={pendingMutationsByPath}
          stagedCount={repo.stagedCount}
          filesDockAction={filesDockAction}
          filesDockMessage={filesDockMessage}
          isCommitting={commitMutation.isPending}
          isPushing={pushMutation.isPending}
          onRetryFiles={() => {
            void filesQuery.refetch();
          }}
          onSelectFile={(file) => {
            setSelectedFileRef(toSelectedFileRef(file));
          }}
          onStageFile={requestStage}
          onUnstageFile={requestUnstage}
          onStageFiles={requestStageMany}
          onUnstageFiles={requestUnstageMany}
          onCommitChanges={requestCommit}
          onPushChanges={requestPush}
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
