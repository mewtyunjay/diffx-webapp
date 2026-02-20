import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  ChangedFile,
  ChangedFileStatus,
  DiffPaneMode,
  DiffDetailResponse,
  DiffScope,
  DiffSummaryResponse,
  DiffViewMode,
  QuizSession,
  QuizSseEvent,
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
import {
  createQuizSession,
  getQuizProviders,
  getQuizSession,
  openQuizSessionStream,
  submitQuizAnswers,
  validateQuizSession,
} from "../../services/api/quiz";
import { getRepoSummary } from "../../services/api/repo";
import { getSettings, putSettings } from "../../services/api/settings";
import { getWorkspace, pickWorkspace, setWorkspace } from "../../services/api/workspace";
import { queryKeys } from "../../services/query-keys";
import { DiffPanel } from "../diff/DiffPanel";
import { QuizPanel } from "../diff/QuizPanel";
import { NonGitGate } from "../gate/NonGitGate";
import { SidebarShell } from "../sidebar/SidebarShell";
import type { SidebarTabId } from "../sidebar/tabRegistry";
import { SettingsModal } from "./SettingsModal";
import { StatusBar } from "./StatusBar";
import { Topbar } from "./Topbar";
import { WorkspaceModal } from "./WorkspaceModal";

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

const DEFAULT_SETTINGS: AppSettings = {
  quiz: {
    gateEnabled: false,
    questionCount: 4,
    scope: "all_changes",
    validationMode: "answer_all",
    scoreThreshold: null,
    providerPreference: "codex",
  },
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

function toLocalFileSignature(files: ChangedFile[]): string {
  return files
    .map((file) => `${file.status}:${file.path}:${file.contentHash}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

export function AppShell({ initialRepo }: AppShellProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTabId>("files");
  const [selectedFileRef, setSelectedFileRef] = useState<SelectedFileRef | null>(null);
  const [paneMode, setPaneMode] = useState<DiffPaneMode>("diff");
  const [viewMode, setViewMode] = useState<DiffViewMode>("split");
  const [filesDockMode, setFilesDockMode] = useState<FilesDockMode>("idle");
  const [filesDockMessage, setFilesDockMessage] = useState<FilesDockMessage>(null);
  const [commitMessageDraft, setCommitMessageDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [activeQuizSessionId, setActiveQuizSessionId] = useState<string | null>(null);
  const [quizSessionLocalSignature, setQuizSessionLocalSignature] = useState<string | null>(null);
  const [quizStreamError, setQuizStreamError] = useState<string | null>(null);
  const [bypassArmed, setBypassArmed] = useState(false);
  const [quizUnlockSignature, setQuizUnlockSignature] = useState<string | null>(null);
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

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: getSettings,
    placeholderData: (previousData) => previousData ?? DEFAULT_SETTINGS,
  });

  const providerStatusQuery = useQuery({
    queryKey: queryKeys.quizProviders,
    queryFn: getQuizProviders,
    staleTime: 30_000,
  });

  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspace,
    queryFn: getWorkspace,
    enabled: workspaceOpen,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const settingsUiError = settingsQuery.isError ? toUiError(settingsQuery.error) : null;
  const providersUiError = providerStatusQuery.isError
    ? toUiError(providerStatusQuery.error, "Unable to load provider statuses.")
    : null;
  const workspaceUiError = workspaceQuery.isError
    ? toUiError(workspaceQuery.error, "Unable to load current workspace folder.")
    : null;

  const files = filesQuery.data ?? [];
  const filesUiError = filesQuery.isError ? toUiError(filesQuery.error) : null;
  const localFileSignature = useMemo(() => toLocalFileSignature(files), [files]);

  const quizSessionQuery = useQuery({
    queryKey: activeQuizSessionId ? queryKeys.quizSession(activeQuizSessionId) : ["quizSession", "none"],
    queryFn: async () => await getQuizSession(activeQuizSessionId!),
    enabled: Boolean(activeQuizSessionId),
    placeholderData: (previousData) => previousData,
  });

  const quizSession = quizSessionQuery.data ?? null;

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

  useEffect(() => {
    if (!quizUnlockSignature) {
      return;
    }

    if (quizUnlockSignature === localFileSignature) {
      return;
    }

    setQuizUnlockSignature(null);
    setBypassArmed(false);
    setFilesDockMessage({
      tone: "info",
      text: "Repository changed after quiz check. Re-run quiz to unlock commit.",
    });
  }, [localFileSignature, quizUnlockSignature]);

  useEffect(() => {
    if (!bypassArmed || !quizSessionLocalSignature) {
      return;
    }

    if (quizSessionLocalSignature === localFileSignature) {
      return;
    }

    setBypassArmed(false);
  }, [bypassArmed, localFileSignature, quizSessionLocalSignature]);

  const selectedScope = useMemo(() => toScope(selectedFile), [selectedFile]);

  const diffDetailQuery = useQuery({
    queryKey:
      selectedFile && selectedScope
        ? queryKeys.diffDetail(selectedFile.path, selectedScope, 3, selectedFile.contentHash)
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
      ]),
    ]);
  }

  async function cancelFileMutationQueries(path: string) {
    await cancelFileMutationQueriesForPaths([path]);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.health }),
    ]);
  }

  function setQuizSessionCache(session: QuizSession) {
    queryClient.setQueryData(queryKeys.quizSession(session.id), session);
  }

  async function applyWorkspaceSwitch(nextWorkspace: { repoRoot: string }) {
    queryClient.setQueryData(queryKeys.workspace, nextWorkspace);
    queryClient.removeQueries({ queryKey: queryKeys.quizSessionRoot });

    setWorkspaceOpen(false);
    setSelectedFileRef(null);
    setActiveQuizSessionId(null);
    setQuizSessionLocalSignature(null);
    setQuizStreamError(null);
    setBypassArmed(false);
    setQuizUnlockSignature(null);
    setPaneMode("diff");
    setFilesDockMode("idle");
    setFilesDockMessage({
      tone: "info",
      text: `Opened ${nextWorkspace.repoRoot}`,
    });

    await refreshQueries();
  }

  const pickWorkspaceMutation = useMutation({
    mutationFn: async () => await pickWorkspace(),
    onMutate: () => {
      setWorkspaceError(null);
    },
    onSuccess: async (nextWorkspace) => {
      await applyWorkspaceSwitch(nextWorkspace);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === "WORKSPACE_PICK_CANCELLED") {
        return;
      }

      const uiError = toUiError(error, "Unable to open selected folder.");
      setWorkspaceError(uiError.message);

      if (error instanceof ApiRequestError && error.code === "WORKSPACE_PICK_UNSUPPORTED") {
        setWorkspaceOpen(true);
      }
    },
  });

  const workspaceMutation = useMutation({
    mutationFn: async (repoRoot: string) => await setWorkspace({ repoRoot }),
    onMutate: () => {
      setWorkspaceError(null);
    },
    onSuccess: async (nextWorkspace) => {
      await applyWorkspaceSwitch(nextWorkspace);
    },
    onError: (error) => {
      setWorkspaceError(toUiError(error, "Unable to open selected folder.").message);
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (nextSettings: AppSettings) => await putSettings(nextSettings),
    onMutate: async (nextSettings) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previousSettings = queryClient.getQueryData<AppSettings>(queryKeys.settings);
      queryClient.setQueryData(queryKeys.settings, nextSettings);
      return { previousSettings };
    },
    onError: (error, _settings, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.settings, context.previousSettings);
      }

      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to save settings.").message,
      });
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(queryKeys.settings, nextSettings);
      setSettingsOpen(false);
    },
  });

  const createQuizSessionMutation = useMutation({
    mutationFn: async (params: { commitMessage: string }) =>
      await createQuizSession(params),
    onMutate: () => {
      setQuizStreamError(null);
      setFilesDockMessage({
        tone: "info",
        text: "Generating quiz. Commit unlocks after validation.",
      });
    },
    onSuccess: (session) => {
      setQuizSessionCache(session);
      setActiveQuizSessionId(session.id);
      setQuizSessionLocalSignature(localFileSignature);
      setPaneMode("quiz");
      setBypassArmed(false);
      setQuizUnlockSignature(null);
    },
    onError: (error) => {
      setQuizStreamError(toUiError(error, "Unable to start quiz session.").message);
      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to start quiz session.").message,
      });
    },
  });

  const submitQuizAnswersMutation = useMutation({
    mutationFn: async (params: { sessionId: string; answers: Record<string, number> }) =>
      await submitQuizAnswers(params.sessionId, { answers: params.answers }),
    onSuccess: (session) => {
      setQuizSessionCache(session);
    },
    onError: (error) => {
      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to save quiz answers.").message,
      });
    },
  });

  const validateQuizMutation = useMutation({
    mutationFn: async (params: {
      sessionId: string;
      sourceFingerprint: string;
      localSignature: string;
    }) =>
      await validateQuizSession(params.sessionId, {
        sourceFingerprint: params.sourceFingerprint,
      }),
    onSuccess: (session, params) => {
      setQuizSessionCache(session);

      if (session.status === "validated") {
        setQuizUnlockSignature(params.localSignature);
        setFilesDockMessage({
          tone: "info",
          text: "Quiz validated. Commit is now unlocked.",
        });
        return;
      }

      setQuizUnlockSignature(null);
      setFilesDockMessage({
        tone: "error",
        text: "Validation did not pass yet. Review quiz answers and try again.",
      });
    },
    onError: (error) => {
      setQuizUnlockSignature(null);
      setFilesDockMessage({
        tone: "error",
        text: toUiError(error, "Unable to validate quiz.").message,
      });
    },
  });

  useEffect(() => {
    if (!activeQuizSessionId) {
      return;
    }

    setQuizStreamError(null);

    const dispose = openQuizSessionStream(activeQuizSessionId, {
      onEvent: (event: QuizSseEvent) => {
        setQuizSessionCache(event.session);
      },
      onError: (error) => {
        setQuizStreamError(error.message);
      },
    });

    return () => {
      dispose();
    };
  }, [activeQuizSessionId, queryClient]);

  const quizValidationPassed =
    quizSession?.status === "validated" &&
    quizUnlockSignature !== null &&
    quizUnlockSignature === localFileSignature;
  const commitBypassActive =
    bypassArmed &&
    quizSession?.status === "failed" &&
    quizSessionLocalSignature === localFileSignature;
  const quizGateEnabled = settings.quiz.gateEnabled;

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
        queryClient.getQueryData<DiffDetailResponse>(
          queryKeys.diffDetail(path, "unstaged", 3, contentHash),
        ),
      );

      if (unstagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "staged", 3, contentHash), unstagedDiff);
      }

      if (unstagedDiffDetail) {
        queryClient.setQueryData(
          queryKeys.diffDetail(path, "staged", 3, contentHash),
          unstagedDiffDetail,
        );
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3, contentHash), exact: true });
      queryClient.removeQueries({
        queryKey: queryKeys.diffDetail(path, "unstaged", 3, contentHash),
        exact: true,
      });
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
          queryClient.getQueryData<DiffDetailResponse>(
            queryKeys.diffDetail(path, "unstaged", 3, contentHash),
          ),
        );

        if (unstagedDiff) {
          queryClient.setQueryData(queryKeys.diff(path, "staged", 3, contentHash), unstagedDiff);
        }

        if (unstagedDiffDetail) {
          queryClient.setQueryData(
            queryKeys.diffDetail(path, "staged", 3, contentHash),
            unstagedDiffDetail,
          );
        }

        queryClient.removeQueries({ queryKey: queryKeys.diff(path, "unstaged", 3, contentHash), exact: true });
        queryClient.removeQueries({
          queryKey: queryKeys.diffDetail(path, "unstaged", 3, contentHash),
          exact: true,
        });
      }

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
        queryClient.getQueryData<DiffDetailResponse>(
          queryKeys.diffDetail(path, "staged", 3, contentHash),
        ),
      );

      const nextFiles = updateFilesAndRepo((currentFiles) => {
        const targetStatus = inferUnstageTargetStatus(currentFiles, path, stagedDiff);
        return applyUnstageTransition(currentFiles, path, targetStatus);
      });

      if (stagedDiff) {
        queryClient.setQueryData(queryKeys.diff(path, "unstaged", 3, contentHash), stagedDiff);
      }

      if (stagedDiffDetail) {
        queryClient.setQueryData(
          queryKeys.diffDetail(path, "unstaged", 3, contentHash),
          stagedDiffDetail,
        );
      }

      queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3, contentHash), exact: true });
      queryClient.removeQueries({
        queryKey: queryKeys.diffDetail(path, "staged", 3, contentHash),
        exact: true,
      });
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
            queryKeys.diffDetail(path, "staged", 3, contentHash),
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
          queryClient.setQueryData(
            queryKeys.diffDetail(path, "unstaged", 3, contentHash),
            stagedDiffDetail,
          );
        }

        queryClient.removeQueries({ queryKey: queryKeys.diff(path, "staged", 3, contentHash), exact: true });
        queryClient.removeQueries({
          queryKey: queryKeys.diffDetail(path, "staged", 3, contentHash),
          exact: true,
        });
      }

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
      setCommitMessageDraft("");
      setPaneMode("diff");
      setBypassArmed(false);
      setQuizUnlockSignature(null);
      setQuizSessionLocalSignature(null);
      setQuizStreamError(null);
      if (activeQuizSessionId) {
        queryClient.removeQueries({ queryKey: queryKeys.quizSession(activeQuizSessionId), exact: true });
      }
      setActiveQuizSessionId(null);
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

  function requestWorkspacePick() {
    if (workspaceMutation.isPending || pickWorkspaceMutation.isPending) {
      return;
    }

    setWorkspaceError(null);
    pickWorkspaceMutation.mutate();
  }

  function startOrResumeQuiz(message: string) {
    const normalizedMessage = message.trim();

    setCommitMessageDraft(normalizedMessage);
    setPaneMode("quiz");
    setFilesDockMessage({
      tone: "info",
      text: "Quiz validation is required before commit.",
    });

    if (createQuizSessionMutation.isPending) {
      return;
    }

    const canReuseSession =
      activeQuizSessionId !== null &&
      quizSession !== null &&
      quizSessionLocalSignature === localFileSignature &&
      (quizSession.status === "queued" ||
        quizSession.status === "streaming" ||
        quizSession.status === "ready" ||
        quizSession.status === "validated");

    if (canReuseSession) {
      return;
    }

    createQuizSessionMutation.mutate({
      commitMessage: normalizedMessage,
    });
  }

  function requestQuizAnswer(questionId: string, optionIndex: number) {
    if (!activeQuizSessionId || !quizSession || !quizSession.quiz) {
      return;
    }

    const nextAnswers = {
      ...quizSession.answers,
      [questionId]: optionIndex,
    };

    queryClient.setQueryData<QuizSession>(queryKeys.quizSession(activeQuizSessionId), {
      ...quizSession,
      status: quizSession.status === "validated" ? "ready" : quizSession.status,
      answers: nextAnswers,
      validation: quizSession.status === "validated" ? null : quizSession.validation,
    });

    if (quizSession.status === "validated") {
      setQuizUnlockSignature(null);
    }

    submitQuizAnswersMutation.mutate({ sessionId: activeQuizSessionId, answers: nextAnswers });
  }

  function requestQuizValidation() {
    if (!activeQuizSessionId || !quizSession) {
      return;
    }

    validateQuizMutation.mutate({
      sessionId: activeQuizSessionId,
      sourceFingerprint: quizSession.sourceFingerprint,
      localSignature: localFileSignature,
    });
  }

  function requestQuizBypass() {
    setBypassArmed(true);
    setFilesDockMessage({
      tone: "info",
      text: "Bypass armed for one commit attempt.",
    });
  }

  function requestQuizClear() {
    if (activeQuizSessionId) {
      queryClient.removeQueries({ queryKey: queryKeys.quizSession(activeQuizSessionId), exact: true });
    }

    setActiveQuizSessionId(null);
    setQuizSessionLocalSignature(null);
    setQuizStreamError(null);
    setBypassArmed(false);
    setQuizUnlockSignature(null);
    setFilesDockMessage(null);
  }

  function requestInlineQuizSettingsUpdate(nextQuizSettings: AppSettings["quiz"]) {
    settingsMutation.mutate({
      quiz: nextQuizSettings,
    });
  }

  function requestPaneModeChange(mode: DiffPaneMode) {
    setPaneMode(mode);
  }

  function requestCommit(message: string) {
    const trimmedMessage = message.trim();

    setCommitMessageDraft(trimmedMessage);
    setFilesDockMessage(null);

    if (!quizGateEnabled) {
      if (!trimmedMessage) {
        return;
      }

      commitMutation.mutate(trimmedMessage);
      return;
    }

    if (quizValidationPassed || commitBypassActive) {
      if (!trimmedMessage) {
        setFilesDockMessage({
          tone: "error",
          text: "Add a commit message before finalizing commit.",
        });
        return;
      }

      if (commitBypassActive) {
        setBypassArmed(false);
      }

      commitMutation.mutate(trimmedMessage);
      return;
    }

    setPaneMode("quiz");
    setFilesDockMessage({
      tone: "info",
      text: "Press generate quiz in Quiz to start validation.",
    });
  }

  function requestPush(createUpstream: boolean) {
    if (commitMutation.isPending || pushMutation.isPending) {
      return;
    }

    setFilesDockMessage(null);
    pushMutation.mutate(createUpstream);
  }

  const trimmedCommitDraft = commitMessageDraft.trim();
  const requiresFinalCommitMessage = !quizGateEnabled || quizValidationPassed || commitBypassActive;
  const commitActionDisabled =
    (requiresFinalCommitMessage && trimmedCommitDraft.length === 0) ||
    repo.stagedCount === 0 ||
    commitMutation.isPending ||
    pushMutation.isPending;

  const commitActionLabel = !quizGateEnabled
    ? "commit"
    : quizValidationPassed || commitBypassActive
      ? "commit"
      : "open quiz";

  const quizPanel = (
    <QuizPanel
      quizSettings={settings.quiz}
      session={quizSession}
      isLoadingSession={Boolean(activeQuizSessionId) && quizSessionQuery.isPending}
      isCreatingSession={createQuizSessionMutation.isPending}
      isSavingSettings={settingsMutation.isPending}
      isSubmittingAnswers={submitQuizAnswersMutation.isPending}
      isValidating={validateQuizMutation.isPending}
      streamError={quizStreamError}
      commitUnlocked={quizValidationPassed || commitBypassActive}
      bypassAvailable={quizGateEnabled && quizSession?.status === "failed"}
      bypassArmed={bypassArmed}
      onStartQuiz={() => {
        startOrResumeQuiz(commitMessageDraft);
      }}
      onClearQuiz={requestQuizClear}
      onSelectAnswer={requestQuizAnswer}
      onValidateQuiz={requestQuizValidation}
      onBypassOnce={requestQuizBypass}
      onUpdateQuizSettings={requestInlineQuizSettingsUpdate}
    />
  );

  if (repo.mode === "non-git") {
    return (
      <>
        <NonGitGate
          repoName={repo.repoName}
          onPickFolder={() => {
            requestWorkspacePick();
          }}
          onEnterPath={() => {
            setWorkspaceError(null);
            setWorkspaceOpen(true);
          }}
          isPicking={pickWorkspaceMutation.isPending}
        />
        <WorkspaceModal
          open={workspaceOpen}
          currentPath={workspaceQuery.data?.repoRoot ?? ""}
          isLoadingPath={workspaceOpen && workspaceQuery.isPending && !workspaceQuery.data}
          isSaving={workspaceMutation.isPending}
          error={workspaceError ?? workspaceUiError?.message ?? null}
          onClose={() => {
            setWorkspaceError(null);
            setWorkspaceOpen(false);
          }}
          onSave={(repoRoot) => {
            workspaceMutation.mutate(repoRoot);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Topbar
        repo={repo}
        onRefresh={() => void refreshQueries()}
        onOpenSettings={() => setSettingsOpen(true)}
        onPickWorkspace={requestWorkspacePick}
        quizGateEnabled={settings.quiz.gateEnabled}
      />

      <main className="workspace">
        <DiffPanel
          selectedFile={selectedFile}
          fileChangeCountLabel={fileChangeCountLabel}
          paneMode={paneMode}
          onPaneModeChange={requestPaneModeChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenSettings={() => setSettingsOpen(true)}
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
          quizPanel={quizPanel}
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
          commitMessage={commitMessageDraft}
          commitActionLabel={commitActionLabel}
          commitActionDisabled={commitActionDisabled}
          onCommitMessageChange={(message) => {
            setCommitMessageDraft(message);
          }}
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

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        isSaving={settingsMutation.isPending}
        error={
          settingsMutation.isError
            ? toUiError(settingsMutation.error, "Unable to save settings.").message
            : (settingsUiError?.message ?? null)
        }
        providerStatuses={providerStatusQuery.data?.providers ?? []}
        isLoadingProviders={providerStatusQuery.isPending}
        providersError={providersUiError?.message ?? null}
        onClose={() => setSettingsOpen(false)}
        onSave={(nextSettings) => {
          settingsMutation.mutate(nextSettings);
        }}
      />

      <WorkspaceModal
        open={workspaceOpen}
        currentPath={workspaceQuery.data?.repoRoot ?? ""}
        isLoadingPath={workspaceOpen && workspaceQuery.isPending && !workspaceQuery.data}
        isSaving={workspaceMutation.isPending}
        error={workspaceError ?? workspaceUiError?.message ?? null}
        onClose={() => {
          setWorkspaceError(null);
          setWorkspaceOpen(false);
        }}
        onSave={(repoRoot) => {
          workspaceMutation.mutate(repoRoot);
        }}
      />

      <StatusBar
        connected={!healthQuery.isError && healthQuery.data?.ok === true}
        stagedCount={repo.stagedCount}
        unstagedCount={repo.unstagedCount}
        untrackedCount={repo.untrackedCount}
      />
    </div>
  );
}
