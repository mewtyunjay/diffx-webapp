import type { ChangedFile } from "@diffx/contracts";
import { tabRegistry, type SidebarTabId } from "./tabRegistry";
import { CommitComposer } from "./CommitComposer";
import { FilesTab } from "./tabs/FilesTab";
import { ActionsTab } from "./tabs/ActionsTab";

type CommitComposerMessage = {
  tone: "info" | "error";
  text: string;
} | null;

type SidebarShellProps = {
  repoName: string;
  branch: string | null;
  activeTab: SidebarTabId;
  onChangeTab: (tab: SidebarTabId) => void;
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  isLoadingFiles: boolean;
  filesError: string | null;
  filesErrorRetryable: boolean;
  pendingMutationsByPath: ReadonlyMap<string, "stage" | "unstage">;
  isCommitting: boolean;
  isPushing: boolean;
  isGeneratingCommitMessage: boolean;
  commitMessage: string;
  commitDisabled: boolean;
  canPush: boolean;
  commitMessageStatus: CommitComposerMessage;
  onCommitMessageChange: (message: string) => void;
  onRetryFiles: () => void;
  onSelectFile: (file: ChangedFile) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (paths: string[]) => void;
  onUnstageFiles: (paths: string[]) => void;
  onCommitChanges: (message: string) => void;
  onPushChanges: () => void;
  onGenerateCommitMessage: () => void;
};

export function SidebarShell({
  repoName,
  branch,
  activeTab,
  onChangeTab,
  files,
  selectedFile,
  isLoadingFiles,
  filesError,
  filesErrorRetryable,
  pendingMutationsByPath,
  isCommitting,
  isPushing,
  isGeneratingCommitMessage,
  commitMessage,
  commitDisabled,
  canPush,
  commitMessageStatus,
  onCommitMessageChange,
  onRetryFiles,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  onCommitChanges,
  onPushChanges,
  onGenerateCommitMessage,
}: SidebarShellProps) {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar tabs">
        {tabRegistry.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "hud-tab hud-tab-active" : "hud-tab"}
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sidebar-content">
        {activeTab === "files" ? (
          <>
            {isLoadingFiles ? <p className="inline-note">Loading files...</p> : null}
            {filesError ? (
              <div className="inline-error-block">
                <p className="error-note">{filesError}</p>
                {filesErrorRetryable ? (
                  <button className="hud-button hud-button-compact" type="button" onClick={onRetryFiles}>
                    retry files
                  </button>
                ) : null}
              </div>
            ) : null}
            {!isLoadingFiles && !filesError ? (
              <FilesTab
                files={files}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onStageFiles={onStageFiles}
                onUnstageFiles={onUnstageFiles}
                pendingMutationsByPath={pendingMutationsByPath}
              />
            ) : null}
          </>
        ) : (
          <ActionsTab />
        )}
      </div>

      <CommitComposer
        repoName={repoName}
        branch={branch}
        commitMessage={commitMessage}
        isCommitting={isCommitting}
        isPushing={isPushing}
        isGeneratingMessage={isGeneratingCommitMessage}
        commitDisabled={commitDisabled}
        canPush={canPush}
        message={commitMessageStatus}
        onCommitMessageChange={onCommitMessageChange}
        onCommit={onCommitChanges}
        onPush={onPushChanges}
        onGenerateMessage={onGenerateCommitMessage}
      />
    </aside>
  );
}
