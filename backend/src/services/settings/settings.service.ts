import type { AppSettings, QuizProviderPreference, QuizValidationMode } from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";

const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 12;

const DEFAULT_SETTINGS: AppSettings = {
  quiz: {
    gateEnabled: false,
    questionCount: 4,
    scope: "staged",
    validationMode: "answer_all",
    scoreThreshold: null,
    providerPreference: "auto",
  },
};

let settingsState: AppSettings = cloneSettings(DEFAULT_SETTINGS);

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    quiz: {
      gateEnabled: settings.quiz.gateEnabled,
      questionCount: settings.quiz.questionCount,
      scope: settings.quiz.scope,
      validationMode: settings.quiz.validationMode,
      scoreThreshold: settings.quiz.scoreThreshold,
      providerPreference: settings.quiz.providerPreference,
    },
  };
}

function isValidationMode(value: unknown): value is QuizValidationMode {
  return value === "answer_all" || value === "pass_all" || value === "score_threshold";
}

function isProviderPreference(value: unknown): value is QuizProviderPreference {
  return value === "auto" || value === "codex" || value === "claude" || value === "opencode";
}

function toInvalidSettingsError(message: string): ApiRouteError {
  return new ApiRouteError(400, "INVALID_SETTINGS", message);
}

function normalizeThreshold(
  mode: QuizValidationMode,
  thresholdInput: number | null,
  questionCount: number,
): number | null {
  if (mode !== "score_threshold") {
    if (thresholdInput !== null) {
      throw toInvalidSettingsError(
        "`quiz.scoreThreshold` must be null unless `quiz.validationMode` is 'score_threshold'.",
      );
    }

    return null;
  }

  if (thresholdInput === null) {
    throw toInvalidSettingsError(
      "`quiz.scoreThreshold` is required when `quiz.validationMode` is 'score_threshold'.",
    );
  }

  if (!Number.isInteger(thresholdInput)) {
    throw toInvalidSettingsError("`quiz.scoreThreshold` must be an integer.");
  }

  if (thresholdInput < 1 || thresholdInput > questionCount) {
    throw toInvalidSettingsError(
      "`quiz.scoreThreshold` must be between 1 and `quiz.questionCount`.",
    );
  }

  return thresholdInput;
}

function validateAndNormalizeSettings(next: AppSettings): AppSettings {
  if (typeof next !== "object" || next === null) {
    throw toInvalidSettingsError("Request body must be a settings object.");
  }

  const quiz = next.quiz;

  if (typeof quiz !== "object" || quiz === null) {
    throw toInvalidSettingsError("`quiz` settings are required.");
  }

  if (typeof quiz.gateEnabled !== "boolean") {
    throw toInvalidSettingsError("`quiz.gateEnabled` must be boolean.");
  }

  if (!Number.isInteger(quiz.questionCount)) {
    throw toInvalidSettingsError("`quiz.questionCount` must be an integer.");
  }

  if (quiz.questionCount < MIN_QUESTION_COUNT || quiz.questionCount > MAX_QUESTION_COUNT) {
    throw toInvalidSettingsError(
      `\`quiz.questionCount\` must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`,
    );
  }

  if (quiz.scope !== "staged" && quiz.scope !== "all_changes") {
    throw toInvalidSettingsError("`quiz.scope` must be 'staged' or 'all_changes'.");
  }

  if (!isValidationMode(quiz.validationMode)) {
    throw toInvalidSettingsError(
      "`quiz.validationMode` must be 'answer_all', 'pass_all', or 'score_threshold'.",
    );
  }

  if (!isProviderPreference(quiz.providerPreference)) {
    throw toInvalidSettingsError(
      "`quiz.providerPreference` must be 'auto', 'codex', 'claude', or 'opencode'.",
    );
  }

  const normalizedThreshold = normalizeThreshold(
    quiz.validationMode,
    quiz.scoreThreshold,
    quiz.questionCount,
  );

  return {
    quiz: {
      gateEnabled: quiz.gateEnabled,
      questionCount: quiz.questionCount,
        scope: quiz.scope,
        validationMode: quiz.validationMode,
        scoreThreshold: normalizedThreshold,
        providerPreference: quiz.providerPreference,
      },
    };
}

export function getSettings(): AppSettings {
  return cloneSettings(settingsState);
}

export function updateSettings(next: AppSettings): AppSettings {
  const normalized = validateAndNormalizeSettings(next);
  settingsState = normalized;
  return cloneSettings(settingsState);
}

export function resetSettingsForTests() {
  settingsState = cloneSettings(DEFAULT_SETTINGS);
}
