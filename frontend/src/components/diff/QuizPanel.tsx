import type { QuizSession, QuizSettings } from "@diffx/contracts";

type QuizPanelProps = {
  quizSettings: QuizSettings;
  commitMessageDraft: string;
  session: QuizSession | null;
  isLoadingSession: boolean;
  isCreatingSession: boolean;
  isSubmittingAnswers: boolean;
  isValidating: boolean;
  streamError: string | null;
  commitUnlocked: boolean;
  bypassAvailable: boolean;
  bypassArmed: boolean;
  onStartQuiz: () => void;
  onRegenerateQuiz: () => void;
  onSelectAnswer: (questionId: string, optionIndex: number) => void;
  onValidateQuiz: () => void;
  onBypassOnce: () => void;
  onOpenSettings: () => void;
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

function toScopeSummary(settings: QuizSettings): string {
  return settings.scope === "all_changes" ? "all changes" : "staged changes";
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

export function QuizPanel({
  quizSettings,
  commitMessageDraft,
  session,
  isLoadingSession,
  isCreatingSession,
  isSubmittingAnswers,
  isValidating,
  streamError,
  commitUnlocked,
  bypassAvailable,
  bypassArmed,
  onStartQuiz,
  onRegenerateQuiz,
  onSelectAnswer,
  onValidateQuiz,
  onBypassOnce,
  onOpenSettings,
}: QuizPanelProps) {
  const trimmedCommitMessage = commitMessageDraft.trim();
  const hasCommitMessage = trimmedCommitMessage.length > 0;

  if (!session) {
    return (
      <div className="quiz-panel">
        <div className="quiz-hero">
          <div className="quiz-hero-copy">
            <p className="hud-label">quiz preflight</p>
            <p className="quiz-headline">Confirm understanding before you commit</p>
            <p className="inline-note">
              Generate questions from current diff context. Commit message is optional for quiz
              generation.
            </p>
          </div>

          <div className="quiz-actions-row">
            <button
              className="hud-button"
              type="button"
              disabled={isCreatingSession || isLoadingSession}
              onClick={onStartQuiz}
            >
              {isCreatingSession || isLoadingSession ? "generating..." : "generate tests"}
            </button>
            <button className="hud-button" type="button" onClick={onOpenSettings}>
              quiz settings
            </button>
          </div>
        </div>

        <div className="quiz-preflight-grid" role="status" aria-label="Quiz preflight summary">
          <div className="quiz-preflight-item">
            <p className="hud-label">commit message</p>
            {hasCommitMessage ? (
              <p className="quiz-preflight-value">{trimmedCommitMessage}</p>
            ) : (
              <p className="inline-note">No draft message yet (optional for quiz start).</p>
            )}
          </div>

          <div className="quiz-preflight-item">
            <p className="hud-label">generation scope</p>
            <p className="quiz-preflight-value">{toScopeSummary(quizSettings)}</p>
          </div>

          <div className="quiz-preflight-item">
            <p className="hud-label">question count</p>
            <p className="quiz-preflight-value">{quizSettings.questionCount}</p>
          </div>

          <div className="quiz-preflight-item">
            <p className="hud-label">validation policy</p>
            <p className="quiz-preflight-value">{toValidationPolicySummary(quizSettings)}</p>
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
            <p className="inline-note">{isCreatingSession || isLoadingSession ? "Preparing quiz..." : progressLabel}</p>
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
          <button className="hud-button" type="button" onClick={onRegenerateQuiz}>
            generate tests
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
        <button className="hud-button" type="button" onClick={onRegenerateQuiz}>
          generate tests again
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
