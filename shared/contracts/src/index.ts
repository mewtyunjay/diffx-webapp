// Defines shared API contracts; data flows backend responses/requests <-> frontend clients using the same types.
export type RepoMode = "git" | "non-git";
export type DiffScope = "staged" | "unstaged";
export type DiffSide = "old" | "new";

export type RepoSummary = {
  mode: RepoMode;
  repoName: string;
  branch: string | null;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  remoteHash: string;
};

export type ChangedFileStatus = "staged" | "unstaged" | "untracked";

export type ChangedFileStats = {
  additions: number | null;
  deletions: number | null;
};

export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  contentHash: string;
  stats: ChangedFileStats | null;
};

export type BranchSummary = {
  name: string;
  current: boolean;
};

export type BranchesResponse = {
  mode: RepoMode;
  branches: BranchSummary[];
};

export type DiffViewMode = "split" | "unified";

export type DiffQuery = {
  path: string;
  scope: DiffScope;
  contextLines?: number;
};

export type DiffDetailQuery = DiffQuery;

export type DiffStats = {
  additions: number;
  deletions: number;
  hunks: number;
};

export type FileDiff = {
  path: string;
  oldPath: string | null;
  newPath: string | null;
  languageHint: string | null;
  isBinary: boolean;
  tooLarge: boolean;
  patch: string | null;
  stats: DiffStats;
};

export type DiffSummaryResponse = {
  mode: RepoMode;
  file: FileDiff | null;
};

export type FileContentsQuery = {
  path: string;
  scope: DiffScope;
  side: DiffSide;
};

export type FileContents = {
  name: string;
  contents: string;
};

export type FileContentsResponse = {
  mode: RepoMode;
  side: DiffSide;
  file: FileContents | null;
  isBinary: boolean;
  tooLarge: boolean;
  languageHint: string | null;
};

export type DiffDetailSide = {
  file: FileContents | null;
  isBinary: boolean;
  tooLarge: boolean;
  error: boolean;
};

export type DiffDetailResponse = {
  mode: RepoMode;
  file: FileDiff | null;
  old: DiffDetailSide;
  new: DiffDetailSide;
};

export type ApiErrorCode =
  | "NOT_GIT_REPO"
  | "FILE_NOT_FOUND"
  | "BINARY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_SCOPE"
  | "INVALID_SIDE"
  | "INVALID_PATH"
  | "INVALID_COMMIT_MESSAGE"
  | "INVALID_PUSH_REQUEST"
  | "NO_UPSTREAM"
  | "GIT_COMMAND_FAILED"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type HealthResponse = { ok: boolean };

export type StageFileRequest = { path: string };
export type StageManyRequest = { paths: string[] };
export type UnstageFileRequest = { path: string };
export type UnstageManyRequest = { paths: string[] };
export type CommitRequest = { message: string };
export type PushRequest = { createUpstream?: boolean };

export type ActionResponse = {
  ok: boolean;
  message: string;
};
