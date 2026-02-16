import { useEffect, useMemo, useState } from "react";
import type { ChangedFile, DiffScope, DiffViewMode, RepoSummary } from "@diffx/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commitChanges, stageFile, unstageFile } from "../../services/api/actions";
import { getDiffSummary } from "../../services/api/diff";
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected request failure";
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
    queryFn: getRepoSummary,
    initialData: initialRepo,
    refetchInterval: 15000,
  });

  const filesQuery = useQuery({
    queryKey: queryKeys.files,
    queryFn: getChangedFiles,
    refetchInterval: 15000,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
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
    queryFn: async () =>
      await getDiffSummary({
        path: selectedFile!.path,
        scope: selectedScope!,
        contextLines: 3,
      }),
    enabled: Boolean(selectedFile && selectedScope),
  });

  const selectedIndex = selectedFile
    ? files.findIndex((entry) => entry.path === selectedFile.path && entry.status === selectedFile.status)
    : -1;

  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < files.length - 1;

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
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshQueries();
    },
    onError: (error) => {
      setFeedback(toErrorMessage(error));
    },
  });

  const unstageMutation = useMutation({
    mutationFn: async (path: string) => await unstageFile({ path }),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshQueries();
    },
    onError: (error) => {
      setFeedback(toErrorMessage(error));
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => await commitChanges({ message }),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshQueries();
    },
    onError: (error) => {
      setFeedback(toErrorMessage(error));
    },
  });

  const repo = repoQuery.data ?? initialRepo;
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
          filesError={filesQuery.isError ? toErrorMessage(filesQuery.error) : null}
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
        selectedPath={selectedFile?.path ?? null}
      />
    </div>
  );
}
