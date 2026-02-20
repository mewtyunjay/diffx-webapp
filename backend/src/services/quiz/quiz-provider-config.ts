import type { ModelReasoningEffort } from "@openai/codex-sdk";
import type { QuizProviderPreference } from "@diffx/contracts";

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
};

const QUIZ_PROVIDER_PREFERENCE_ENV_KEY = "DIFFX_QUIZ_PROVIDER";
const QUIZ_CODEX_MODEL_ENV_KEY = "DIFFX_QUIZ_CODEX_MODEL";
const QUIZ_CODEX_REASONING_EFFORT_ENV_KEY = "DIFFX_QUIZ_CODEX_REASONING_EFFORT";

const DEFAULT_QUIZ_PROVIDER_PREFERENCE: QuizProviderPreference = "codex";
const DEFAULT_QUIZ_CODEX_MODEL = "gpt-5.3-codex-spark";
const DEFAULT_QUIZ_CODEX_REASONING_EFFORT: ModelReasoningEffort = "xhigh";

const VALID_PROVIDER_PREFERENCES: QuizProviderPreference[] = ["codex"];

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

export function getQuizProviderConfig(): QuizProviderConfig {
  return {
    preference: resolveProviderPreference(),
    codex: {
      model: resolveCodexModel(),
      reasoningEffort: resolveCodexReasoningEffort(),
    },
  };
}
