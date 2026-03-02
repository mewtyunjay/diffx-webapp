import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex, type RunResult, type ThreadItem } from "@openai/codex-sdk";
import type {
  ActionResponse,
  GenerateCommitMessageRequest,
  PushRequest,
} from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { getDiffSummary } from "../diff/diff-summary.service.js";
import {
  GitCommandError,
  type GitExecResult,
  execGit,
  toGitApiError,
} from "./git-client.js";
import { getChangedFiles, invalidateChangedFilesCache } from "./files.service.js";
import { resolveRepoPath } from "./path.service.js";
import {
  invalidateRepoContextCache,
  requireGitContext,
} from "./repo-context.service.js";
import { invalidateRemoteHashCache } from "./revision-hash.service.js";
import { invalidateStatusEntriesCache } from "./status.service.js";

let mutationQueue: Promise<void> = Promise.resolve();

async function withMutationQueue<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = mutationQueue.then(operation);
  mutationQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );
  return await nextOperation;
}

function isNoUpstreamError(error: GitCommandError): boolean {
  const stderr = error.stderr.toLowerCase();
  return stderr.includes("has no upstream branch") || stderr.includes("no upstream configured");
}

function firstGitOutputLine(result: GitExecResult): string | null {
  return [result.stdout, result.stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null;
}

function resolveUniqueRelativePaths(repoRoot: string, requestedPaths: string[]): string[] {
  const uniquePaths = new Set<string>();

  for (const requestedPath of requestedPaths) {
    const resolvedPath = resolveRepoPath(repoRoot, requestedPath);
    uniquePaths.add(resolvedPath.relativePath);
  }

  return [...uniquePaths];
}

function invalidateGitDerivedCaches(): void {
  invalidateRepoContextCache();
  invalidateStatusEntriesCache();
  invalidateChangedFilesCache();
  invalidateRemoteHashCache();
}

const execFileAsync = promisify(execFile);
const API_KEY_ENV_KEYS = new Set(["OPENAI_API_KEY", "CODEX_API_KEY"]);
const RECENT_COMMIT_HISTORY_LIMIT = 6;
const AUTH_CHECK_TIMEOUT_MS = 5000;
const COMMIT_MESSAGE_MODEL = "gpt-5.3-codex-spark";
const MAX_RESPONSE_TEXT_DEPTH = 8;
const MAX_RESPONSE_TEXT_PARTS = 2000;
const COMMIT_MESSAGE_PLACEHOLDER_PATTERN = /^item[\s_-]*\d+$/i;
const COMMIT_MESSAGE_ALPHA_PATTERN = /[a-z]/i;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function buildLocalCodexEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") {
      continue;
    }

    if (API_KEY_ENV_KEYS.has(key)) {
      continue;
    }

    env[key] = value;
  }

  return env;
}

type FileWithStatus = {
  status: string;
};

export function filterStagedFilesForCommitContext<TFile extends FileWithStatus>(files: TFile[]): TFile[] {
  return files.filter((file) => file.status === "staged");
}

function collectTextParts(
  value: unknown,
  sink: string[],
  depth: number,
  visited: Set<object>,
): void {
  if (sink.length >= MAX_RESPONSE_TEXT_PARTS || depth > MAX_RESPONSE_TEXT_DEPTH) {
    return;
  }

  if (typeof value === "string") {
    if (value.trim().length > 0) {
      sink.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, sink, depth + 1, visited);
      if (sink.length >= MAX_RESPONSE_TEXT_PARTS) {
        return;
      }
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const child of Object.values(value as Record<string, unknown>)) {
    collectTextParts(child, sink, depth + 1, visited);
    if (sink.length >= MAX_RESPONSE_TEXT_PARTS) {
      return;
    }
  }
}

function normalizeResponseText(value: unknown): string | null {
  const parts: string[] = [];
  collectTextParts(value, parts, 0, new Set<object>());

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n");
}

function asNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim().length > 0 ? value : null;
}

function extractAgentMessageText(items: unknown): string | null {
  if (!Array.isArray(items)) {
    return null;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (!item || typeof item !== "object") {
      continue;
    }

    const threadItem = item as ThreadItem;
    if (threadItem.type !== "agent_message") {
      continue;
    }

    const text = asNonEmptyText(threadItem.text);
    if (text) {
      return text;
    }
  }

  return null;
}

export function extractCommitMessageResponseText(value: unknown): string | null {
  const directText = asNonEmptyText(value);
  if (directText) {
    return directText;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const runResult = value as Partial<RunResult> & Record<string, unknown>;
  const preferredTexts = [
    asNonEmptyText(runResult.finalResponse),
    extractAgentMessageText(runResult.items),
    asNonEmptyText(runResult.output_text),
    asNonEmptyText(runResult.message),
    asNonEmptyText(runResult.response),
    asNonEmptyText(runResult.result),
    asNonEmptyText(runResult.text),
  ];

  for (const preferredText of preferredTexts) {
    if (preferredText) {
      return preferredText;
    }
  }

  return normalizeResponseText(value);
}

export function sanitizeCommitMessageSuggestion(value: string): string | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "```");

  for (const line of lines) {
    let candidate = line
      .replace(/^[\-*]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^commit message\s*[:\-]\s*/i, "")
      .replace(/^['"`]+|['"`]+$/g, "")
      .trim();

    if (candidate.length === 0) {
      continue;
    }

    if (COMMIT_MESSAGE_PLACEHOLDER_PATTERN.test(candidate)) {
      continue;
    }

    if (!COMMIT_MESSAGE_ALPHA_PATTERN.test(candidate)) {
      continue;
    }

    if (candidate.length > 72) {
      candidate = candidate.slice(0, 72).trimEnd();
    }

    return candidate;
  }

  return null;
}

async function getRecentCommitSubjects(repoRoot: string): Promise<string[]> {
  try {
    const result = await execGit(
      [
        "-C",
        repoRoot,
        "log",
        `-${RECENT_COMMIT_HISTORY_LIMIT}`,
        "--pretty=format:%s",
      ],
      { allowExitCodes: [0, 128] },
    );

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, RECENT_COMMIT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

async function getStagedFileContext(): Promise<string> {
  const files = await getChangedFiles();
  const stagedFiles = filterStagedFilesForCommitContext(files);

  if (stagedFiles.length === 0) {
    throw new ApiRouteError(
      409,
      "COMMIT_MESSAGE_GENERATION_FAILED",
      "Stage at least one file before generating a commit message.",
    );
  }

  const sections = await Promise.all(
    stagedFiles.map(async (file) => {
      try {
        const summary = await getDiffSummary(file.path, "staged", 2);

        if (!summary.file || !summary.file.patch) {
          return [
            `File: ${file.path}`,
            `Status: ${file.status}`,
            file.stats
              ? `Stats: +${file.stats.additions ?? "?"} -${file.stats.deletions ?? "?"}`
              : "Stats: unavailable",
            "Patch unavailable.",
          ].join("\n");
        }

        return [
          `File: ${summary.file.path}`,
          `Stats: +${summary.file.stats.additions} -${summary.file.stats.deletions} hunks:${summary.file.stats.hunks}`,
          "Patch:",
          summary.file.patch,
        ].join("\n");
      } catch {
        return [
          `File: ${file.path}`,
          "Patch unavailable.",
        ].join("\n");
      }
    }),
  );

  return sections.join("\n\n---\n\n");
}

async function checkCodexCliAuth(): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
      timeout: AUTH_CHECK_TIMEOUT_MS,
      env: buildLocalCodexEnv(),
      maxBuffer: 1024 * 1024,
    });

    const output = `${stdout ?? ""}\n${stderr ?? ""}`.toLowerCase();
    if (output.includes("logged in") || output.includes("chatgpt")) {
      return;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new ApiRouteError(
        502,
        "COMMIT_MESSAGE_GENERATION_FAILED",
        "Codex CLI is not installed. Install Codex and run `codex login`.",
      );
    }

    const stdout =
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : "";
    const output = `${stdout}\n${stderr}`.toLowerCase();

    if (output.includes("logged in") || output.includes("chatgpt")) {
      return;
    }
  }

  throw new ApiRouteError(
    502,
    "COMMIT_MESSAGE_GENERATION_FAILED",
    "Codex local auth is missing. Run `codex login` and retry commit message generation.",
  );
}

export function buildCommitMessagePrompt(input: {
  stagedFileContext: string;
  recentCommitSubjects: string[];
  draft: string | null;
}): string {
  const history =
    input.recentCommitSubjects.length > 0
      ? input.recentCommitSubjects.map((subject) => `- ${subject}`).join("\n")
      : "- (no local history available)";

  const draftContext = input.draft
    ? `Current draft from user:\n${input.draft}\n\n`
    : "";

  return [
    "You write Git commit subject lines.",
    "Return exactly one commit subject line.",
    "Constraints:",
    "- imperative style",
    "- max 72 characters",
    "- no quotes, no bullets, no markdown",
    "- avoid trailing period",
    "",
    "Recent local commit subjects:",
    history,
    "",
    draftContext,
    "Current staged change context:",
    input.stagedFileContext,
  ].join("\n");
}

function toCommitMessageGenerationError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) {
    return error;
  }

  const message = error instanceof Error ? error.message.trim() : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("not logged") || normalized.includes("login required")) {
    return new ApiRouteError(
      502,
      "COMMIT_MESSAGE_GENERATION_FAILED",
      "Codex local auth is missing. Run `codex login` and retry commit message generation.",
    );
  }

  if (
    normalized.includes("auth") ||
    normalized.includes("credential") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return new ApiRouteError(
      502,
      "COMMIT_MESSAGE_GENERATION_FAILED",
      "Codex authentication failed. Verify local Codex login with `codex login status` and retry.",
    );
  }

  if (
    normalized.includes("model") &&
    (normalized.includes("not found") ||
      normalized.includes("unknown") ||
      normalized.includes("unsupported") ||
      normalized.includes("invalid"))
  ) {
    return new ApiRouteError(
      502,
      "COMMIT_MESSAGE_GENERATION_FAILED",
      "Codex model is invalid. Ensure commit message generation uses gpt-5.3-codex-spark.",
    );
  }

  return new ApiRouteError(
    502,
    "COMMIT_MESSAGE_GENERATION_FAILED",
    message.length > 0
      ? `Commit message generation failed: ${message}`
      : "Commit message generation failed.",
  );
}

export async function stageFile(requestedPath: string): Promise<ActionResponse> {
  const context = await requireGitContext();
  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);

  return await withMutationQueue(async () => {
    try {
      await execGit(["-C", context.repoRoot, "add", "--", resolvedPath.relativePath]);
      invalidateGitDerivedCaches();
      return {
        ok: true,
        message: `Staged ${resolvedPath.relativePath}`,
      };
    } catch (error) {
      throw toGitApiError(error, "Unable to stage file.", 409);
    }
  });
}

export async function stageManyFiles(requestedPaths: string[]): Promise<ActionResponse> {
  const context = await requireGitContext();
  const relativePaths = resolveUniqueRelativePaths(context.repoRoot, requestedPaths);

  if (relativePaths.length === 0) {
    throw new ApiRouteError(400, "INVALID_PATH", "At least one file path is required.");
  }

  return await withMutationQueue(async () => {
    try {
      await execGit(["-C", context.repoRoot, "add", "--", ...relativePaths]);
      invalidateGitDerivedCaches();
      const fileLabel = relativePaths.length === 1 ? "file" : "files";

      return {
        ok: true,
        message: `Staged ${relativePaths.length} ${fileLabel}.`,
      };
    } catch (error) {
      throw toGitApiError(error, "Unable to stage files.", 409);
    }
  });
}

export async function unstageFile(requestedPath: string): Promise<ActionResponse> {
  const context = await requireGitContext();
  const resolvedPath = resolveRepoPath(context.repoRoot, requestedPath);

  return await withMutationQueue(async () => {
    try {
      await execGit([
        "-C",
        context.repoRoot,
        "restore",
        "--staged",
        "--",
        resolvedPath.relativePath,
      ]);
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw toGitApiError(error, "Unable to unstage file.", 409);
      }

      try {
        await execGit([
          "-C",
          context.repoRoot,
          "reset",
          "HEAD",
          "--",
          resolvedPath.relativePath,
        ]);
      } catch (fallbackError) {
        throw toGitApiError(fallbackError, "Unable to unstage file.", 409);
      }
    }

    invalidateGitDerivedCaches();

    return {
      ok: true,
      message: `Unstaged ${resolvedPath.relativePath}`,
    };
  });
}

export async function unstageManyFiles(requestedPaths: string[]): Promise<ActionResponse> {
  const context = await requireGitContext();
  const relativePaths = resolveUniqueRelativePaths(context.repoRoot, requestedPaths);

  if (relativePaths.length === 0) {
    throw new ApiRouteError(400, "INVALID_PATH", "At least one file path is required.");
  }

  return await withMutationQueue(async () => {
    try {
      await execGit([
        "-C",
        context.repoRoot,
        "restore",
        "--staged",
        "--",
        ...relativePaths,
      ]);
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw toGitApiError(error, "Unable to unstage files.", 409);
      }

      try {
        await execGit([
          "-C",
          context.repoRoot,
          "reset",
          "HEAD",
          "--",
          ...relativePaths,
        ]);
      } catch (fallbackError) {
        throw toGitApiError(fallbackError, "Unable to unstage files.", 409);
      }
    }

    invalidateGitDerivedCaches();

    const fileLabel = relativePaths.length === 1 ? "file" : "files";

    return {
      ok: true,
      message: `Unstaged ${relativePaths.length} ${fileLabel}.`,
    };
  });
}

export async function commitChanges(messageInput: string): Promise<ActionResponse> {
  const message = messageInput.trim();

  if (!message) {
    throw new ApiRouteError(
      400,
      "INVALID_COMMIT_MESSAGE",
      "Commit message must not be empty.",
    );
  }

  const context = await requireGitContext();

  return await withMutationQueue(async () => {
    let result: GitExecResult;

    try {
      result = await execGit(
        ["-C", context.repoRoot, "commit", "-m", message],
        { allowExitCodes: [0, 1] },
      );
    } catch (error) {
      throw toGitApiError(error, "Unable to create commit.", 409);
    }

    if (result.exitCode !== 0) {
      throw new ApiRouteError(409, "GIT_COMMAND_FAILED", "Unable to create commit.", {
        stderr: result.stderr.trim() || null,
        stdout: result.stdout.trim() || null,
        exitCode: result.exitCode,
      });
    }

    invalidateGitDerivedCaches();

    const firstLine = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    return {
      ok: true,
      message: firstLine ?? "Commit created.",
    };
  });
}

export async function generateCommitMessage(
  request: GenerateCommitMessageRequest = {},
): Promise<ActionResponse> {
  const context = await requireGitContext();
  const draft = typeof request.draft === "string" ? request.draft.trim() : "";

  return await withMutationQueue(async () => {
    if (isTestRuntime()) {
      return {
        ok: true,
        message: "update staged changes",
      };
    }

    try {
      await checkCodexCliAuth();

      const [recentCommitSubjects, stagedFileContext] = await Promise.all([
        getRecentCommitSubjects(context.repoRoot),
        getStagedFileContext(),
      ]);

      const prompt = buildCommitMessagePrompt({
        stagedFileContext,
        recentCommitSubjects,
        draft: draft.length > 0 ? draft : null,
      });

      const client = new Codex({ env: buildLocalCodexEnv() });
      const thread = client.startThread({
        model: COMMIT_MESSAGE_MODEL,
        modelReasoningEffort: "medium",
      });
      const rawResponse = await thread.run(prompt);
      const responseText = extractCommitMessageResponseText(rawResponse);

      if (!responseText) {
        throw new ApiRouteError(
          502,
          "COMMIT_MESSAGE_GENERATION_FAILED",
          "Codex returned an empty commit message response.",
        );
      }

      const suggestion = sanitizeCommitMessageSuggestion(responseText);

      if (!suggestion) {
        throw new ApiRouteError(
          502,
          "COMMIT_MESSAGE_GENERATION_FAILED",
          "Codex did not return a usable commit message suggestion.",
        );
      }

      return {
        ok: true,
        message: suggestion,
      };
    } catch (error) {
      throw toCommitMessageGenerationError(error);
    }
  });
}

export async function pushChanges(request: PushRequest = {}): Promise<ActionResponse> {
  const context = await requireGitContext();
  const createUpstream = request.createUpstream === true;

  return await withMutationQueue(async () => {
    try {
      const pushArgs = createUpstream
        ? [
            "-C",
            context.repoRoot,
            "push",
            "--set-upstream",
            "origin",
            context.branch ?? "",
          ]
        : ["-C", context.repoRoot, "push"];

      if (createUpstream && !context.branch) {
        throw new ApiRouteError(
          409,
          "GIT_COMMAND_FAILED",
          "Cannot create upstream from detached HEAD.",
        );
      }

      const result = await execGit(pushArgs);
      invalidateGitDerivedCaches();
      const line = firstGitOutputLine(result);

      return {
        ok: true,
        message: line ?? (createUpstream ? "Upstream created and pushed." : "Push completed."),
      };
    } catch (error) {
      if (error instanceof GitCommandError && isNoUpstreamError(error)) {
        const branchName = context.branch ?? "current branch";
        throw new ApiRouteError(
          409,
          "NO_UPSTREAM",
          `No upstream exists for '${branchName}'. Should I create one with the same name?`,
          {
            branch: context.branch,
            createUpstreamHint: context.branch ? `git push --set-upstream origin ${context.branch}` : null,
          },
        );
      }

      throw toGitApiError(error, "Unable to push changes.", 409);
    }
  });
}
