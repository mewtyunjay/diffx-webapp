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

export type WorkspaceState = {
  repoRoot: string;
};

export type GetWorkspaceResponse = WorkspaceState;
export type SetWorkspaceRequest = WorkspaceState;
export type SetWorkspaceResponse = WorkspaceState;

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
export type DiffPaneMode = "diff" | "quiz";

export type DiffQuery = {
  path: string;
  scope: DiffScope;
  contextLines?: number;
};

export type DiffDetailQuery = DiffQuery;
export type FileContentsQuery = DiffQuery & {
  side: DiffSide;
};

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
  | "WORKSPACE_PICK_CANCELLED"
  | "WORKSPACE_PICK_UNSUPPORTED"
  | "INVALID_SETTINGS"
  | "INVALID_QUIZ_SESSION"
  | "INVALID_QUIZ_ANSWER"
  | "INVALID_QUIZ_PAYLOAD"
  | "INVALID_COMMIT_MESSAGE"
  | "COMMIT_MESSAGE_GENERATION_FAILED"
  | "INVALID_PUSH_REQUEST"
  | "QUIZ_SESSION_NOT_FOUND"
  | "QUIZ_SESSION_NOT_READY"
  | "QUIZ_SESSION_FAILED"
  | "QUIZ_VALIDATION_FAILED"
  | "QUIZ_REPO_STATE_CHANGED"
  | "QUIZ_GENERATION_FAILED"
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
export type GenerateCommitMessageRequest = { draft?: string };
export type GenerateCommitMessageResponse = { message: string };
export type PushRequest = { createUpstream?: boolean };

export type QuizGenerationScope = "staged" | "all_changes";
export type QuizValidationMode = "answer_all" | "pass_all" | "score_threshold";
export type QuizProviderId = "codex";
export type QuizProviderPreference = QuizProviderId;

export type QuizSettings = {
  gateEnabled: boolean;
  questionCount: number;
  scope: QuizGenerationScope;
  validationMode: QuizValidationMode;
  scoreThreshold: number | null;
  providerPreference: QuizProviderPreference;
};

export type QuizProviderStatus = {
  id: QuizProviderId;
  available: boolean;
  reason: string | null;
  model: string;
};

export type GetQuizProvidersResponse = {
  providers: QuizProviderStatus[];
};

export type AppSettings = {
  quiz: QuizSettings;
};

export type GetSettingsResponse = AppSettings;
export type PutSettingsRequest = AppSettings;
export type PutSettingsResponse = AppSettings;

export type QuizQuestion = {
  id: string;
  prompt: string;
  snippet: string | null;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string | null;
  tags: string[];
};

export type QuizPayload = {
  title: string;
  generatedAt: string;
  questions: QuizQuestion[];
};

export type QuizSessionStatus = "queued" | "streaming" | "ready" | "failed" | "validated";

export type QuizSessionProgress = {
  phase: "queued" | "generating" | "validating";
  percent: number;
  message: string;
};

export type QuizValidationResult = {
  mode: QuizValidationMode;
  passed: boolean;
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
  score: number;
  scoreThreshold: number | null;
};

export type QuizGenerationFailure = {
  message: string;
  retryable: boolean;
};

export type QuizSession = {
  id: string;
  status: QuizSessionStatus;
  sourceFingerprint: string;
  commitMessageDraft: string;
  createdAt: string;
  updatedAt: string;
  progress: QuizSessionProgress;
  quiz: QuizPayload | null;
  answers: Record<string, number>;
  validation: QuizValidationResult | null;
  failure: QuizGenerationFailure | null;
};

export type CreateQuizSessionRequest = {
  commitMessage: string;
};

export type SubmitQuizAnswersRequest = {
  answers: Record<string, number>;
};

export type ValidateQuizSessionRequest = {
  sourceFingerprint: string;
};

export type QuizSessionStatusEvent = {
  type: "session_status";
  session: QuizSession;
};

export type QuizSessionErrorEvent = {
  type: "session_error";
  session: QuizSession;
  retryable: boolean;
  message: string;
};

export type QuizReadyEvent = {
  type: "quiz_ready";
  session: QuizSession;
  quiz: QuizPayload;
};

export type QuizSessionCompleteEvent = {
  type: "session_complete";
  session: QuizSession;
};

export type QuizSseEvent =
  | QuizSessionStatusEvent
  | QuizSessionErrorEvent
  | QuizReadyEvent
  | QuizSessionCompleteEvent;

export type ActionResponse = {
  ok: boolean;
  message: string;
};
