import type { ChangedFile, ChangedFileStatus } from "@diffx/contracts";

type FilesTabProps = {
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  onSelectFile: (file: ChangedFile) => void;
};

const STATUS_ORDER: ChangedFileStatus[] = ["staged", "unstaged", "untracked"];

function statusLabel(status: ChangedFileStatus): string {
  if (status === "staged") return "staged";
  if (status === "unstaged") return "unstaged";
  return "untracked";
}

export function FilesTab({ files, selectedFile, onSelectFile }: FilesTabProps) {
  if (files.length === 0) {
    return <p className="empty-state">No changed files.</p>;
  }

  return (
    <div className="files-tab">
      {STATUS_ORDER.map((status) => {
        const entries = files.filter((file) => file.status === status);
        if (entries.length === 0) return null;

        return (
          <section key={status} className="file-group">
            <p className="hud-label">
              {statusLabel(status)} ({entries.length})
            </p>

            <ul className="file-list">
              {entries.map((file) => {
                const active =
                  selectedFile?.path === file.path && selectedFile.status === file.status;

                return (
                  <li key={`${file.status}:${file.path}`}>
                    <button
                      type="button"
                      className={active ? "file-row file-row-active" : "file-row"}
                      onClick={() => onSelectFile(file)}
                    >
                      <span className="file-row-name">{file.path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
