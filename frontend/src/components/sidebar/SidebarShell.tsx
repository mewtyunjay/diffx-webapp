import type { ChangedFile } from "@diffx/contracts";
import { tabRegistry, type SidebarTabId } from "./tabRegistry";
import { FilesTab } from "./tabs/FilesTab";
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
  isCommitting: boolean;
  onSelectFile: (file: ChangedFile) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (paths: string[]) => void;
  onUnstageFiles: (paths: string[]) => void;
  onCommitChanges: (message: string) => void;
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
  isCommitting,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  onCommitChanges,
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
                isCommitting={isCommitting}
                onCommitChanges={onCommitChanges}
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
