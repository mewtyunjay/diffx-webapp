import { useMemo, type ReactNode } from "react";
import type { FileContents as PierreFileContents } from "@pierre/diffs";
import type {
  ChangedFile,
  DiffScope,
  DiffSummaryResponse,
  DiffViewMode,
  FileContentsResponse,
} from "@diffx/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getLazyFileContents } from "../../services/api/file-contents";
import { toUiError } from "../../services/api/error-ui";
import { queryKeys } from "../../services/query-keys";
import { DiffFileHeader } from "./DiffFileHeader";
import { DiffToolbar } from "./DiffToolbar";
import { PierreDiffRenderer } from "./PierreDiffRenderer";

type DiffPanelProps = {
  selectedFile: ChangedFile | null;
  scope: DiffScope | null;
  fileChangeCountLabel: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onPreviousFile: () => void;
  onNextFile: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  diffQuery: UseQueryResult<DiffSummaryResponse, Error>;
};

function toPierreFile(name: string, response: FileContentsResponse): PierreFileContents {
  return {
    name,
    contents: response.file?.contents ?? "",
  };
}

export function DiffPanel({
  selectedFile,
  scope,
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
  const canLoadContents = Boolean(
    selectedFile && scope && diffFile && diffFile.patch && !diffFile.isBinary && !diffFile.tooLarge,
  );

  const oldFileQuery = useQuery({
    queryKey:
      selectedFile && scope
        ? queryKeys.fileContents(selectedFile.path, scope, "old")
        : ["fileContents", "old", "none"],
    queryFn: async ({ signal }) =>
      await getLazyFileContents({ path: selectedFile!.path, scope: scope!, side: "old" }, { signal }),
    enabled: canLoadContents,
  });

  const newFileQuery = useQuery({
    queryKey:
      selectedFile && scope
        ? queryKeys.fileContents(selectedFile.path, scope, "new")
        : ["fileContents", "new", "none"],
    queryFn: async ({ signal }) =>
      await getLazyFileContents({ path: selectedFile!.path, scope: scope!, side: "new" }, { signal }),
    enabled: canLoadContents,
  });

  const fullFiles = useMemo(() => {
    if (!diffFile || !oldFileQuery.data || !newFileQuery.data) {
      return null;
    }

    return {
      oldFile: toPierreFile(diffFile.oldPath ?? diffFile.path, oldFileQuery.data),
      newFile: toPierreFile(diffFile.newPath ?? diffFile.path, newFileQuery.data),
    };
  }, [diffFile, oldFileQuery.data, newFileQuery.data]);

  const fullContextUnavailable =
    oldFileQuery.data?.isBinary === true ||
    oldFileQuery.data?.tooLarge === true ||
    newFileQuery.data?.isBinary === true ||
    newFileQuery.data?.tooLarge === true;

  const isLoadingFullContext =
    canLoadContents &&
    !fullFiles &&
    !fullContextUnavailable &&
    (oldFileQuery.isPending || newFileQuery.isPending || oldFileQuery.isFetching || newFileQuery.isFetching);

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
      <>
        <PierreDiffRenderer
          mode="full"
          oldFile={fullFiles.oldFile}
          newFile={fullFiles.newFile}
          viewMode={viewMode}
        />
      </>
    );
  } else if (isLoadingFullContext) {
    content = <p className="inline-note">Loading full diff...</p>;
  } else {
    let fallbackNote: ReactNode = null;

    if (oldFileQuery.isError || newFileQuery.isError) {
      const fullContextError = oldFileQuery.isError
        ? toUiError(oldFileQuery.error)
        : newFileQuery.isError
          ? toUiError(newFileQuery.error)
          : null;
      fallbackNote = (
        <p className="inline-note">
          {(fullContextError?.retryable ?? true)
            ? `${fullContextError?.message ?? "Unable to load full context."} Showing patch-only view for now.`
            : `${fullContextError?.message ?? "Full context unavailable."} Showing patch-only view.`}
        </p>
      );
    } else if (fullContextUnavailable) {
      fallbackNote = (
        <p className="inline-note">Full context unavailable for this file, showing patch-only view.</p>
      );
    }

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
