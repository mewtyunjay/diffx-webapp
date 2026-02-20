import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuizSession, QuizSettings } from "@diffx/contracts";
import { QuizPanel } from "./QuizPanel";

const QUIZ_SETTINGS: QuizSettings = {
  gateEnabled: true,
  questionCount: 4,
  scope: "all_changes",
  validationMode: "answer_all",
  scoreThreshold: null,
  providerPreference: "codex",
};

function buildSession(status: QuizSession["status"]): QuizSession {
  return {
    id: "quiz-session",
    status,
    sourceFingerprint: "fingerprint",
    commitMessageDraft: "wire quiz",
    createdAt: "2026-02-17T00:00:00.000Z",
    updatedAt: "2026-02-17T00:00:00.000Z",
    progress: {
      phase: status === "queued" ? "queued" : "validating",
      percent: status === "queued" ? 0 : 100,
      message: status === "queued" ? "Session queued." : "Quiz ready.",
    },
    quiz:
      status === "queued" || status === "failed"
        ? null
        : {
            title: "Commit readiness quiz",
            generatedAt: "2026-02-17T00:00:00.000Z",
            questions: [
              {
                id: "q-1",
                prompt: "Question 1",
                snippet: null,
                options: ["Alpha", "Beta", "Gamma", "Delta"],
                correctOptionIndex: 0,
                explanation: null,
                tags: [],
              },
            ],
          },
    answers: status === "validated" ? { "q-1": 0 } : {},
    validation:
      status === "validated"
        ? {
            mode: "answer_all",
            passed: true,
            answeredCount: 1,
            correctCount: 1,
            totalQuestions: 1,
            score: 1,
            scoreThreshold: null,
          }
        : null,
    failure:
      status === "failed"
        ? {
            message: "generation failed",
            retryable: false,
          }
        : null,
  };
}

type RenderOverrides = Partial<React.ComponentProps<typeof QuizPanel>>;

function renderQuizPanel(overrides: RenderOverrides = {}) {
  const defaultProps: React.ComponentProps<typeof QuizPanel> = {
    quizSettings: QUIZ_SETTINGS,
    session: null,
    isLoadingSession: false,
    isCreatingSession: false,
    isSavingSettings: false,
    isSubmittingAnswers: false,
    isValidating: false,
    streamError: null,
    commitUnlocked: false,
    bypassAvailable: false,
    bypassArmed: false,
    onStartQuiz: vi.fn(),
    onClearQuiz: vi.fn(),
    onSelectAnswer: vi.fn(),
    onValidateQuiz: vi.fn(),
    onBypassOnce: vi.fn(),
    onUpdateQuizSettings: vi.fn(),
  };

  const props = {
    ...defaultProps,
    ...overrides,
  };

  render(<QuizPanel {...props} />);
  return props;
}

describe("QuizPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders start state and starts generation", () => {
    const props = renderQuizPanel();

    expect(screen.getByText("Precommit Quiz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "generate quiz" }));
    expect(props.onStartQuiz).toHaveBeenCalledTimes(1);
  });

  it("updates inline quiz settings before generation", () => {
    const onUpdateQuizSettings = vi.fn();

    renderQuizPanel({
      quizSettings: {
        ...QUIZ_SETTINGS,
        validationMode: "score_threshold",
        scoreThreshold: 2,
      },
      onUpdateQuizSettings,
    });

    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(screen.getByRole("option", { name: "staged only" }));
    expect(onUpdateQuizSettings).toHaveBeenCalledWith({
      ...QUIZ_SETTINGS,
      validationMode: "score_threshold",
      scoreThreshold: 2,
      scope: "staged",
    });

    fireEvent.click(screen.getByRole("button", { name: "Question count" }));
    fireEvent.click(screen.getByRole("option", { name: "5" }));
    expect(onUpdateQuizSettings).toHaveBeenCalledWith({
      ...QUIZ_SETTINGS,
      validationMode: "score_threshold",
      scoreThreshold: 2,
      questionCount: 5,
    });
  });

  it("renders failed state with bypass and clear actions", () => {
    const props = renderQuizPanel({
      session: buildSession("failed"),
      bypassAvailable: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "bypass once" }));
    expect(props.onBypassOnce).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "clear quiz" }));
    expect(props.onClearQuiz).toHaveBeenCalledTimes(1);
  });

  it("enables validation when all questions are answered and supports clearing", () => {
    const session = buildSession("ready");
    session.answers = { "q-1": 0 };

    const props = renderQuizPanel({ session });

    fireEvent.click(screen.getByRole("button", { name: "validate quiz" }));
    expect(props.onValidateQuiz).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "clear quiz" }));
    expect(props.onClearQuiz).toHaveBeenCalledTimes(1);
  });

  it("shows red/green option feedback and score after validation", () => {
    const session = buildSession("ready");
    session.answers = { "q-1": 1 };
    session.validation = {
      mode: "answer_all",
      passed: false,
      answeredCount: 1,
      correctCount: 0,
      totalQuestions: 1,
      score: 0,
      scoreThreshold: null,
    };

    renderQuizPanel({ session });

    expect(screen.getByRole("button", { name: /Alpha/i })).toHaveClass("quiz-option-button-correct");
    expect(screen.getByRole("button", { name: /Beta/i })).toHaveClass("quiz-option-button-incorrect");
    expect(screen.getByText("not passed - score 0/1")).toBeInTheDocument();
  });
});
