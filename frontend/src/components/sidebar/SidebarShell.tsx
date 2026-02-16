import type { ChangedFile } from "@diffx/contracts";
import { tabRegistry, type SidebarTabId } from "./tabRegistry";
import { FilesTab, type FilesDockAction, type FilesDockMessage } from "./tabs/FilesTab";
import { ActionsTab } from "./tabs/ActionsTab";

type SidebarShellProps = {
  activeTab: SidebarTabId;
  onChangeTab: (tab: SidebarTabId) => void;
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  isLoadingFiles: boolean;
  filesError: string | null;
  pendingMutationsByPath: ReadonlyMap<string, "stage" | "unstage">;
  stagedCount: number;
  filesDockAction: FilesDockAction;
  filesDockMessage: FilesDockMessage;
  isCommitting: boolean;
  isPushing: boolean;
  onSelectFile: (file: ChangedFile) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (paths: string[]) => void;
  onUnstageFiles: (paths: string[]) => void;
  onCommitChanges: (message: string) => void;
  onPushChanges: (createUpstream: boolean) => void;
};

export function SidebarShell({
  activeTab,
  onChangeTab,
  files,
  selectedFile,
  isLoadingFiles,
  filesError,
  pendingMutationsByPath,
  stagedCount,
  filesDockAction,
  filesDockMessage,
  isCommitting,
  isPushing,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  onCommitChanges,
  onPushChanges,
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
            {filesError ? <p className="error-note">{filesError}</p> : null}
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
                stagedCount={stagedCount}
                dockAction={filesDockAction}
                dockMessage={filesDockMessage}
                isCommitting={isCommitting}
                isPushing={isPushing}
                onCommitChanges={onCommitChanges}
                onPushChanges={onPushChanges}
              />
            ) : null}
          </>
        ) : (
          <ActionsTab />
        )}
      </div>
    </aside>
  );
}
