import { useState } from "react";
import type { ChangedFile, CodeReviewSession } from "@diffx/contracts";
import { CommitComposer } from "./CommitComposer";
import { tabRegistry, type SidebarTabId } from "./tabRegistry";
import { CodeReviewTab } from "./tabs/CodeReviewTab";
import { FilesTab } from "./tabs/FilesTab";

type SidebarShellProps = {
  branch: string | null;
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  isLoadingFiles: boolean;
  isRefreshingFiles: boolean;
  filesError: string | null;
  filesErrorRetryable: boolean;
  pendingMutationsByPath: ReadonlyMap<string, "stage" | "unstage">;
  codeReviewSession: CodeReviewSession | null;
  isStartingCodeReview: boolean;
  isLoadingCodeReviewSession: boolean;
  codeReviewStreamError: string | null;
  isCommitting: boolean;
  isPushing: boolean;
  isGeneratingCommitMessage: boolean;
  commitMessage: string;
  commitDisabled: boolean;
  commitTooltip?: string;
  canPush: boolean;
  onCommitMessageChange: (message: string) => void;
  onRetryFiles: () => void;
  onSelectFile: (file: ChangedFile) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (paths: string[]) => void;
  onUnstageFiles: (paths: string[]) => void;
  onRunCodeReview: () => void;
  onCommitChanges: (message: string) => void;
  onPushChanges: () => void;
  onGenerateCommitMessage: () => void;
};

export function SidebarShell({
  branch,
  files,
  selectedFile,
  isLoadingFiles,
  isRefreshingFiles,
  filesError,
  filesErrorRetryable,
  pendingMutationsByPath,
  codeReviewSession,
  isStartingCodeReview,
  isLoadingCodeReviewSession,
  codeReviewStreamError,
  isCommitting,
  isPushing,
  isGeneratingCommitMessage,
  commitMessage,
  commitDisabled,
  commitTooltip,
  canPush,
  onCommitMessageChange,
  onRetryFiles,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  onRunCodeReview,
  onCommitChanges,
  onPushChanges,
  onGenerateCommitMessage,
}: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<SidebarTabId>("files");
  const codeReviewFindingCount = codeReviewSession?.findings.length ?? 0;

  return (
    <aside className="sidebar-shell">
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar tabs">
        {tabRegistry.map((tab) => {
          const isActive = activeTab === tab.id;
          const className = isActive ? "hud-tab hud-tab-active" : "hud-tab";

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={className}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
              }}
            >
              {tab.label}
              {tab.id === "code-review" && codeReviewFindingCount > 0 ? (
                <span className="hud-tab-count">{codeReviewFindingCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="sidebar-content">
        {activeTab === "files" ? (
          <>
            {isLoadingFiles ? <p className="inline-note">Loading files...</p> : null}
            {isRefreshingFiles && !isLoadingFiles && !filesError ? (
              <p className="inline-note">Refreshing files...</p>
            ) : null}
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
            {!filesError && (!isLoadingFiles || files.length > 0) ? (
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
          <CodeReviewTab
            session={codeReviewSession}
            isStartingReview={isStartingCodeReview}
            isLoadingSession={isLoadingCodeReviewSession}
            streamError={codeReviewStreamError}
            onRunReview={onRunCodeReview}
          />
        )}
      </div>

      <CommitComposer
        branch={branch}
        commitMessage={commitMessage}
        isCommitting={isCommitting}
        isPushing={isPushing}
        isGeneratingMessage={isGeneratingCommitMessage}
        commitDisabled={commitDisabled}
        commitTooltip={commitTooltip}
        canPush={canPush}
        onCommitMessageChange={onCommitMessageChange}
        onCommit={onCommitChanges}
        onPush={onPushChanges}
        onGenerateMessage={onGenerateCommitMessage}
      />
    </aside>
  );
}
