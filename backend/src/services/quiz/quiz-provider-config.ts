import type { ModelReasoningEffort } from "@openai/codex-sdk";
import type { QuizProviderId, QuizProviderPreference } from "@diffx/contracts";

export type QuizGenerationInput = {
  questionCount: number;
  commitMessage: string;
  focusFiles: string[];
  promptContext: string;
};

export type QuizProviderConfig = {
  preference: QuizProviderPreference;
  codex: {
    model: string;
    reasoningEffort: ModelReasoningEffort;
  };
  claude: {
    model: string;
  };
  opencode: {
    model: string | null;
  };
};

type OpencodeModelRef = {
  providerID: string;
  modelID: string;
};

const QUIZ_PROVIDER_PREFERENCE_ENV_KEY = "DIFFX_QUIZ_PROVIDER";
const QUIZ_CODEX_MODEL_ENV_KEY = "DIFFX_QUIZ_CODEX_MODEL";
const QUIZ_CODEX_REASONING_EFFORT_ENV_KEY = "DIFFX_QUIZ_CODEX_REASONING_EFFORT";
const QUIZ_CLAUDE_MODEL_ENV_KEY = "DIFFX_QUIZ_CLAUDE_MODEL";
const QUIZ_OPENCODE_MODEL_ENV_KEY = "DIFFX_QUIZ_OPENCODE_MODEL";

const DEFAULT_QUIZ_PROVIDER_PREFERENCE: QuizProviderPreference = "auto";
const DEFAULT_QUIZ_CODEX_MODEL = "gpt-5.3-codex-spark";
const DEFAULT_QUIZ_CODEX_REASONING_EFFORT: ModelReasoningEffort = "xhigh";
const DEFAULT_QUIZ_CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

const VALID_PROVIDER_PREFERENCES: QuizProviderPreference[] = [
  "auto",
  "codex",
  "claude",
  "opencode",
];

const VALID_REASONING_EFFORTS: ModelReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function normalizeEnvValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveProviderPreference(): QuizProviderPreference {
  const configuredPreference = normalizeEnvValue(process.env[QUIZ_PROVIDER_PREFERENCE_ENV_KEY]);

  if (!configuredPreference) {
    return DEFAULT_QUIZ_PROVIDER_PREFERENCE;
  }

  return VALID_PROVIDER_PREFERENCES.includes(configuredPreference as QuizProviderPreference)
    ? (configuredPreference as QuizProviderPreference)
    : DEFAULT_QUIZ_PROVIDER_PREFERENCE;
}

function resolveCodexModel(): string {
  return normalizeEnvValue(process.env[QUIZ_CODEX_MODEL_ENV_KEY]) ?? DEFAULT_QUIZ_CODEX_MODEL;
}

function resolveCodexReasoningEffort(): ModelReasoningEffort {
  const configuredEffort = normalizeEnvValue(process.env[QUIZ_CODEX_REASONING_EFFORT_ENV_KEY]);

  if (!configuredEffort) {
    return DEFAULT_QUIZ_CODEX_REASONING_EFFORT;
  }

  return VALID_REASONING_EFFORTS.includes(configuredEffort as ModelReasoningEffort)
    ? (configuredEffort as ModelReasoningEffort)
    : DEFAULT_QUIZ_CODEX_REASONING_EFFORT;
}

function resolveClaudeModel(): string {
  return normalizeEnvValue(process.env[QUIZ_CLAUDE_MODEL_ENV_KEY]) ?? DEFAULT_QUIZ_CLAUDE_MODEL;
}

function resolveOpencodeModel(): string | null {
  return normalizeEnvValue(process.env[QUIZ_OPENCODE_MODEL_ENV_KEY]);
}

export function getQuizProviderConfig(): QuizProviderConfig {
  return {
    preference: resolveProviderPreference(),
    codex: {
      model: resolveCodexModel(),
      reasoningEffort: resolveCodexReasoningEffort(),
    },
    claude: {
      model: resolveClaudeModel(),
    },
    opencode: {
      model: resolveOpencodeModel(),
    },
  };
}

export function parseOpencodeModelRef(value: string | null): OpencodeModelRef | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const providerID = value.slice(0, separatorIndex).trim();
  const modelID = value.slice(separatorIndex + 1).trim();

  if (!providerID || !modelID) {
    return null;
  }

  return {
    providerID,
    modelID,
  };
}
