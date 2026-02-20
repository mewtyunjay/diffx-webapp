import type {
  QuizGenerationScope,
  QuizSession,
  QuizSettings,
  QuizValidationMode,
} from "@diffx/contracts";

const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 12;

const SCOPE_OPTIONS: Array<{ value: QuizGenerationScope; label: string }> = [
  { value: "all_changes", label: "all files" },
  { value: "staged", label: "staged only" },
];

const VALIDATION_OPTIONS: Array<{ value: QuizValidationMode; label: string }> = [
  { value: "answer_all", label: "answer all" },
  { value: "pass_all", label: "pass all" },
  { value: "score_threshold", label: "score threshold" },
];

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

    return (
      <div className="quiz-panel">
        <div className="quiz-prestart-layout">
          <p className="quiz-page-title">Precommit Quiz</p>

          <div className="quiz-inline-settings" role="form" aria-label="Quiz setup">
            <div className="quiz-inline-setting">
              <p className="hud-label">Scope</p>
              <div className="settings-segment" role="radiogroup" aria-label="Quiz generation scope">
                {SCOPE_OPTIONS.map((option) => {
                  const selected = quizSettings.scope === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={controlsDisabled}
                      className={
                        selected
                          ? "settings-segment-button settings-segment-button-selected"
                          : "settings-segment-button"
                      }
                      onClick={() => {
                        onUpdateQuizSettings({
                          ...quizSettings,
                          scope: option.value,
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="quiz-inline-setting" htmlFor="quiz-inline-question-count">
              <span className="hud-label">Question count</span>
              <input
                id="quiz-inline-question-count"
                className="settings-input settings-input-number"
                type="number"
                min={MIN_QUESTION_COUNT}
                max={MAX_QUESTION_COUNT}
                disabled={controlsDisabled}
                value={quizSettings.questionCount}
                onChange={(event) => {
                  const parsed = Number(event.target.value);

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
            </label>

            <div className="quiz-inline-setting">
              <p className="hud-label">Validation mode</p>
              <div className="settings-segment" role="radiogroup" aria-label="Quiz validation mode">
                {VALIDATION_OPTIONS.map((option) => {
                  const selected = quizSettings.validationMode === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={controlsDisabled}
                      className={
                        selected
                          ? "settings-segment-button settings-segment-button-selected"
                          : "settings-segment-button"
                      }
                      onClick={() => {
                        onUpdateQuizSettings({
                          ...quizSettings,
                          validationMode: option.value,
                          scoreThreshold: normalizeScoreThreshold(
                            option.value,
                            quizSettings.scoreThreshold,
                            quizSettings.questionCount,
                          ),
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {quizSettings.validationMode === "score_threshold" ? (
              <label className="quiz-inline-setting" htmlFor="quiz-inline-threshold">
                <span className="hud-label">Score threshold</span>
                <input
                  id="quiz-inline-threshold"
                  className="settings-input settings-input-number"
                  type="number"
                  min={1}
                  max={quizSettings.questionCount}
                  disabled={controlsDisabled}
                  value={quizSettings.scoreThreshold ?? quizSettings.questionCount}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);

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
              </label>
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

      <div className="quiz-score-footer" role="status" aria-live="polite">
        <p className="hud-label">quiz score</p>
        {resultSummary ? (
          <p
            className={
              session.validation?.passed
                ? "quiz-score-value quiz-score-value-passed"
                : "quiz-score-value quiz-score-value-failed"
            }
          >
            {resultSummary}
          </p>
        ) : (
          <p className="inline-note">Validate quiz to see score and option feedback.</p>
        )}
      </div>
    </div>
  );
}
