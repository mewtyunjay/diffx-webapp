import { useEffect, useRef, useState } from "react";
import type {
  QuizGenerationScope,
  QuizSession,
  QuizSettings,
  QuizValidationMode,
} from "@diffx/contracts";

const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 12;

type DropdownOption = {
  value: string;
  label: string;
};

const SCOPE_OPTIONS: DropdownOption[] = [
  { value: "all_changes", label: "all files" },
  { value: "staged", label: "staged only" },
];

const VALIDATION_OPTIONS: DropdownOption[] = [
  { value: "answer_all", label: "answer all" },
  { value: "pass_all", label: "pass all" },
  { value: "score_threshold", label: "score threshold" },
];

const QUESTION_COUNT_OPTIONS: DropdownOption[] = Array.from(
  { length: MAX_QUESTION_COUNT - MIN_QUESTION_COUNT + 1 },
  (_, index) => {
    const value = String(MIN_QUESTION_COUNT + index);

    return {
      value,
      label: value,
    };
  },
);

type QuizSettingsDropdownProps = {
  id: string;
  label: string;
  value: string;
  options: DropdownOption[];
  disabled: boolean;
  onChange: (nextValue: string) => void;
};

function QuizSettingsDropdown({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: QuizSettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null;
  const selectedLabel = selectedOption?.label ?? "";
  const listboxId = `${id}-listbox`;

  return (
    <div className="settings-dropdown" ref={rootRef}>
      <button
        className="settings-input settings-dropdown-trigger"
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className="settings-dropdown-value">{selectedLabel}</span>
        <span
          className={open ? "settings-dropdown-caret settings-dropdown-caret-open" : "settings-dropdown-caret"}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="settings-dropdown-menu" role="listbox" id={listboxId} aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                className={
                  selected
                    ? "settings-dropdown-option settings-dropdown-option-selected"
                    : "settings-dropdown-option"
                }
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <span className="settings-dropdown-check">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type QuizPanelProps = {
  quizSettings: QuizSettings;
  session: QuizSession | null;
  isLoadingSession: boolean;
  isCreatingSession: boolean;
  isSavingSettings: boolean;
  isSubmittingAnswers: boolean;
  isValidating: boolean;
  streamError: string | null;
  commitUnlocked: boolean;
  bypassAvailable: boolean;
  bypassArmed: boolean;
  onStartQuiz: () => void;
  onClearQuiz: () => void;
  onSelectAnswer: (questionId: string, optionIndex: number) => void;
  onValidateQuiz: () => void;
  onBypassOnce: () => void;
  onUpdateQuizSettings: (nextQuizSettings: QuizSettings) => void;
};

function toValidationMessage(session: QuizSession): string | null {
  if (!session.validation) {
    return null;
  }

  const result = session.validation;
  const scoreText = `${result.correctCount}/${result.totalQuestions}`;

  if (result.mode === "score_threshold") {
    return `score ${scoreText}; threshold ${result.scoreThreshold ?? 0}. ${
      result.passed ? "passed" : "not passed"
    }.`;
  }

  return `${result.mode}: ${result.passed ? "passed" : "not passed"} (${scoreText})`;
}

function toValidationPolicySummary(settings: QuizSettings): string {
  if (settings.validationMode === "score_threshold") {
    return `score threshold (${settings.scoreThreshold ?? "unset"} correct answers)`;
  }

  return settings.validationMode === "answer_all"
    ? "answer all questions"
    : "all answers must be correct";
}

function toOptionKey(optionIndex: number): string {
  return String.fromCharCode(65 + optionIndex);
}

function toResultSummary(session: QuizSession): string | null {
  if (!session.validation) {
    return null;
  }

  const result = session.validation;
  const scoreLabel = `${result.correctCount}/${result.totalQuestions}`;
  const base = result.passed ? "passed" : "not passed";

  if (result.mode === "score_threshold") {
    return `${base} - score ${scoreLabel} (threshold ${result.scoreThreshold ?? 0})`;
  }

  return `${base} - score ${scoreLabel}`;
}

function normalizeScoreThreshold(mode: QuizValidationMode, threshold: number | null, questionCount: number) {
  if (mode !== "score_threshold") {
    return null;
  }

  if (threshold === null) {
    return questionCount;
  }

  return Math.min(questionCount, Math.max(1, threshold));
}

function normalizeQuestionCount(rawValue: number): number {
  return Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, rawValue));
}

export function QuizPanel({
  quizSettings,
  session,
  isLoadingSession,
  isCreatingSession,
  isSavingSettings,
  isSubmittingAnswers,
  isValidating,
  streamError,
  commitUnlocked,
  bypassAvailable,
  bypassArmed,
  onStartQuiz,
  onClearQuiz,
  onSelectAnswer,
  onValidateQuiz,
  onBypassOnce,
  onUpdateQuizSettings,
}: QuizPanelProps) {
  if (!session) {
    const controlsDisabled = isCreatingSession || isLoadingSession || isSavingSettings;
    const scoreThreshold = quizSettings.scoreThreshold ?? quizSettings.questionCount;
    const thresholdOptions: DropdownOption[] = Array.from(
      { length: quizSettings.questionCount },
      (_, index) => {
        const value = String(index + 1);

        return {
          value,
          label: value,
        };
      },
    );

    return (
      <div className="quiz-panel">
        <div className="quiz-prestart-layout">
          <p className="quiz-page-title">Precommit Quiz</p>

          <div className="quiz-inline-settings" role="form" aria-label="Quiz setup">
            <div className="quiz-inline-setting">
              <span className="hud-label">Scope</span>
              <QuizSettingsDropdown
                id="quiz-inline-scope"
                label="Scope"
                disabled={controlsDisabled}
                value={quizSettings.scope}
                options={SCOPE_OPTIONS}
                onChange={(nextValue) => {
                  onUpdateQuizSettings({
                    ...quizSettings,
                    scope: nextValue as QuizGenerationScope,
                  });
                }}
              />
            </div>

            <div className="quiz-inline-setting">
              <span className="hud-label">Question count</span>
              <QuizSettingsDropdown
                id="quiz-inline-question-count"
                label="Question count"
                disabled={controlsDisabled}
                value={String(quizSettings.questionCount)}
                options={QUESTION_COUNT_OPTIONS}
                onChange={(nextValue) => {
                  const parsed = Number(nextValue);

                  if (!Number.isInteger(parsed)) {
                    return;
                  }

                  const questionCount = normalizeQuestionCount(parsed);

                  onUpdateQuizSettings({
                    ...quizSettings,
                    questionCount,
                    scoreThreshold: normalizeScoreThreshold(
                      quizSettings.validationMode,
                      quizSettings.scoreThreshold,
                      questionCount,
                    ),
                  });
                }}
              />
            </div>

            <div className="quiz-inline-setting">
              <span className="hud-label">Validation mode</span>
              <QuizSettingsDropdown
                id="quiz-inline-validation-mode"
                label="Validation mode"
                disabled={controlsDisabled}
                value={quizSettings.validationMode}
                options={VALIDATION_OPTIONS}
                onChange={(nextValue) => {
                  const mode = nextValue as QuizValidationMode;

                  onUpdateQuizSettings({
                    ...quizSettings,
                    validationMode: mode,
                    scoreThreshold: normalizeScoreThreshold(
                      mode,
                      quizSettings.scoreThreshold,
                      quizSettings.questionCount,
                    ),
                  });
                }}
              />
            </div>

            {quizSettings.validationMode === "score_threshold" ? (
              <div className="quiz-inline-setting">
                <span className="hud-label">Score threshold</span>
                <QuizSettingsDropdown
                  id="quiz-inline-threshold"
                  label="Score threshold"
                  disabled={controlsDisabled}
                  value={String(scoreThreshold)}
                  options={thresholdOptions}
                  onChange={(nextValue) => {
                    const parsed = Number(nextValue);

                    if (!Number.isInteger(parsed)) {
                      return;
                    }

                    const threshold = Math.min(quizSettings.questionCount, Math.max(1, parsed));

                    onUpdateQuizSettings({
                      ...quizSettings,
                      scoreThreshold: threshold,
                    });
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="quiz-generate-dock">
            <button
              className="hud-button quiz-generate-button"
              type="button"
              disabled={controlsDisabled}
              onClick={onStartQuiz}
            >
              {isCreatingSession || isLoadingSession ? "generating..." : "generate quiz"}
            </button>
          </div>
        </div>

        {streamError ? <p className="error-note">{streamError}</p> : null}
      </div>
    );
  }

  const progressLabel = `${session.progress.message} (${session.progress.percent}%)`;
  const progressPercent = Math.min(100, Math.max(0, session.progress.percent));

  if (session.status === "queued" || session.status === "streaming") {
    return (
      <div className="quiz-panel">
        <div className="quiz-hero">
          <div className="quiz-hero-copy">
            <p className="hud-label">quiz generation</p>
            <p className="quiz-headline">Building your readiness check</p>
            <p className="inline-note">
              {isCreatingSession || isLoadingSession ? "Preparing quiz..." : progressLabel}
            </p>
          </div>
        </div>
        <div
          className="quiz-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <span className="quiz-progress-fill" style={{ width: `${Math.max(progressPercent, 4)}%` }} />
        </div>
        {streamError ? <p className="error-note">{streamError}</p> : null}
      </div>
    );
  }

  if (session.status === "failed") {
    return (
      <div className="quiz-panel">
        <div className="quiz-hero">
          <div className="quiz-hero-copy">
            <p className="hud-label">quiz generation failed</p>
            <p className="quiz-headline">Quiz could not be generated</p>
          </div>
        </div>
        <p className="error-note">{session.failure?.message ?? "Quiz generation failed."}</p>
        <div className="quiz-actions-row">
          <button
            className="hud-button"
            type="button"
            disabled={isCreatingSession || isLoadingSession}
            onClick={onStartQuiz}
          >
            {isCreatingSession || isLoadingSession ? "generating..." : "generate quiz"}
          </button>
          <button className="hud-button" type="button" onClick={onClearQuiz}>
            clear quiz
          </button>
          {bypassAvailable ? (
            <button className="hud-button" type="button" onClick={onBypassOnce}>
              {bypassArmed ? "bypass armed" : "bypass once"}
            </button>
          ) : null}
        </div>
        {streamError ? <p className="error-note">{streamError}</p> : null}
      </div>
    );
  }

  if (!session.quiz) {
    return (
      <div className="quiz-panel">
        <p className="empty-state">Quiz payload is unavailable.</p>
      </div>
    );
  }

  const answeredCount = session.quiz.questions.reduce((count, question) => {
    return session.answers[question.id] === undefined ? count : count + 1;
  }, 0);

  const allAnswered = answeredCount === session.quiz.questions.length;
  const hasValidationResult = session.validation !== null;
  const validationMessage = toValidationMessage(session);
  const resultSummary = toResultSummary(session);

  return (
    <div className="quiz-panel">
      <div className="quiz-header-card">
        <div className="quiz-header-copy">
          <p className="hud-label">{session.quiz.title}</p>
          <p className="quiz-headline">Answer all prompts before validation</p>
        </div>
        <div className="quiz-status-pills" aria-label="Quiz progress summary">
          <span className="quiz-pill">
            answered {answeredCount}/{session.quiz.questions.length}
          </span>
          <span className="quiz-pill">policy: {toValidationPolicySummary(quizSettings)}</span>
        </div>
      </div>

      {validationMessage ? <p className="inline-note">{validationMessage}</p> : null}
      {commitUnlocked ? <p className="text-bright">Commit unlocked. Return to Files and click commit.</p> : null}
      {streamError ? <p className="error-note">{streamError}</p> : null}

      <div className="quiz-questions">
        {session.quiz.questions.map((question, index) => {
          const selectedOption = session.answers[question.id];

          return (
            <article key={question.id} className="quiz-card">
              <p className="hud-label">question {index + 1}</p>
              <p className="quiz-prompt">{question.prompt}</p>

              {question.snippet ? <pre className="quiz-snippet">{question.snippet}</pre> : null}

              <div className="quiz-options">
                {question.options.map((option, optionIndex) => {
                  const selected = selectedOption === optionIndex;
                  const isCorrect = optionIndex === question.correctOptionIndex;

                  const buttonClassName = [
                    "quiz-option-button",
                    selected ? "quiz-option-button-selected" : null,
                    hasValidationResult && isCorrect ? "quiz-option-button-correct" : null,
                    hasValidationResult && selected && !isCorrect ? "quiz-option-button-incorrect" : null,
                  ]
                    .filter((className): className is string => Boolean(className))
                    .join(" ");

                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      className={buttonClassName}
                      type="button"
                      disabled={isSubmittingAnswers || isValidating}
                      onClick={() => onSelectAnswer(question.id, optionIndex)}
                    >
                      <span className="quiz-option-key">{toOptionKey(optionIndex)}</span>
                      <span className="quiz-option-copy">{option}</span>
                    </button>
                  );
                })}
              </div>

              {hasValidationResult ? (
                <p
                  className={
                    selectedOption === question.correctOptionIndex
                      ? "quiz-answer-feedback quiz-answer-feedback-correct"
                      : "quiz-answer-feedback quiz-answer-feedback-incorrect"
                  }
                >
                  {selectedOption === question.correctOptionIndex
                    ? "correct"
                    : `incorrect - correct answer is ${toOptionKey(question.correctOptionIndex)}`}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="quiz-footer-row" role="status" aria-live="polite">
        <div className="quiz-actions-row">
          <button
            className="hud-button"
            type="button"
            disabled={!allAnswered || isSubmittingAnswers || isValidating}
            onClick={onValidateQuiz}
          >
            {isValidating ? "validating..." : "validate quiz"}
          </button>
          <button className="hud-button" type="button" onClick={onClearQuiz}>
            clear quiz
          </button>
        </div>

        {resultSummary ? (
          <p
            className={
              session.validation?.passed
                ? "quiz-score-value quiz-score-value-passed quiz-footer-result"
                : "quiz-score-value quiz-score-value-failed quiz-footer-result"
            }
          >
            {resultSummary}
          </p>
        ) : (
          <p className="inline-note quiz-footer-hint">Validate quiz to see score and option feedback.</p>
        )}
      </div>
    </div>
  );
}
