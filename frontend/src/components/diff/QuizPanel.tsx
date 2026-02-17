import type { QuizSession } from "@diffx/contracts";

type QuizPanelProps = {
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

export function QuizPanel({
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
}: QuizPanelProps) {
  if (!session) {
    return (
      <div className="quiz-panel">
        <p className="empty-state">No quiz session is active yet.</p>
        <button className="hud-button" type="button" onClick={onStartQuiz}>
          start quiz
        </button>
      </div>
    );
  }

  const progressLabel = `${session.progress.message} (${session.progress.percent}%)`;

  if (session.status === "queued" || session.status === "streaming") {
    return (
      <div className="quiz-panel">
        <p className="inline-note">{isCreatingSession || isLoadingSession ? "Preparing quiz..." : progressLabel}</p>
        {streamError ? <p className="error-note">{streamError}</p> : null}
      </div>
    );
  }

  if (session.status === "failed") {
    return (
      <div className="quiz-panel">
        <p className="error-note">{session.failure?.message ?? "Quiz generation failed."}</p>
        <div className="quiz-actions-row">
          <button className="hud-button" type="button" onClick={onRegenerateQuiz}>
            regenerate quiz
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
  const validationMessage = toValidationMessage(session);

  return (
    <div className="quiz-panel">
      <div className="quiz-header">
        <p className="hud-label">{session.quiz.title}</p>
        <p className="inline-note">
          answered {answeredCount}/{session.quiz.questions.length}
        </p>
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

                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      className={selected ? "hud-button hud-button-active" : "hud-button"}
                      type="button"
                      disabled={isSubmittingAnswers || isValidating}
                      onClick={() => onSelectAnswer(question.id, optionIndex)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
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
          new quiz
        </button>
      </div>
    </div>
  );
}
