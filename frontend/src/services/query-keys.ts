import type { DiffScope, DiffSide } from "@diffx/contracts";

export const queryKeys = {
  health: ["health"] as const,
  repo: ["repo"] as const,
  filesRoot: ["files"] as const,
  files: ["files"] as const,
  branches: ["branches"] as const,
  diff: (path: string, scope: DiffScope, contextLines: number, contentHash = "none") =>
    ["diff", path, scope, contextLines, contentHash] as const,
  diffDetailRoot: ["diffDetail"] as const,
  diffDetailPath: (path: string) => ["diffDetail", path] as const,
  diffDetail: (path: string, contextLines: number, contentHash = "none") =>
    ["diffDetail", path, contextLines, contentHash] as const,
  fileContents: (path: string, scope: DiffScope, side: DiffSide) =>
    ["fileContents", path, scope, side] as const,
};
