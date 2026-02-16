import { useMemo, type ReactNode } from "react";
import type { FileContents as PierreFileContents } from "@pierre/diffs";
import type {
  ChangedFile,
  DiffDetailResponse,
  DiffViewMode,
} from "@diffx/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import { toUiError } from "../../services/api/error-ui";
import { DiffFileHeader } from "./DiffFileHeader";
import { DiffToolbar } from "./DiffToolbar";
import { PierreDiffRenderer } from "./PierreDiffRenderer";

type DiffPanelProps = {
  selectedFile: ChangedFile | null;
  fileChangeCountLabel: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onPreviousFile: () => void;
  onNextFile: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  diffQuery: UseQueryResult<DiffDetailResponse, Error>;
};

function toPierreFile(name: string, contents: string): PierreFileContents {
  return {
    name,
    contents,
  };
}

export function DiffPanel({
  selectedFile,
  fileChangeCountLabel,
  viewMode,
  onViewModeChange,
  onPreviousFile,
  onNextFile,
  canGoPrevious,
  canGoNext,
  diffQuery,
}: DiffPanelProps) {
  const diffFile = diffQuery.data?.file;

  const fullFiles = useMemo(() => {
    if (!diffFile || !diffQuery.data) {
      return null;
    }

    return {
      oldFile: toPierreFile(
        diffFile.oldPath ?? diffFile.path,
        diffQuery.data.old.file?.contents ?? "",
      ),
      newFile: toPierreFile(
        diffFile.newPath ?? diffFile.path,
        diffQuery.data.new.file?.contents ?? "",
      ),
    };
  }, [diffFile, diffQuery.data]);

  const fullContextUnavailable =
    diffQuery.data?.old.isBinary === true ||
    diffQuery.data?.old.tooLarge === true ||
    diffQuery.data?.old.error === true ||
    diffQuery.data?.new.isBinary === true ||
    diffQuery.data?.new.tooLarge === true ||
    diffQuery.data?.new.error === true;

  if (!selectedFile) {
    return (
      <section className="diff-panel">
        <DiffToolbar viewMode={viewMode} onViewModeChange={onViewModeChange} />
        <div className="diff-content">
          <p className="empty-state">Select a file in the sidebar to view its diff.</p>
        </div>
      </section>
    );
  }

  let content: ReactNode;
  const diffError = diffQuery.isError ? toUiError(diffQuery.error) : null;

  if (diffQuery.isPending) {
    content = <p className="inline-note">Loading diff...</p>;
  } else if (diffQuery.isError) {
    content = <p className="error-note">{diffError?.message ?? "Unable to load diff for selected file."}</p>;
  } else if (!diffFile) {
    content = <p className="empty-state">No diff available for this selection.</p>;
  } else if (diffFile.isBinary) {
    content = <p className="empty-state">Binary file. Diff preview is disabled.</p>;
  } else if (diffFile.tooLarge) {
    content = <p className="empty-state">Diff too large to render.</p>;
  } else if (!diffFile.patch) {
    content = <p className="empty-state">Patch payload is empty.</p>;
  } else if (fullFiles && !fullContextUnavailable) {
    content = (
      <PierreDiffRenderer
        mode="full"
        oldFile={fullFiles.oldFile}
        newFile={fullFiles.newFile}
        viewMode={viewMode}
      />
    );
  } else {
    const fallbackNote = fullContextUnavailable
      ? <p className="inline-note">Full context unavailable for this file, showing patch-only view.</p>
      : null;

    content = (
      <>
        {fallbackNote}
        <PierreDiffRenderer mode="patch" patch={diffFile.patch} viewMode={viewMode} />
      </>
    );
  }

  return (
    <section className="diff-panel">
      <DiffToolbar viewMode={viewMode} onViewModeChange={onViewModeChange} />

      {diffFile ? (
        <DiffFileHeader
          path={diffFile.path}
          oldPath={diffFile.oldPath}
          newPath={diffFile.newPath}
          fileChangeCountLabel={fileChangeCountLabel}
          onPreviousFile={onPreviousFile}
          onNextFile={onNextFile}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          additions={diffFile.stats.additions}
          deletions={diffFile.stats.deletions}
        />
      ) : null}

      <div className="diff-content">{content}</div>
    </section>
  );
}
