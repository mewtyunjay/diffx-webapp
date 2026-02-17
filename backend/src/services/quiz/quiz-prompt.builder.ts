import { createHash } from "node:crypto";
import type { ChangedFile, DiffScope, QuizSettings } from "@diffx/contracts";
import { getDiffSummary } from "../diff/diff-summary.service.js";
import { getChangedFiles } from "../git/files.service.js";

const MAX_FILES_IN_PROMPT = 3;
const MAX_PATCH_LINES_PER_FILE = 120;

type QuizPromptContext = {
  sourceFingerprint: string;
  focusFiles: string[];
  promptContext: string;
};

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toSourceFingerprint(files: ChangedFile[]): string {
  const value = files
    .map((file) => `${file.status}:${file.path}:${file.contentHash}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");

  return digest(value);
}

export async function getCurrentQuizSourceFingerprint(): Promise<string> {
  const files = await getChangedFiles();
  return toSourceFingerprint(files);
}

function toScope(status: ChangedFile["status"]): DiffScope {
  return status === "staged" ? "staged" : "unstaged";
}

function pickPromptFiles(
  files: ChangedFile[],
  settings: QuizSettings,
  selectedPath: string | null,
): ChangedFile[] {
  if (selectedPath) {
    const selected = files.find((file) => file.path === selectedPath);
    if (selected) {
      return [selected];
    }
  }

  if (settings.scope === "selected_file" && files.length > 0) {
    return [files[0]!];
  }

  const staged = files.filter((file) => file.status === "staged");
  if (staged.length > 0) {
    return staged.slice(0, MAX_FILES_IN_PROMPT);
  }

  return files.slice(0, MAX_FILES_IN_PROMPT);
}

function toBoundedPatch(patch: string): string {
  return patch
    .split("\n")
    .slice(0, MAX_PATCH_LINES_PER_FILE)
    .map((line) => (line.length > 300 ? `${line.slice(0, 300)}...` : line))
    .join("\n");
}

function toFallbackPromptSection(file: ChangedFile): string {
  return [
    `File: ${file.path}`,
    `Status: ${file.status}`,
    file.stats
      ? `Stats: +${file.stats.additions ?? "?"} -${file.stats.deletions ?? "?"}`
      : "Stats: unavailable",
    "Patch unavailable for this file.",
  ].join("\n");
}

export async function buildQuizPromptContext(
  settings: QuizSettings,
  selectedPath: string | null,
): Promise<QuizPromptContext> {
  const files = await getChangedFiles();
  const sourceFingerprint = toSourceFingerprint(files);
  const promptFiles = pickPromptFiles(files, settings, selectedPath);

  if (promptFiles.length === 0) {
    return {
      sourceFingerprint,
      focusFiles: [],
      promptContext: "No changed files were available for quiz generation.",
    };
  }

  const sections: string[] = [];

  for (const file of promptFiles) {
    const scope = toScope(file.status);

    try {
      const summary = await getDiffSummary(file.path, scope, 2);

      if (!summary.file || !summary.file.patch) {
        sections.push(toFallbackPromptSection(file));
        continue;
      }

      sections.push(
        [
          `File: ${summary.file.path}`,
          `Scope: ${scope}`,
          `Stats: +${summary.file.stats.additions} -${summary.file.stats.deletions} hunks:${summary.file.stats.hunks}`,
          "Patch:",
          toBoundedPatch(summary.file.patch),
        ].join("\n"),
      );
    } catch {
      sections.push(toFallbackPromptSection(file));
    }
  }

  return {
    sourceFingerprint,
    focusFiles: promptFiles.map((file) => file.path),
    promptContext: sections.join("\n\n---\n\n"),
  };
}
