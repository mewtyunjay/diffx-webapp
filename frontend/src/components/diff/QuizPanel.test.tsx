import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuizSession, QuizSettings } from "@diffx/contracts";
import { QuizPanel } from "./QuizPanel";

const QUIZ_SETTINGS: QuizSettings = {
  gateEnabled: true,
  questionCount: 4,
  scope: "staged",
  validationMode: "answer_all",
  scoreThreshold: null,
};

function buildSession(status: QuizSession["status"]): QuizSession {
  return {
    id: "quiz-session",
    status,
    sourceFingerprint: "fingerprint",
    commitMessageDraft: "wire quiz",
    selectedPath: "frontend/src/App.tsx",
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

describe("QuizPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders start state when no session exists", () => {
    const onStartQuiz = vi.fn();

    render(
      <QuizPanel
        quizSettings={QUIZ_SETTINGS}
        commitMessageDraft="ship files dock"
        session={null}
        isLoadingSession={false}
        isCreatingSession={false}
        isSubmittingAnswers={false}
        isValidating={false}
        streamError={null}
        commitUnlocked={false}
        bypassAvailable={false}
        bypassArmed={false}
        onStartQuiz={onStartQuiz}
        onRegenerateQuiz={() => undefined}
        onSelectAnswer={() => undefined}
        onValidateQuiz={() => undefined}
        onBypassOnce={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "generate tests" }));
    expect(onStartQuiz).toHaveBeenCalledTimes(1);
  });

  it("shows preflight summary and allows start without commit draft", () => {
    const onStartQuiz = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <QuizPanel
        quizSettings={{
          gateEnabled: true,
          questionCount: 5,
          scope: "all_changes",
          validationMode: "score_threshold",
          scoreThreshold: 4,
        }}
        commitMessageDraft=""
        session={null}
        isLoadingSession={false}
        isCreatingSession={false}
        isSubmittingAnswers={false}
        isValidating={false}
        streamError={null}
        commitUnlocked={false}
        bypassAvailable={false}
        bypassArmed={false}
        onStartQuiz={onStartQuiz}
        onRegenerateQuiz={() => undefined}
        onSelectAnswer={() => undefined}
        onValidateQuiz={() => undefined}
        onBypassOnce={() => undefined}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByText("quiz preflight")).toBeInTheDocument();
    expect(screen.getByText("No draft message yet (optional for quiz start)."))
      .toBeInTheDocument();
    expect(screen.getByText("score threshold (4 correct answers)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "generate tests" }));
    expect(onStartQuiz).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "quiz settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("renders failed state with bypass action", () => {
    const onBypassOnce = vi.fn();

    render(
      <QuizPanel
        quizSettings={QUIZ_SETTINGS}
        commitMessageDraft="ship files dock"
        session={buildSession("failed")}
        isLoadingSession={false}
        isCreatingSession={false}
        isSubmittingAnswers={false}
        isValidating={false}
        streamError={null}
        commitUnlocked={false}
        bypassAvailable
        bypassArmed={false}
        onStartQuiz={() => undefined}
        onRegenerateQuiz={() => undefined}
        onSelectAnswer={() => undefined}
        onValidateQuiz={() => undefined}
        onBypassOnce={onBypassOnce}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "bypass once" }));
    expect(onBypassOnce).toHaveBeenCalledTimes(1);
  });

  it("enables validation when all questions are answered", () => {
    const onValidateQuiz = vi.fn();
    const session = buildSession("ready");
    session.answers = { "q-1": 0 };

    render(
      <QuizPanel
        quizSettings={QUIZ_SETTINGS}
        commitMessageDraft="ship files dock"
        session={session}
        isLoadingSession={false}
        isCreatingSession={false}
        isSubmittingAnswers={false}
        isValidating={false}
        streamError={null}
        commitUnlocked={false}
        bypassAvailable={false}
        bypassArmed={false}
        onStartQuiz={() => undefined}
        onRegenerateQuiz={() => undefined}
        onSelectAnswer={() => undefined}
        onValidateQuiz={onValidateQuiz}
        onBypassOnce={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "validate quiz" }));
    expect(onValidateQuiz).toHaveBeenCalledTimes(1);
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

    render(
      <QuizPanel
        quizSettings={QUIZ_SETTINGS}
        commitMessageDraft="ship files dock"
        session={session}
        isLoadingSession={false}
        isCreatingSession={false}
        isSubmittingAnswers={false}
        isValidating={false}
        streamError={null}
        commitUnlocked={false}
        bypassAvailable={false}
        bypassArmed={false}
        onStartQuiz={() => undefined}
        onRegenerateQuiz={() => undefined}
        onSelectAnswer={() => undefined}
        onValidateQuiz={() => undefined}
        onBypassOnce={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /Alpha/i })).toHaveClass("quiz-option-button-correct");
    expect(screen.getByRole("button", { name: /Beta/i })).toHaveClass("quiz-option-button-incorrect");
    expect(screen.getByText("not passed - score 0/1")).toBeInTheDocument();
  });
});
