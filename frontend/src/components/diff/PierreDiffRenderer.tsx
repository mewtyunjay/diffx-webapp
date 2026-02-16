import { useMemo } from "react";
import type { FileContents as PierreFileContents, FileDiffOptions } from "@pierre/diffs";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import type { DiffViewMode } from "@diffx/contracts";

type PierrePatchDiffRendererProps = {
  mode: "patch";
  patch: string;
  viewMode: DiffViewMode;
};

type PierreMultiFileDiffRendererProps = {
  mode: "full";
  oldFile: PierreFileContents;
  newFile: PierreFileContents;
  viewMode: DiffViewMode;
};

type PierreDiffRendererProps = PierrePatchDiffRendererProps | PierreMultiFileDiffRendererProps;

export function PierreDiffRenderer(props: PierreDiffRendererProps) {
  const { viewMode } = props;

  const options = useMemo<FileDiffOptions<undefined>>(
    () => ({
      theme: { dark: "pierre-dark", light: "pierre-light" },
      diffStyle: viewMode,
      diffIndicators: "bars",
      hunkSeparators: "line-info",
      lineDiffType: "word-alt",
      overflow: "wrap",
      expandUnchanged: false,
      expansionLineCount: 100,
      themeType: "dark",
    }),
    [viewMode],
  );

  if (props.mode === "full") {
    return (
      <MultiFileDiff
        className="pierre-diff-root"
        oldFile={props.oldFile}
        newFile={props.newFile}
        options={options}
      />
    );
  }

  return <PatchDiff className="pierre-diff-root" patch={props.patch} options={options} />;
}
