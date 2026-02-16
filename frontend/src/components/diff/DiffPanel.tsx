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
import { queryKeys } from "../../services/query-keys";
import { DiffToolbar } from "./DiffToolbar";
import { PierreDiffRenderer } from "./PierreDiffRenderer";

type DiffPanelProps = {
  selectedFile: ChangedFile | null;
  scope: DiffScope | null;
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
    queryFn: async () =>
      await getLazyFileContents({ path: selectedFile!.path, scope: scope!, side: "old" }),
    enabled: canLoadContents,
  });

  const newFileQuery = useQuery({
    queryKey:
      selectedFile && scope
        ? queryKeys.fileContents(selectedFile.path, scope, "new")
        : ["fileContents", "new", "none"],
    queryFn: async () =>
      await getLazyFileContents({ path: selectedFile!.path, scope: scope!, side: "new" }),
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

  if (!selectedFile) {
    return (
      <section className="diff-panel">
        <DiffToolbar
          selectedPath={null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onPreviousFile={onPreviousFile}
          onNextFile={onNextFile}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
        />
        <div className="diff-content">
          <p className="empty-state">Select a file in the sidebar to view its diff.</p>
        </div>
      </section>
    );
  }

  let content: ReactNode;

  if (diffQuery.isPending) {
    content = <p className="inline-note">Loading diff...</p>;
  } else if (diffQuery.isError) {
    content = <p className="error-note">Unable to load diff for selected file.</p>;
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
        <p className="inline-note">Click line-info separators to expand unchanged context.</p>
        <PierreDiffRenderer
          mode="full"
          oldFile={fullFiles.oldFile}
          newFile={fullFiles.newFile}
          viewMode={viewMode}
        />
      </>
    );
  } else {
    let fallbackNote: ReactNode = null;

    if (oldFileQuery.isPending || newFileQuery.isPending || oldFileQuery.isFetching || newFileQuery.isFetching) {
      fallbackNote = <p className="inline-note">Loading full file context...</p>;
    } else if (oldFileQuery.isError || newFileQuery.isError) {
      fallbackNote = (
        <p className="inline-note">Unable to load full context, showing patch-only view.</p>
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
      <DiffToolbar
        selectedPath={selectedFile?.path ?? null}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onPreviousFile={onPreviousFile}
        onNextFile={onNextFile}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
      />

      <div className="diff-content">{content}</div>
    </section>
  );
}
