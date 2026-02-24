import type { DiffScope } from "@diffx/contracts";

export const queryKeys = {
  health: ["health"] as const,
  workspace: ["workspace"] as const,
  repo: ["repo"] as const,
  settings: ["settings"] as const,
  quizProviders: ["quizProviders"] as const,
  filesRoot: ["files"] as const,
  files: ["files"] as const,
  diff: (path: string, scope: DiffScope, contextLines: number, contentHash = "none") =>
    ["diff", path, scope, contextLines, contentHash] as const,
  diffDetailRoot: ["diffDetail"] as const,
  diffDetailPath: (path: string) => ["diffDetail", path] as const,
  diffDetail: (path: string, scope: DiffScope, contextLines: number, contentHash = "none") =>
    ["diffDetail", path, scope, contextLines, contentHash] as const,
  quizSessionRoot: ["quizSession"] as const,
  quizSession: (sessionId: string) => ["quizSession", sessionId] as const,
  codeReviewSessionRoot: ["codeReviewSession"] as const,
  codeReviewSession: (sessionId: string) => ["codeReviewSession", sessionId] as const,
};
