import { useEffect, useState } from "react";
import type {
  AppSettings,
  QuizGenerationScope,
  QuizProviderPreference,
  QuizProviderStatus,
  QuizValidationMode,
} from "@diffx/contracts";

const SCOPE_OPTIONS: Array<{ value: QuizGenerationScope; label: string }> = [
  { value: "staged", label: "staged changes" },
  { value: "all_changes", label: "all changes" },
];

const VALIDATION_OPTIONS: Array<{ value: QuizValidationMode; label: string }> = [
  { value: "answer_all", label: "answer all" },
  { value: "pass_all", label: "pass all" },
  { value: "score_threshold", label: "score threshold" },
];

const PROVIDER_OPTIONS: Array<{ value: QuizProviderPreference; label: string }> = [
  { value: "auto", label: "auto" },
  { value: "codex", label: "codex" },
  { value: "claude", label: "claude" },
  { value: "opencode", label: "opencode" },
];

type SettingsModalProps = {
  open: boolean;
  settings: AppSettings;
  isSaving: boolean;
  error: string | null;
  providerStatuses: QuizProviderStatus[];
  isLoadingProviders: boolean;
  providersError: string | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
};

export function SettingsModal({
  open,
  settings,
  isSaving,
  error,
  providerStatuses,
  isLoadingProviders,
  providersError,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [gateEnabled, setGateEnabled] = useState(settings.quiz.gateEnabled);
  const [questionCount, setQuestionCount] = useState(String(settings.quiz.questionCount));
  const [scope, setScope] = useState<QuizGenerationScope>(settings.quiz.scope);
  const [validationMode, setValidationMode] = useState<QuizValidationMode>(settings.quiz.validationMode);
  const [providerPreference, setProviderPreference] = useState<QuizProviderPreference>(
    settings.quiz.providerPreference,
  );
  const [scoreThreshold, setScoreThreshold] = useState(
    settings.quiz.scoreThreshold === null ? "" : String(settings.quiz.scoreThreshold),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setGateEnabled(settings.quiz.gateEnabled);
    setQuestionCount(String(settings.quiz.questionCount));
    setScope(settings.quiz.scope);
    setValidationMode(settings.quiz.validationMode);
    setProviderPreference(settings.quiz.providerPreference);
    setScoreThreshold(settings.quiz.scoreThreshold === null ? "" : String(settings.quiz.scoreThreshold));
    setLocalError(null);
  }, [open, settings]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <p className="hud-label">settings</p>
          <button type="button" className="hud-button hud-button-compact" onClick={onClose}>
            close
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-row">
            <span className="settings-label">Quiz gate</span>
            <button
              type="button"
              role="switch"
              aria-checked={gateEnabled}
              className={gateEnabled ? "settings-switch settings-switch-enabled" : "settings-switch"}
              onClick={() => setGateEnabled((enabled) => !enabled)}
            >
              <span className="settings-switch-track" aria-hidden="true">
                <span className="settings-switch-thumb" />
              </span>
              <span>{gateEnabled ? "enabled" : "disabled"}</span>
            </button>
          </div>

          <label className="settings-row" htmlFor="quiz-question-count">
            <span className="settings-label">Question count</span>
            <input
              id="quiz-question-count"
              className="settings-input settings-input-number"
              type="number"
              min={1}
              max={12}
              value={questionCount}
              onChange={(event) => setQuestionCount(event.target.value)}
            />
          </label>

          <div className="settings-row settings-row-block">
            <span className="settings-label">Generation scope</span>
            <div className="settings-segment" role="radiogroup" aria-label="Quiz generation scope">
              {SCOPE_OPTIONS.map((option) => {
                const selected = scope === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "settings-segment-button settings-segment-button-selected" : "settings-segment-button"}
                    onClick={() => setScope(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row settings-row-block">
            <span className="settings-label">Validation mode</span>
            <div className="settings-segment" role="radiogroup" aria-label="Quiz validation mode">
              {VALIDATION_OPTIONS.map((option) => {
                const selected = validationMode === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "settings-segment-button settings-segment-button-selected" : "settings-segment-button"}
                    onClick={() => setValidationMode(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row settings-row-block">
            <span className="settings-label">Quiz provider</span>
            <div className="settings-segment" role="radiogroup" aria-label="Quiz provider preference">
              {PROVIDER_OPTIONS.map((option) => {
                const selected = providerPreference === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "settings-segment-button settings-segment-button-selected" : "settings-segment-button"}
                    onClick={() => setProviderPreference(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {isLoadingProviders ? <p className="settings-meta">Checking provider availability...</p> : null}
            {providersError ? <p className="error-note">{providersError}</p> : null}
            {!isLoadingProviders && !providersError ? (
              <div className="settings-provider-list" aria-label="Quiz provider availability">
                {providerStatuses.map((provider) => (
                  <p key={provider.id} className={provider.available ? "settings-meta" : "settings-meta settings-meta-warning"}>
                    {provider.id}: {provider.available ? `ready (${provider.model})` : provider.reason ?? "unavailable"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          {validationMode === "score_threshold" ? (
            <label className="settings-row" htmlFor="quiz-threshold">
              <span className="settings-label">Score threshold</span>
              <input
                id="quiz-threshold"
                className="settings-input settings-input-number"
                type="number"
                min={1}
                value={scoreThreshold}
                onChange={(event) => setScoreThreshold(event.target.value)}
              />
            </label>
          ) : null}

          {localError ? <p className="error-note">{localError}</p> : null}
          {error ? <p className="error-note">{error}</p> : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="hud-button" onClick={onClose}>
            cancel
          </button>
          <button
            type="button"
            className="hud-button"
            disabled={isSaving}
            onClick={() => {
              const parsedQuestionCount = Number(questionCount);

              if (!Number.isInteger(parsedQuestionCount) || parsedQuestionCount < 1 || parsedQuestionCount > 12) {
                setLocalError("Question count must be between 1 and 12.");
                return;
              }

              let normalizedThreshold: number | null = null;

              if (validationMode === "score_threshold") {
                const parsedThreshold = Number(scoreThreshold);

                if (
                  !Number.isInteger(parsedThreshold) ||
                  parsedThreshold < 1 ||
                  parsedThreshold > parsedQuestionCount
                ) {
                  setLocalError("Threshold must be between 1 and question count.");
                  return;
                }

                normalizedThreshold = parsedThreshold;
              }

              setLocalError(null);
              onSave({
                quiz: {
                  gateEnabled,
                  questionCount: parsedQuestionCount,
                  scope,
                  validationMode,
                  scoreThreshold: normalizedThreshold,
                  providerPreference,
                },
              });
            }}
          >
            {isSaving ? "saving..." : "save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
