import { useEffect, useState } from "react";
import type { AppSettings, QuizGenerationScope, QuizValidationMode } from "@diffx/contracts";

type SettingsModalProps = {
  open: boolean;
  settings: AppSettings;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
};

export function SettingsModal({
  open,
  settings,
  isSaving,
  error,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [gateEnabled, setGateEnabled] = useState(settings.quiz.gateEnabled);
  const [questionCount, setQuestionCount] = useState(String(settings.quiz.questionCount));
  const [scope, setScope] = useState<QuizGenerationScope>(settings.quiz.scope);
  const [validationMode, setValidationMode] = useState<QuizValidationMode>(settings.quiz.validationMode);
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
          <label className="settings-row">
            <span className="settings-label">Quiz gate</span>
            <input
              type="checkbox"
              checked={gateEnabled}
              onChange={(event) => setGateEnabled(event.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span className="settings-label">Question count</span>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={12}
              value={questionCount}
              onChange={(event) => setQuestionCount(event.target.value)}
            />
          </label>

          <label className="settings-row">
            <span className="settings-label">Generation scope</span>
            <select
              className="settings-input"
              value={scope}
              onChange={(event) => setScope(event.target.value as QuizGenerationScope)}
            >
              <option value="staged">staged files</option>
              <option value="selected_file">selected file</option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-label">Validation mode</span>
            <select
              className="settings-input"
              value={validationMode}
              onChange={(event) => setValidationMode(event.target.value as QuizValidationMode)}
            >
              <option value="answer_all">answer_all</option>
              <option value="pass_all">pass_all</option>
              <option value="score_threshold">score_threshold</option>
            </select>
          </label>

          {validationMode === "score_threshold" ? (
            <label className="settings-row">
              <span className="settings-label">Score threshold</span>
              <input
                className="settings-input"
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
