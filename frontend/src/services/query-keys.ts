import type { DiffScope, DiffSide } from "@diffx/contracts";

export const queryKeys = {
  health: ["health"] as const,
  repo: ["repo"] as const,
  files: ["files"] as const,
  branches: ["branches"] as const,
  diff: (path: string, scope: DiffScope, contextLines: number) =>
    ["diff", path, scope, contextLines] as const,
  fileContents: (path: string, scope: DiffScope, side: DiffSide) =>
    ["fileContents", path, scope, side] as const,
};
